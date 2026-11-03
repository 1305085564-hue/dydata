import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildFreezePackage, verifyFreezePackage, freezeRequestBudget, freezeStateAt } from './cutover-freeze.mjs';
const sha = x => createHash('sha256').update(x).digest('hex');
const snapshot = Array.from({length:1200},(_,i)=>({kind:'table',name:`table_${String(i).padStart(4,'0')}`,args:null,col:null,owner:'postgres',grants:[{role:'authenticated',privilege:'SELECT',grantable:false}]}));
const input = {snapshot,project:'gcrhhxaopomtposmahsw',opensAt:'2026-11-03T05:00:00Z',closesAt:'2026-11-03T07:00:00Z',maxBytes:280000};
test('deterministic object batches bind complete ACL, window, SQL and transport budget',()=>{
 const p=buildFreezePackage(input);assert.ok(p.applyBatches.length>1);
 assert.deepEqual(p,buildFreezePackage(input));
 assert.equal(p.applyBatches.reduce((n,b)=>n+b.end-b.start,0),snapshot.length);
 assert.deepEqual(p.rollbackBatches.map(b=>[b.start,b.end]),p.applyBatches.map(b=>[b.start,b.end]).reverse());
 for(const b of [...p.applyBatches,...p.rollbackBatches]){
  assert.equal(b.sha256,sha(b.sql));assert.ok(b.headroomBytes>1500);assert.ok(b.requestBytes<280000);
  assert.match(b.sql,/Freeze ACL baseline drift/);assert.match(b.sql,/Freeze ACL post-state drift/);
  assert.equal((b.sql.match(/Outside authorized freeze window/g)||[]).length,2);
  assert.match(b.sql,/BEGIN;[\s\S]*COMMIT;/);
 }
 assert.equal(verifyFreezePackage(p,p.packageSha256).packageSha256,p.packageSha256);
 assert.equal(p.apply,undefined); // no obsolete unbounded single-package SQL
});
test('package, individual batch and boundary tampering are rejected',()=>{
 const p=buildFreezePackage(input);
 for(const mutate of [x=>x.applyBatches[0].sql+=' ',x=>x.rollbackBatches[0].start++,x=>x.snapshot[0].owner='other',x=>x.closesAt='2026-11-03T08:00:00Z']){
  const q=structuredClone(p);mutate(q);assert.throws(()=>verifyFreezePackage(q,p.packageSha256),/mismatch|Invalid/);
 }
 assert.throws(()=>buildFreezePackage({...input,maxBytes:491521}),/budget/);
});
test('transport channels are explicit; CloudBase includes JSON Sql envelope',()=>{
 const sql='SELECT \'中文\\x\';';
 assert.equal(freezeRequestBudget(sql,'postgres').requestBytes,Buffer.byteLength(sql));
 assert.equal(freezeRequestBudget(sql,'cloudbase').requestBytes,Buffer.byteLength(JSON.stringify({EnvId:'dydata-d6g0gd1v37fcddf21',Sql:sql})));
 assert.throws(()=>freezeRequestBudget(sql,'unknown'),/channel/);
});
test('partial freeze frontier predicts exact complete state for safe reverse restore',()=>{
 assert.deepEqual(freezeStateAt(snapshot,0),snapshot);
 const s=freezeStateAt(snapshot,3);assert.equal(s.length,1200);assert.deepEqual(s[2].grants,[]);assert.deepEqual(s[3],snapshot[3]);
 assert.throws(()=>freezeStateAt(snapshot,1201),/frontier/);
});

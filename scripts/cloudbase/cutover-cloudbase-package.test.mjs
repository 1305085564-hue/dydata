import assert from 'node:assert/strict';
import test from 'node:test';
import { runBatches } from './sql-batches.mjs';
import { buildCloudBaseCutoverPackage } from './cutover-cloudbase-package.mjs';
function input() {
  const tables = Array.from({length:99},(_,i)=>({name:`t${i}`,columns:['id'],typeColumns:['id'],generatedColumns:[],rowCount:0}));
  const sourceAuth = Array.from({length:84},(_,i)=>({id:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,email:`synthetic-${i}@example.invalid`,encrypted_password:'$2a$10$'+'A'.repeat(53),email_confirmed_at:i===83?null:'2026-01-01T00:00:00Z',banned_until:i<24?'2099-01-01T00:00:00Z':null,created_at:'2026-01-01T00:00:00Z'}));
  return {parsed:{tables,statements:[],sequenceStatements:["SELECT pg_catalog.setval('public.s', 10, true);"]},baselineMetrics:Object.fromEntries(tables.map(t=>[t.name,{count:'0',h1:'0',h2:'0'}])),latestMetrics:Object.fromEntries(tables.map(t=>[t.name,{count:'0',h1:'0',h2:'0'}])),targetMetadata:{externalIncomingForeignKeys:0,foreignKeys:[],triggers:[]},sourceAuth,targetAuth:sourceAuth.map((u,i)=>({id:String(9007199254741000n+BigInt(i)),sub:u.id,project:'dydata-d6g0gd1v37fcddf21',password:'before',username:u.email,email:u.email,status:1,email_verified:true,name:'$cutover_guard$'})),capturedAt:'2026-11-02T10:00:00Z',runId:'0123456789abcdef',opensAt:'2026-11-02T10:00:00Z',closesAt:'2026-11-02T11:00:00Z'};
}
test('cloud package stages privately, promotes once, guards baseline and preserves original UUID/internal ID',()=>{
  const p=buildCloudBaseCutoverPackage(input());
  assert.equal(p.sourceTableCount,99);assert.equal(p.finalAtomic,true);assert.equal(p.authSummary.mirrored,84);
  assert.match(p.stageBatches[0].sql,/REVOKE ALL ON SCHEMA/);
  assert.match(p.finalBatch.sql,/Outside authorized cutover window/);
  assert.equal((p.finalBatch.sql.match(/Outside authorized cutover window/g)??[]).length,2);
  assert.match(p.finalBatch.sql,/target_baseline reconciliation failed/);
  assert.match(p.finalBatch.sql,/staged_latest reconciliation failed/);
  assert.match(p.finalBatch.sql,/promoted_latest reconciliation failed/);
  assert.match(p.finalBatch.sql,/Target Auth baseline drift/);
  assert.match(p.finalBatch.sql,/id='9007199254741000'::bigint/);
  assert.doesNotMatch(p.finalBatch.sql,/UPDATE auth\.users SET [^;]*(?:"id"=|"sub"=|"project"=)/);
  assert.doesNotMatch(p.finalBatch.sql,/setval|TRUNCATE|session_replication_role|CREATE POLICY|GRANT |DROP FUNCTION/);
  assert.equal(p.sequenceBatches.length,1);
  assert.match(p.sequenceBatches[0].sql,/setval/);
  assert.match(p.sequenceBatches[0].sql,/GREATEST\(10,/);
  assert.ok(p.finalBatch.bytes<480*1024);
  assert.equal(p.finalBatch.sha256,buildCloudBaseCutoverPackage(input()).finalBatch.sha256);
});
test('cloud package refuses missing identities, extra dependencies, bad shapes, expired window definition and split promotion',()=>{
  for(const alter of [x=>x.targetAuth.pop(),x=>x.targetMetadata.externalIncomingForeignKeys=1,x=>x.parsed.tables.pop(),x=>x.closesAt='invalid',x=>x.maxBytes=1000,x=>x.targetMetadata.foreignKeys.push({table:'t0',name:'bad',definition:'FOREIGN KEY (id) REFERENCES t1(id); DELETE FROM x'})]) {
    const x=input();alter(x);assert.throws(()=>buildCloudBaseCutoverPackage(x));
  }
});
test('cloud package retains opaque identity fields within the unchanged atomic byte limit',()=>{
  const x=input();
  // Reproduces the real 480 KiB boundary failure without private account data.
  const opaque='x'.repeat(123733);
  x.targetAuth[0].opaque=opaque;
  const p=buildCloudBaseCutoverPackage(x);
  assert.ok(p.finalBatch.bytes<=480*1024);
  assert.equal(p.finalAtomic,true);
  assert.ok(p.finalBatch.sql.includes(`"opaque":"${opaque}"`));
  for(const label of ['target_baseline','staged_latest','promoted_latest']) {
    assert.equal((p.finalBatch.sql.match(new RegExp(`${label} reconciliation failed`,'g'))??[]).length,99);
  }
  x.targetAuth[0].opaque+='x'.repeat(10000);
  assert.throws(()=>buildCloudBaseCutoverPackage(x),/Atomic promotion exceeds batch budget/);
});

test('every actual transaction-wrapped cutover request retains more than 1500 bytes', async()=>{
  const x=input();
  x.parsed.statements=Array.from({length:3},()=>`INSERT INTO public."t0" ("id") VALUES ('${'x'.repeat(244650)}');`);
  const p=buildCloudBaseCutoverPackage(x);
  const ledger=new Map();
  const actual=[];
  await runBatches({batches:[...p.stageBatches,p.finalBatch,...p.sequenceBatches],lookupReceipt:async id=>ledger.get(id)??null,
    execute:async(sql,meta)=>{actual.push(Buffer.byteLength(sql));ledger.set(meta.batchId,{sha256:meta.sha256});return {RequestId:'synthetic-request'};}});
  assert.ok(actual.length>3);
  for(const bytes of actual) assert.ok(491520-bytes>1500, `Actual request headroom is ${491520-bytes}`);
});

test('atomic promotion must reserve its complete transaction wrapper and 1500 byte margin',()=>{
  const x=input();
  const base=buildCloudBaseCutoverPackage(x).finalBatch.bytes;
  // Both Auth guards preserve this opaque field. Place raw SQL inside the old
  // limit but leave insufficient room once the actual transaction is included.
  x.targetAuth[0].opaque='x'.repeat(Math.floor((491520-base-1000)/2));
  assert.throws(()=>buildCloudBaseCutoverPackage(x), /Atomic promotion exceeds/);
});

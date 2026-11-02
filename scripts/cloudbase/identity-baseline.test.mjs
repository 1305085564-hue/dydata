import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIdentityBaseline, managementActivityFromLog } from './identity-baseline.mjs';
const start=Date.parse('2026-11-01T20:00:00Z');
const row=(patch={})=>({id:'1',subject:'synthetic-1',protectedDigest:'auth-hash',roleDigest:'role-hash',lastLogin:'2026-11-01T19:00:00Z',builtin:false,...patch});
const snapshot=(rows=[row()])=>({version:2,capturedAt:start,identities:rows.length,rows});
const event=(patch={})=>({operation:'password-signin',subject:'synthetic-1',startedAt:start,finishedAt:start+2000,success:true,requestId:'owned-request-1',...patch});
test('own successful login attributes activity without ignoring the protected layer',()=>{
 const after=snapshot([row({lastLogin:'2026-11-01T20:00:01Z'})]);
 assert.deepEqual(assertIdentityBaseline(snapshot(),after,[event()]),{protectedDifferences:0,activityChanges:1,attributedActivities:[{subject:'synthetic-1',field:'last_login',requestId:'owned-request-1',operation:'password-signin'}]});
});
for(const field of ['protectedDigest','roleDigest','subject','id'])test(`protected ${field} change fails even with an owned login receipt`,()=>{
 assert.throws(()=>assertIdentityBaseline(snapshot(),snapshot([row({[field]:'tampered',lastLogin:'2026-11-01T20:00:01Z'})]),[event()]),/Protected identity/);
});
for(const events of [[],[event({subject:'other'})],[event({success:false})],[event({startedAt:start+1500})],[event({finishedAt:start+500})],[event({requestId:''})],[event(),event({requestId:'overlapping'})]])test(`unattributed or ambiguous activity fails: ${JSON.stringify(events)}`,()=>{
 assert.throws(()=>assertIdentityBaseline(snapshot(),snapshot([row({lastLogin:'2026-11-01T20:00:01Z'})]),events),/Unattributed activity/);
});
test('identity additions, removals, legacy or incomplete snapshots fail closed',()=>{
 assert.throws(()=>assertIdentityBaseline(snapshot(),snapshot([]),[]),/Protected identity/);
 assert.throws(()=>assertIdentityBaseline({identity_digest:'old'},snapshot(),[]),/version/);
 assert.throws(()=>assertIdentityBaseline(snapshot(),snapshot([row({protectedDigest:undefined})]),[]),/snapshot/);
});
test('management activity requires exact run, environment, successful request and known administrator',()=>{
 const before=snapshot([row({subject:'builtin-admin',builtin:true})]);
 const receipt={operation:'ModifyUser',environmentId:'isolated',startedAt:start,finishedAt:start+1000,success:true,requestId:'request-2'};
 const log=`[cloudbase-management] ${JSON.stringify(receipt)}\n`;
 assert.equal(managementActivityFromLog(log,{environmentId:'isolated',setupAt:start-1,baseline:before})[0].subject,'builtin-admin');
 for(const patch of [{success:false},{environmentId:'other'},{startedAt:start-2000},{requestId:''},{operation:'Other'}])assert.equal(managementActivityFromLog(`[cloudbase-management] ${JSON.stringify({...receipt,...patch})}`,{environmentId:'isolated',setupAt:start-1,baseline:before}).length,0);
});
test('platform response time attributes its own login despite measured client-clock skew',()=>{
 const after=snapshot([row({lastLogin:'2026-11-01T20:00:01.300Z'})]);
 const receipt=event({startedAt:start,finishedAt:start+1185,serverDate:'Sun, 01 Nov 2026 20:00:01 GMT'});
 assert.equal(assertIdentityBaseline(snapshot(),after,[receipt]).activityChanges,1);
 assert.throws(()=>assertIdentityBaseline(snapshot(),after,[{...receipt,serverDate:'invalid'}]),/Unattributed activity/);
 assert.throws(()=>assertIdentityBaseline(snapshot(),after,[{...receipt,serverDate:'Sun, 01 Nov 2026 20:00:03 GMT'}]),/Unattributed activity/);
});

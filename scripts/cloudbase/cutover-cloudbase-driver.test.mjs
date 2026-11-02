import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSourceLockReceipt, assertSnapshotLockBinding, assertPackageLockWindow, parseSingleJsonResult, executePreparedPhase } from './cutover-cloudbase-driver.mjs';
const now=Date.now();const held=()=>({source:{host:'aws-1-ap-southeast-1.pooler.supabase.com',user:'postgres.gcrhhxaopomtposmahsw',port:'5432',database:'postgres'},lockId:'stable-lock-1',acquiredAt:new Date(now-30000).toISOString(),state:'HELD',rehearsal:false,lockCount:100,project:'gcrhhxaopomtposmahsw',pid:123,heartbeatAt:new Date().toISOString(),closesAt:new Date(Date.now()+600000).toISOString()});
test('cloud execution rejects stale, local, lost or nearly expired source locks',()=>{
  assert.doesNotThrow(()=>assertSourceLockReceipt(held()));
  for(const change of [{rehearsal:true},{state:'RELEASED'},{lockCount:99},{pid:null},{closesAt:'bad'},{closesAt:new Date(now+60000).toISOString()},{heartbeatAt:new Date(now-46000).toISOString()}])assert.throws(()=>assertSourceLockReceipt({...held(),...change}));
});
test('native JSON result parser refuses ambiguous rows',()=>{
  assert.deepEqual(parseSingleJsonResult({Rows:[JSON.stringify([JSON.stringify({a:1})])]}),{a:1});
  for(const result of [{Rows:[]},{Rows:['[1,2]']},{Rows:['bad']},{Rows:['[1]','[2]']}])assert.throws(()=>parseSingleJsonResult(result));
});
test('production execution accepts the exact direct source and rejects mismatched connection identities',()=>{
 const lock=held();lock.source={host:'db.gcrhhxaopomtposmahsw.supabase.co',user:'postgres',port:'5432',database:'postgres'};
 assert.doesNotThrow(()=>assertSourceLockReceipt(lock));
 for(const change of [{host:'db.other.supabase.co'},{user:'postgres.other'},{port:'6543'},{database:'other'}])assert.throws(()=>assertSourceLockReceipt({...lock,source:{...lock.source,...change}}));
});
test('prepared driver never initializes a write when the window or source lock fails',async()=>{
  let calls=0;const manager={database:{executePGSql(){calls++;throw Error('must not call');}}};
  const pkg={environmentId:'dydata-d6g0gd1v37fcddf21',opensAt:new Date(now-60000).toISOString(),closesAt:new Date(now+600000).toISOString(),stageBatches:[]};
  await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>({...held(),state:'FAILED'})}));
  await assert.rejects(executePreparedPhase({pkg:{...pkg,closesAt:new Date(now-1000).toISOString()},phase:'stage',manager,readSourceLock:held}));
  assert.equal(calls,0);
});

test('final snapshot must belong to this uninterrupted lock, never an old export or replacement lock',()=>{
 const lock=held();const snapshot={capturedAt:new Date(now-1000).toISOString(),sourceLock:{source:lock.source,lockId:lock.lockId,acquiredAt:lock.acquiredAt,pid:lock.pid,rehearsal:false}};
 assert.doesNotThrow(()=>assertSnapshotLockBinding(snapshot,lock));
 assert.throws(()=>assertSnapshotLockBinding({...snapshot,capturedAt:new Date(now-60000).toISOString()},lock));
 assert.throws(()=>assertSnapshotLockBinding(snapshot,{...lock,lockId:'replacement-lock'}));
 assert.throws(()=>assertSnapshotLockBinding(snapshot,{...lock,pid:124}));
 assert.throws(()=>assertSnapshotLockBinding(undefined,lock));
 assert.throws(()=>assertSnapshotLockBinding(snapshot,{...lock,source:{...lock.source,database:'other'}}));
 assert.throws(()=>assertSourceLockReceipt({...lock,source:{...lock.source,host:'localhost'}}));
});

test('package cannot outlive the source lock or consume its recovery margin',()=>{const lock=held();assert.doesNotThrow(()=>assertPackageLockWindow({closesAt:new Date(Date.parse(lock.closesAt)-120000).toISOString()},lock));for(const dt of [0,119999,-60000])assert.throws(()=>assertPackageLockWindow({closesAt:new Date(Date.parse(lock.closesAt)-dt).toISOString()},lock));});

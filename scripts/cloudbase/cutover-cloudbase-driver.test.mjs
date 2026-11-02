import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
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
test('receipt lookup accepts explicit empty rows, rejects invalid responses, and preserves the write RequestId',async(t)=>{
  const batch={id:'receipt-query-test',sql:'SELECT 1;'};
  const hash=createHash('sha256').update(batch.sql,'utf8').digest('hex');
  const lock=held();
  const pkg={environmentId:'dydata-d6g0gd1v37fcddf21',opensAt:new Date(now-60000).toISOString(),closesAt:new Date(now+300000).toISOString(),
    sourceSnapshot:{capturedAt:new Date(now-1000).toISOString(),sourceLock:{source:lock.source,lockId:lock.lockId,acquiredAt:lock.acquiredAt,pid:lock.pid,rehearsal:false}},stageBatches:[batch]};
  const verifyResponse=async(firstResponse,assertValid,label)=>{
    let receiptReads=0,writes=0;
    const manager={database:{async executePGSql({Sql}){
      if(Sql.includes('SELECT sha256')){
        receiptReads++;
        return receiptReads===1?firstResponse:{RequestId:'confirmed-receipt-read',Columns:['sha256'],Rows:[JSON.stringify([hash])]};
      }
      writes++;
      return {RequestId:'batch-write-request'};
    }}};
    if(assertValid){
      const report=await executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock});
      assert.equal(report.status,'completed');
      assert.equal(report.requestId,'batch-write-request');
      assert.equal(report.batches[0].requestId,'batch-write-request');
      assert.deepEqual(report.receiptRequestIds,['empty-receipt-read','confirmed-receipt-read']);
      assert.equal(writes,1);
    }else{
      await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock}),error=>{
        if(typeof firstResponse?.RequestId==='string'&&firstResponse.RequestId)assert.equal(error.requestId,firstResponse.RequestId,label);
        return true;
      },label);
      assert.equal(writes,0,`${label} must stop before any batch write`);
    }
  }
  for(const rows of [null,[]])await t.test(`Rows=${rows===null?'null':'[]'} is a valid explicit empty result`,()=>verifyResponse({RequestId:'empty-receipt-read',Columns:['sha256'],Rows:rows},true));
  const invalidResponses=[
    ['SDK error with empty rows',{RequestId:'receipt-error',Error:{Code:'InternalError'},Columns:['sha256'],Rows:[]}],
    ['lowercase SDK error with empty rows',{RequestId:'receipt-lowercase-error',error:{message:'lookup failed'},Columns:['sha256'],Rows:[]}],
    ['ok=false with empty rows',{RequestId:'receipt-not-ok',ok:false,Columns:['sha256'],Rows:[]}],
    ['success=false with empty rows',{RequestId:'receipt-not-successful',success:false,Columns:['sha256'],Rows:[]}],
    ['missing Rows',{RequestId:'receipt-missing-rows',Columns:['sha256']}],
    ['missing Columns',{RequestId:'receipt-missing-columns',Rows:[]}],
    ['null Columns',{RequestId:'receipt-null-columns',Columns:null,Rows:[]}],
    ['wrong column with empty rows',{RequestId:'receipt-wrong-empty-column',Columns:['other'],Rows:[]}],
    ['wrong column',{RequestId:'receipt-wrong-column',Columns:['other'],Rows:[JSON.stringify([hash])]}],
    ['malformed row',{RequestId:'receipt-malformed-row',Columns:['sha256'],Rows:['not-json']}],
    ['wrong hash',{RequestId:'receipt-wrong-hash',Columns:['sha256'],Rows:[JSON.stringify(['not-a-sha256'])]}],
    ['extra row field',{RequestId:'receipt-extra-field',Columns:['sha256'],Rows:[JSON.stringify([hash,'extra'])]}],
    ['multiple rows',{RequestId:'receipt-multiple-rows',Columns:['sha256'],Rows:[JSON.stringify([hash]),JSON.stringify([hash])]}],
    ['missing RequestId',{Columns:['sha256'],Rows:[]}],
    ['empty RequestId',{RequestId:'',Columns:['sha256'],Rows:[]}],
  ];
  for(const [label,response] of invalidResponses)await t.test(`${label} is rejected`,()=>verifyResponse(response,false,label));

  await t.test('matching receipt skips the write and retains its lookup RequestId',async()=>{
    let writes=0;
    const manager={database:{async executePGSql({Sql}){
      if(Sql.includes('SELECT sha256'))return {RequestId:'matching-receipt-read',Columns:['sha256'],Rows:[JSON.stringify([hash])]};
      writes++;
      return {RequestId:'must-not-write'};
    }}};
    const report=await executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock});
    assert.equal(report.status,'completed');
    assert.equal(report.batches[0].status,'skipped');
    assert.equal(writes,0);
    assert.deepEqual(report.receiptRequestIds,['matching-receipt-read']);
  });

  await t.test('hash conflict rejects and retains the receipt lookup RequestId',async()=>{
    const manager={database:{async executePGSql(){return {RequestId:'conflicting-receipt-read',Columns:['sha256'],Rows:[JSON.stringify(['f'.repeat(64)])]};}}};
    await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock}),error=>{
      assert.equal(error.requestId,'conflicting-receipt-read');
      assert.deepEqual(error.receiptRequestIds,['conflicting-receipt-read']);
      return true;
    });
  });

  await t.test('postwrite receipt failure retains both the write and lookup RequestIds',async()=>{
    let receiptReads=0,writes=0;
    const manager={database:{async executePGSql({Sql}){
      if(Sql.includes('SELECT sha256')){
        receiptReads++;
        return receiptReads===1
          ?{RequestId:'initial-empty-read',Columns:['sha256'],Rows:null}
          :{RequestId:'postwrite-failed-read',Error:{Code:'InternalError'},Columns:['sha256'],Rows:[]};
      }
      writes++;
      return {RequestId:'postwrite-write-request'};
    }}};
    await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock}),error=>{
      assert.equal(error.requestId,'postwrite-write-request');
      assert.deepEqual(error.receiptRequestIds,['initial-empty-read','postwrite-failed-read']);
      return true;
    });
    assert.equal(writes,1);
  });

  await t.test('initial receipt lookup throw retains its RequestId',async()=>{
    const manager={database:{async executePGSql(){
      const error=new Error('synthetic initial receipt read failure');
      error.requestId='initial-thrown-read-id';
      throw error;
    }}};
    await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock}),error=>{
      assert.equal(error.outcome,'NOT_STARTED');
      assert.equal(error.requestId,'initial-thrown-read-id');
      assert.deepEqual(error.receiptRequestIds,['initial-thrown-read-id']);
      return true;
    });
  });

  await t.test('postwrite receipt lookup throw retains its RequestId without replacing the write RequestId',async()=>{
    let receiptReads=0;
    const manager={database:{async executePGSql({Sql}){
      if(Sql.includes('SELECT sha256')){
        receiptReads++;
        if(receiptReads===1)return {RequestId:'initial-before-write-read',Columns:['sha256'],Rows:null};
        const error=new Error('synthetic postwrite receipt read failure');
        error.RequestId='postwrite-thrown-read-id';
        throw error;
      }
      return {RequestId:'successful-write-id'};
    }}};
    await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock}),error=>{
      assert.equal(error.outcome,'UNKNOWN');
      assert.equal(error.requestId,'successful-write-id');
      assert.deepEqual(error.receiptRequestIds,['initial-before-write-read','postwrite-thrown-read-id']);
      return true;
    });
  });

  await t.test('whitespace-only write RequestId cannot produce normal success',async()=>{
    let receiptReads=0;
    const manager={database:{async executePGSql({Sql}){
      if(Sql.includes('SELECT sha256')){
        receiptReads++;
        return receiptReads===1
          ?{RequestId:'initial-before-blank-write-read',Columns:['sha256'],Rows:null}
          :{RequestId:'mismatched-after-blank-write-read',Columns:['sha256'],Rows:[JSON.stringify(['f'.repeat(64)])]};
      }
      return {RequestId:'   '};
    }}};
    await assert.rejects(executePreparedPhase({pkg,phase:'stage',manager,readSourceLock:()=>lock}),error=>{
      assert.equal(error.outcome,'UNKNOWN');
      assert.equal(error.requestId,null);
      assert.notEqual(error.requestId,'   ');
      return true;
    });
  });
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

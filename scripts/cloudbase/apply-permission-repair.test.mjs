import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRepairBatches } from './apply-permission-repair.mjs';
import { ENV_ID } from './permission-fixtures.mjs';
const plan={envId:ENV_ID,version:'permission-v2',blocked:[],batches:Array.from({length:144},(_,i)=>({apply:`SELECT ${i};`,rollback:`SELECT ${1000+i};`}))};
test('only reviewed isolation inventory, explicit action and run ID can be packed',()=> {
  assert.throws(()=>prepareRepairBatches({...plan,envId:'production'},'apply','permission-v2-test'));
  assert.throws(()=>prepareRepairBatches(plan,'delete','permission-v2-test'));
  assert.throws(()=>prepareRepairBatches(plan,'apply',''));
  const batches=prepareRepairBatches(plan,'apply','permission-v2-test');
  assert.equal(batches.length,1); assert.match(batches[0].sql,/SELECT 0;\nSELECT 1;/);
  assert.match(prepareRepairBatches(plan,'rollback','permission-v2-test')[0].sql,/^SELECT 1143;\nSELECT 1142;/);
});

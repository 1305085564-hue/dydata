import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packSqlBatches, runBatches } from './sql-batches.mjs';
import { execute, quote, ENV_ID } from './permission-fixtures.mjs';

export function prepareRepairBatches(plan, action, runId) {
  const expected = plan.version === 'permission-v2' ? 144 : plan.version === 'permission-v2-views' ? 2 : 0;
  if (plan.envId !== ENV_ID || !expected || !Array.isArray(plan.batches) || plan.batches.length !== expected) throw new Error('Unrecognized isolated repair plan');
  if (!['apply','rollback'].includes(action) || !/^[a-z0-9-]{8,100}$/.test(runId)) throw new Error('Explicit action and operation ID required');
  if (plan.blocked.length) throw new Error('Repair plan has unresolved prerequisites');
  const objects = action === 'apply' ? plan.batches : [...plan.batches].reverse();
  return packSqlBatches(objects.map(b=>b[action === 'apply' ? 'apply' : 'rollback']+'\n'), {maxBytes:512*1024,migrationId:`${runId}-${action}`});
}
export async function applyRepair({plan,action,runId,output,executeSql=execute}) {
  const batches=prepareRepairBatches(plan,action,runId);
  const lookupReceipt=async id=> {
    const r=await executeSql(`SELECT sha256 FROM dydata_migration.sql_batch_receipts WHERE batch_id=${quote(id)}`);
    return r.rows[0] ?? null;
  };
  if(action==='apply' && await lookupReceipt(`${runId}-rollback:1`)) throw new Error('Operation already rolled back; use a new reviewed operation ID');
  if(action==='rollback' && !await lookupReceipt(`${runId}-apply:1`)) throw new Error('No committed apply receipt for this operation');
  await mkdir(output,{recursive:true,mode:0o700});
  const requests=[];
  try {
    const results=await runBatches({batches,lookupReceipt,execute:async sql=> {
      const r=await executeSql(sql); requests.push({requestId:r.requestId,ms:r.ms});
      await writeFile(resolve(output,`${runId}-${action}-requests.json`),JSON.stringify(requests,null,2),{mode:0o600});
      return {requestId:r.requestId};
    }});
    const evidence={environment:ENV_ID,runId,action,objects:plan.batches.map(b=>({id:b.id,object:b.object})),batches:batches.map(b=>({id:b.id,sha256:b.sha256,bytes:b.bytes})),requests,results};
    await writeFile(resolve(output,`${runId}-${action}-receipt.json`),JSON.stringify(evidence,null,2),{mode:0o600});
    return {environment:ENV_ID,runId,action,objects:plan.batches.length,requests,results};
  } catch(error) {
    await writeFile(resolve(output,`${runId}-${action}-error-private.txt`),String(error?.stack??error),{mode:0o600});
    throw new Error('Repair stopped; inspect private error and durable database receipts before recovery');
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [file,action,runId,output]=process.argv.slice(2);
  if(!file||!output) throw new Error('Usage: plan.json apply|rollback explicit-run-id private-output-directory');
  const plan=JSON.parse(await readFile(file,'utf8'));
  console.log(JSON.stringify(await applyRepair({plan,action,runId,output})));
}

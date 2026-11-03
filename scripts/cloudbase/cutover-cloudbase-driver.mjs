import { freezeRequestBudget } from './cutover-freeze.mjs';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUTH_IMPORT_ENV_ID } from './auth-import.mjs';
import { CUTOVER_MAX_REQUEST_BYTES, CUTOVER_MIN_HEADROOM_BYTES } from './cutover-cloudbase-package.mjs';
import { runBatches } from './sql-batches.mjs';
import { ensurePrivateFile, ensurePrivateOutputDirectory, writePrivateFile, quoteLiteral, isAuthorizedSourceIdentity } from './cutover-core.mjs';

export function assertSourceLockReceipt(receipt, now = Date.now(), { allowRehearsal = false } = {}) {
  if(receipt?.state!=='HELD'||(!allowRehearsal&&!isAuthorizedSourceIdentity(receipt.source))||(!allowRehearsal&&receipt.rehearsal!==false)||typeof receipt.lockId!=='string'||!receipt.lockId||!Number.isFinite(Date.parse(receipt.acquiredAt))||Date.parse(receipt.acquiredAt)>now||receipt.lockCount!==100||receipt.project!=='gcrhhxaopomtposmahsw'||!Number.isInteger(receipt.pid)||!Number.isFinite(Date.parse(receipt.heartbeatAt))||Date.parse(receipt.closesAt)-now<120_000||!Number.isFinite(Date.parse(receipt.closesAt))||now-Date.parse(receipt.heartbeatAt)>45_000||Date.parse(receipt.heartbeatAt)-now>2000)throw Error('Fresh production-source lock receipt with at least two minutes remaining is required');
}
export function assertSnapshotLockBinding(snapshot, receipt, now = Date.now(), options) {
  assertSourceLockReceipt(receipt,now,options);
  if(!snapshot?.sourceLock||JSON.stringify(snapshot.sourceLock.source)!==JSON.stringify(receipt.source)||snapshot.sourceLock.lockId!==receipt.lockId||snapshot.sourceLock.pid!==receipt.pid||snapshot.sourceLock.acquiredAt!==receipt.acquiredAt||snapshot.sourceLock.rehearsal!==receipt.rehearsal||!Number.isFinite(Date.parse(snapshot.capturedAt))||Date.parse(snapshot.capturedAt)<Date.parse(receipt.acquiredAt)||Date.parse(snapshot.capturedAt)>now)throw Error('Final snapshot is not bound to the continuously held source lock; re-export');
}
export function assertPackageLockWindow(pkg,receipt) {
 if(!Number.isFinite(Date.parse(pkg.closesAt))||Date.parse(pkg.closesAt)>Date.parse(receipt.closesAt)-120_000)throw Error('Package must end at least two minutes before the source lock releases');
}
export function parseSingleJsonResult(result) {
  if(!Array.isArray(result?.Rows)||result.Rows.length!==1)throw Error('Expected exactly one database row');
  const tuple=JSON.parse(result.Rows[0]);
  if(!Array.isArray(tuple)||tuple.length!==1)throw Error('Expected exactly one database field');
  return typeof tuple[0]==='string'?JSON.parse(tuple[0]):tuple[0];
}
export function parseReceiptLookup(result) {
  const reject = () => { throw Object.assign(new Error('Invalid receipt lookup response'), {
    requestId: typeof result?.RequestId === 'string' && result.RequestId.trim() ? result.RequestId : null,
    reason: 'invalid-receipt-response',
  }); };
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || typeof result.RequestId !== 'string' || !result.RequestId.trim()
    || result.Error != null || result.error != null || result.ok === false || result.success === false || result.isError === true
    || !Object.hasOwn(result, 'Rows') || !Array.isArray(result.Columns)
    || result.Columns.length !== 1 || result.Columns[0] !== 'sha256') return reject();
  if (result.Rows === null || (Array.isArray(result.Rows) && result.Rows.length === 0)) return null;
  if (!Array.isArray(result.Rows) || result.Rows.length !== 1 || typeof result.Rows[0] !== 'string') return reject();
  let tuple;
  try { tuple = JSON.parse(result.Rows[0]); } catch { return reject(); }
  if (!Array.isArray(tuple) || tuple.length !== 1 || typeof tuple[0] !== 'string' || !/^[a-f0-9]{64}$/.test(tuple[0])) return reject();
  return { sha256: tuple[0], requestId: result.RequestId };
}
export async function loadCloudBaseManager(modulePath) {
  if(!path.isAbsolute(modulePath??''))throw Error('Explicit installed CloudBase manager module path required');
  const manager=createRequire(import.meta.url)(modulePath);
  if(typeof manager.getCloudBaseManager!=='function')throw Error('Unsupported manager module');
  return manager.getCloudBaseManager({cloudBaseOptions:{envId:AUTH_IMPORT_ENV_ID,region:'ap-shanghai'}});
}
export async function executePreparedPhase({pkg,phase,manager,readSourceLock}) {
  if(pkg?.environmentId!==AUTH_IMPORT_ENV_ID||!['stage','promote','sequences'].includes(phase))throw Error('Wrong target or phase');
  const batches=phase==='stage'?pkg.stageBatches:phase==='promote'?[pkg.finalBatch]:pkg.sequenceBatches;
  const assertWindow=()=>{const now=Date.now();if(!Number.isFinite(Date.parse(pkg.opensAt))||!Number.isFinite(Date.parse(pkg.closesAt))||now<Date.parse(pkg.opensAt)||now>=Date.parse(pkg.closesAt))throw Error('Outside authorized cutover window');};
  const check=()=>{assertWindow();const lock=readSourceLock();assertSnapshotLockBinding(pkg.sourceSnapshot,lock);assertPackageLockWindow(pkg,lock);};
  check();
  const receiptRequestIds=[];
  const assertBytes=sql=>{if(CUTOVER_MAX_REQUEST_BYTES-freezeRequestBudget(sql,'cloudbase').requestBytes<=CUTOVER_MIN_HEADROOM_BYTES)throw Error('Actual cutover request exceeds byte budget including required headroom');};
  const execute=async(sql)=>{check();assertBytes(sql);const result=await manager.database.executePGSql({Sql:sql});if(typeof result?.RequestId!=='string'||!result.RequestId.trim())throw Error('Execution response missing RequestId; inspect receipt');return result;};
  const lookupReceipt=async(id)=>{
    // A read is still allowed after an unknown execution outcome/window end.
    const sql=`BEGIN READ ONLY; SELECT sha256 FROM dydata_migration.sql_batch_receipts WHERE batch_id=${quoteLiteral(id)}; COMMIT;`;
    assertBytes(sql);
    let result;
    try { result=await manager.database.executePGSql({Sql:sql}); }
    catch(error) {
      const id=error?.requestId??error?.RequestId;
      if(typeof id==='string'&&id.trim())receiptRequestIds.push(id);
      throw error;
    }
    if(typeof result?.RequestId==='string'&&result.RequestId.trim())receiptRequestIds.push(result.RequestId);
    return parseReceiptLookup(result);
  };
  try {
    const result=await runBatches({batches,execute,lookupReceipt});
    return {...result,receiptRequestIds};
  } catch(error) {
    error.receiptRequestIds=[...receiptRequestIds];
    throw error;
  }
}
async function main() {
  const argv=process.argv.slice(2);
  if(argv.includes('--help')){console.log('Future approved window only: node scripts/cloudbase/cutover-cloudbase-driver.mjs --execute-authorized-cloudbase --package PRIVATE_JSON --expected-sha256 SHA --phase stage|promote|sequences --manager-module ABSOLUTE_INSTALLED_MODULE --source-lock-receipt PRIVATE_JSON --receipt NEW_PRIVATE_JSON\nNo network or SDK initialization occurs without the explicit execution marker. The source lock is verified from its fresh receipt before every batch; the operator must independently verify its backend PID/100 locks on the source.');return;}
  if(!argv.includes('--execute-authorized-cloudbase'))throw Error('Explicit approved-window execution marker required');
  const get=(flag)=>{const i=argv.indexOf(flag);if(i<0||!argv[i+1])throw Error('Missing '+flag);return argv[i+1];};
  const file=get('--package'),lock=get('--source-lock-receipt'),receipt=get('--receipt');ensurePrivateFile(file);ensurePrivateFile(lock);ensurePrivateOutputDirectory(path.dirname(path.resolve(receipt)));
  if(existsSync(receipt))throw Error('Receipt path must be new');
  const bytes=readFileSync(file);if(createHash('sha256').update(bytes).digest('hex')!==get('--expected-sha256'))throw Error('Reviewed package SHA256 mismatch');
  const pkg=JSON.parse(bytes),phase=get('--phase');assertSnapshotLockBinding(pkg.sourceSnapshot,JSON.parse(readFileSync(lock)));assertPackageLockWindow(pkg,JSON.parse(readFileSync(lock)));
  if(pkg.environmentId!==AUTH_IMPORT_ENV_ID||!['stage','promote','sequences'].includes(phase)||!Number.isFinite(Date.parse(pkg.opensAt))||!Number.isFinite(Date.parse(pkg.closesAt))||Date.now()<Date.parse(pkg.opensAt)||Date.now()>=Date.parse(pkg.closesAt))throw Error('Invalid target, phase or window');
  const manager=await loadCloudBaseManager(get('--manager-module'));
  try {const result=await executePreparedPhase({pkg,phase,manager,readSourceLock:()=>JSON.parse(readFileSync(lock))});writePrivateFile(receipt,JSON.stringify({phase,environmentId:AUTH_IMPORT_ENV_ID,...result},null,2));console.log(JSON.stringify({phase,status:result.status,batches:result.batches.length,receipt:path.basename(receipt)}));}
  catch(error){writePrivateFile(receipt,JSON.stringify({phase,status:'STOP',batchId:error.batchId??null,outcome:error.outcome??'UNCONFIRMED',requestId:error.requestId??null,completedBatches:error.completedBatches??[],receiptRequestIds:error.receiptRequestIds??[],reason:error.reason??error.name},null,2));throw Error('Cutover phase stopped; inspect private receipt and database state before retrying');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('CloudBase cutover driver stopped; no credential or SQL body logged.');process.exitCode=1;});

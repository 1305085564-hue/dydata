import { freezeRequestBudget, FREEZE_MIN_HEADROOM, FREEZE_MAX_BYTES } from './cutover-freeze.mjs';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDataArchive, enrichWithTargetColumns, sha256File, ensurePrivateFile, ensurePrivateOutputDirectory, writePrivateFile, removePrivateTempDirectory } from './cutover-core.mjs';
import { buildTargetMetadataQuery, parseTargetMetadata } from './cutover-sync.mjs';
import { reconcileTables } from './data-reconciliation.mjs';
import { buildCloudBaseCutoverPackage, CUTOVER_TARGET_METADATA_SQL, CUTOVER_AUTH_BASELINE_SQL } from './cutover-cloudbase-package.mjs';
import { loadCloudBaseManager, parseSingleJsonResult } from './cutover-cloudbase-driver.mjs';


export function buildCaptureRequest(sql) {
  const request = `BEGIN READ ONLY; SET LOCAL timezone='UTC'; ${sql} COMMIT;`;
  if (freezeRequestBudget(request,'cloudbase').headroomBytes <= FREEZE_MIN_HEADROOM) throw Error('Capture request exceeds management API budget including wrapper');
  return request;
}

export function loadVerifiedSourceBundle(directory) {
  const manifestFile=path.join(directory,'manifest.json');ensurePrivateFile(manifestFile);const manifest=JSON.parse(readFileSync(manifestFile));
  if(manifest.format!=='dydata-cutover-source-manifest-v1'||manifest.consistentReadOnlySnapshot!==true)throw Error('Consistent source manifest required');
  for(const entry of [manifest.database,manifest.public,manifest.auth]){if(!entry||path.basename(entry.file)!==entry.file)throw Error('Invalid source filename');const file=path.join(directory,entry.file);ensurePrivateFile(file);if(sha256File(file).sha256!==entry.sha256)throw Error('Source bundle SHA256 mismatch');}
  const auth=JSON.parse(readFileSync(path.join(directory,manifest.auth.file)));if(auth.capturedAt!==manifest.capturedAt)throw Error('Auth and public snapshots differ');
  return {manifest,auth,archive:path.join(directory,manifest.public.file)};
}
export async function captureTargetBaseline({sourceDirectory,executeReadOnly}) {
  const source=loadVerifiedSourceBundle(sourceDirectory),loaded=loadDataArchive(source.archive);const requests=[];
  try {
    const read=async(sql)=>{buildCaptureRequest(sql);const result=await executeReadOnly(sql);if(typeof result?.RequestId!=='string')throw Error('Missing read RequestId');requests.push(result.RequestId);return result;};
    const inventory=parseSingleJsonResult(await read("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';"));
    const names=loaded.parsed.tables.map(t=>t.name).sort();if(JSON.stringify(inventory)!==JSON.stringify(names)||names.length!==99)throw Error('Target/source public table inventories differ');
    const columns=parseTargetMetadata(JSON.stringify(parseSingleJsonResult(await read(buildTargetMetadataQuery(names)))));
    const parsed=enrichWithTargetColumns(loaded.parsed,columns);
    const metadata=parseSingleJsonResult(await read(CUTOVER_TARGET_METADATA_SQL));
    const auth=parseSingleJsonResult(await read(CUTOVER_AUTH_BASELINE_SQL));
    const wrapperBytes=freezeRequestBudget(buildCaptureRequest(''),'cloudbase').requestBytes;
    const reconciliation=await reconcileTables({parsed,execute:read,maxBytes:FREEZE_MAX_BYTES-FREEZE_MIN_HEADROOM-1-wrapperBytes,measureBytes:sql=>Buffer.byteLength(JSON.stringify(sql))-2});
    return {sourcePublicSha256:source.manifest.public.sha256,sourceAuthSha256:source.manifest.auth.sha256,capturedAt:new Date().toISOString(),columns,metadata,auth,
      baselineMetrics:Object.fromEntries(reconciliation.tables.map(t=>[t.name,t.actual])),latestMetrics:Object.fromEntries(reconciliation.tables.map(t=>[t.name,t.expected])),readRequestIds:requests};
  } finally {removePrivateTempDirectory(loaded.tempDirectory);}
}
export function prepareFromCapture({sourceDirectory,capture,opensAt,closesAt}) {
  const source=loadVerifiedSourceBundle(sourceDirectory);
  if(capture.sourcePublicSha256!==source.manifest.public.sha256||capture.sourceAuthSha256!==source.manifest.auth.sha256)throw Error('Target capture belongs to another source bundle');
  const loaded=loadDataArchive(source.archive);
  try {if(!source.manifest.sourceLock)throw Error('Final source snapshot must bind a held lock');if(!Number.isFinite(Date.parse(source.manifest.sourceLock.closesAt))||Date.parse(closesAt)>Date.parse(source.manifest.sourceLock.closesAt)-120000)throw Error('Package must end before source lock release margin');const pkg=buildCloudBaseCutoverPackage({parsed:enrichWithTargetColumns(loaded.parsed,capture.columns),baselineMetrics:capture.baselineMetrics,latestMetrics:capture.latestMetrics,targetMetadata:capture.metadata,sourceAuth:source.auth.sourceUsers,targetAuth:capture.auth,capturedAt:source.manifest.capturedAt,opensAt,closesAt,runId:randomBytes(8).toString('hex')});return {...pkg,sourceSnapshot:{capturedAt:source.manifest.capturedAt,sourceLock:source.manifest.sourceLock,publicSha256:source.manifest.public.sha256,authSha256:source.manifest.auth.sha256}};}
  finally {removePrivateTempDirectory(loaded.tempDirectory);}
}
async function main(){const argv=process.argv.slice(2);if(argv.includes('--help')||argv.length===0){console.log('capture --read-only-target --source-bundle PRIVATE_DIR --manager-module ABS_MODULE --output NEW_PRIVATE_JSON\nprepare --source-bundle PRIVATE_DIR --capture PRIVATE_JSON --opens ISO --closes ISO --output NEW_PRIVATE_PACKAGE\nCapture performs only BEGIN READ ONLY queries; prepare is offline. No command executes the package.');return;}
  const get=(flag)=>{const i=argv.indexOf(flag);if(i<0||!argv[i+1])throw Error('Missing '+flag);return argv[i+1];};const output=get('--output');ensurePrivateOutputDirectory(path.dirname(path.resolve(output)));let result;
  if(argv[0]==='capture'){if(!argv.includes('--read-only-target'))throw Error('Read-only marker required');const manager=await loadCloudBaseManager(get('--manager-module'));result=await captureTargetBaseline({sourceDirectory:get('--source-bundle'),executeReadOnly:(sql)=>manager.database.executePGSql({Sql:buildCaptureRequest(sql)})});}
  else if(argv[0]==='prepare'){const file=get('--capture');ensurePrivateFile(file);result=prepareFromCapture({sourceDirectory:get('--source-bundle'),capture:JSON.parse(readFileSync(file)),opensAt:get('--opens'),closesAt:get('--closes')});}
  else throw Error('Unknown command');writePrivateFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({status:'prepared',mode:argv[0],output:path.basename(output),sha256:sha256File(output).sha256}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Cutover preparation stopped; source/identity values omitted. Keep private inputs for diagnosis.');process.exitCode=1;});

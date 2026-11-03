// The production entrypoint binds both digest contracts before any network call.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ensurePrivateFile, ensurePrivateOutputDirectory, writePrivateFile, isAuthorizedSourceIdentity, parsePostgresUrl } from './cutover-core.mjs';
import { loadVerifiedPackage, executeFreezeBatches, assertFreezeWindow } from './cutover-freeze-executor.mjs';
import { buildFreezeSnapshotSql, freezeRequestBudget } from './cutover-freeze.mjs';
import { readSourceFreezeSnapshot, createSourceFreezeProtection, validateMaintenanceProof, assertMaintenanceLive } from './cutover-freeze-protection.mjs';
import { loadCloudBaseManager, parseSingleJsonResult, executePreparedPhase, assertSnapshotLockBinding } from './cutover-cloudbase-driver.mjs';
import { writeReceiptUpdate } from './cutover-freeze-executor-cli.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function reviewArtifact(file, kind) {
  ensurePrivateFile(file);
  const bytes = readFileSync(file), pkg = JSON.parse(bytes);
  if (!['freeze', 'cutover'].includes(kind)) throw Error('Unknown artifact kind');
  let bodySha256 = null;
  if (kind === 'freeze') {
    const { packageSha256, ...body } = pkg;
    bodySha256 = hash(JSON.stringify(body));
    if (bodySha256 !== packageSha256) throw Error('Package body digest mismatch');
    loadVerifiedPackage(file, bodySha256);
  }
  return { version: 1, kind, fileSha256: hash(bytes), bodySha256 };
}
export function verifyReview(file, review) {
  const actual = reviewArtifact(file, review.kind);
  if (JSON.stringify(actual) !== JSON.stringify(review)) throw Error('Artifact changed since offline review');
  return { pkg: JSON.parse(readFileSync(file)), expectedSha256: review.kind === 'freeze' ? actual.bodySha256 : actual.fileSha256 };
}

// Recovery intentionally needs live maintenance and exact ACL state, but not a
// healthy migration lock. The immutable rollback SQL still enforces its window.
export async function runReviewedFreeze({ file, review, action, connectionUrl, lockReceiptPath, maintenanceProof, manager, onReceipt }) {
  const { pkg, expectedSha256 } = verifyReview(file, review);
  if (review.kind !== 'freeze' || !['freeze', 'rollback'].includes(action)) throw Error('Invalid freeze action');
  const parsed = parsePostgresUrl(connectionUrl);
  if (!isAuthorizedSourceIdentity({ host: parsed.host, port: parsed.env.PGPORT, user: parsed.env.PGUSER, database: parsed.database })) throw Error('Wrong source');
  const proof = validateMaintenanceProof(maintenanceProof);
  const cloud = pkg.channel === 'cloudbase';
  if (cloud && !manager) throw Error('Target manager required');
  const protect = action === 'rollback'
    ? async () => { assertFreezeWindow(pkg); await assertMaintenanceLive(proof); }
    : createSourceFreezeProtection({ connectionUrl, lockReceiptPath, pkg, mode: 'execute-authorized-source', timeoutMs: 65000, maintenanceProof: proof });
  return executeFreezeBatches({ pkg, expectedSha256, action, onReceipt, assertProtection: protect,
    readSnapshot: cloud ? async () => {
      const sql = `BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; ${buildFreezeSnapshotSql({ excludeExtensionMembers: pkg.snapshotSqlVariant === 'excluded' })} COMMIT;`;
      if (freezeRequestBudget(sql, 'cloudbase').headroomBytes <= 1500) throw Error('Read budget');
      const r = await manager.database.executePGSql({ Sql: sql });
      if (typeof r?.RequestId !== 'string' || !r.RequestId.trim() || r.Error != null || r.error != null || r.ok === false || r.success === false || r.isError === true) throw Object.assign(Error('Target snapshot not confirmed'), { requestId: typeof r?.RequestId === 'string' && r.RequestId.trim() ? r.RequestId : null });
      return { snapshot: parseSingleJsonResult(r), requestId: r.RequestId };
    } : () => readSourceFreezeSnapshot(connectionUrl, pkg, 30000),
    transport: cloud ? sql => manager.database.executePGSql({ Sql: sql }) : async sql => {
      const { runPsqlSingleMessage } = await import('./cutover-core.mjs');
      return runPsqlSingleMessage(connectionUrl, sql, { timeoutMs: 65000 });
    },
  });
}

async function main(argv) {
  const [command] = argv;
  const get = flag => { const i = argv.indexOf(flag); if (i < 0 || !argv[i + 1]) throw Error(`Missing ${flag}`); return argv[i + 1]; };
  const file = get('--package');
  if (command === 'review') {
    const output = get('--output'); ensurePrivateOutputDirectory(path.dirname(path.resolve(output)));
    writePrivateFile(output, JSON.stringify(reviewArtifact(file, get('--kind')), null, 2));
    console.log(JSON.stringify({ status: 'REVIEWED', kind: get('--kind') })); return;
  }
  if (command !== 'execute' || !argv.includes('--authorized')) throw Error('Explicit execution authorization required');
  const reviewFile = get('--review'); ensurePrivateFile(reviewFile);
  const review = JSON.parse(readFileSync(reviewFile));
  const { pkg } = verifyReview(file, review);
  const receipt = get('--receipt'); ensurePrivateOutputDirectory(path.dirname(path.resolve(receipt)));
  if (existsSync(receipt)) throw Error('Receipt exists; never retry this invocation');
  writeReceiptUpdate(receipt, { state: 'STARTING', at: new Date().toISOString(), review }, { first: true });
  try {
    const proofFile = get('--maintenance-proof'); ensurePrivateFile(proofFile);
    const proof = validateMaintenanceProof(JSON.parse(readFileSync(proofFile)));
    await assertMaintenanceLive(proof);
    const lockFile = get('--source-lock-receipt');
    const action = get('--action');
    if (review.kind === 'freeze' && !['freeze', 'rollback'].includes(action)) throw Error('Invalid action');
    if (review.kind === 'cutover' && !['stage', 'promote', 'sequences'].includes(action)) throw Error('Invalid phase');
    const cloud = review.kind === 'cutover' || pkg.channel === 'cloudbase';
    const rawManager = cloud ? await loadCloudBaseManager(get('--manager-module')) : null;
    const manager = rawManager ? { database: { executePGSql: async input => {
      const at = new Date().toISOString(), start = Date.now();
      const request = { EnvId: 'dydata-d6g0gd1v37fcddf21', ...input };
      const meta = { at, sha256: hash(JSON.stringify(request)), ...freezeRequestBudget(input.Sql, 'cloudbase') };
      const audit = value => appendFileSync(receipt + '.requests.jsonl', JSON.stringify({ ...meta, ms: Date.now() - start, ...value }) + '\n', { mode: 0o600 });
      audit({ state: 'SENDING' });
      try {
        const response = await rawManager.database.executePGSql(input);
        audit({ state: 'RESPONDED', requestId: response?.RequestId ?? null });
        if (response?.Error != null || response?.error != null || response?.ok === false || response?.success === false || response?.isError === true) {
          appendFileSync(receipt + '.failure-responses.jsonl', JSON.stringify(response) + '\n', { mode: 0o600 });
        }
        return response;
      } catch (error) {
        audit({ state: 'THREW', requestId: error?.requestId ?? error?.RequestId ?? null, name: error.name }); throw error;
      }
    } } } : null;
    let result;
    if (review.kind === 'freeze') result = await runReviewedFreeze({ file, review, action,
      connectionUrl: process.env.DYDATA_CUTOVER_SOURCE_URL, lockReceiptPath: lockFile, maintenanceProof: JSON.parse(readFileSync(proofFile)), manager,
      onReceipt: value => writeReceiptUpdate(receipt, value) });
    else {
      const assertProtection = createSourceFreezeProtection({ connectionUrl: process.env.DYDATA_CUTOVER_SOURCE_URL, lockReceiptPath: lockFile, pkg, mode: 'execute-authorized-source', timeoutMs: 65000, maintenanceProof: proof });
      const protectedManager = { database: { executePGSql: async input => {
        if (!input.Sql.startsWith('BEGIN READ ONLY; SELECT sha256')) await assertProtection();
        return manager.database.executePGSql(input);
      } } };
      result = await executePreparedPhase({ pkg, phase: action, manager: protectedManager, readSourceLock: () => {
        ensurePrivateFile(lockFile); const lock = JSON.parse(readFileSync(lockFile)); assertSnapshotLockBinding(pkg.sourceSnapshot, lock); return lock;
      } });
    }
    writeReceiptUpdate(receipt, { state: 'COMPLETE', finishedAt: new Date().toISOString(), review, result });
    console.log(JSON.stringify({ status: 'COMPLETE', action }));
  } catch (error) {
    const prior = JSON.parse(readFileSync(receipt));
    writeReceiptUpdate(receipt, { ...prior, state: 'STOPPED', finishedAt: new Date().toISOString(), failure: {
      name: error.name, outcome: error.outcome ?? null, batchId: error.batchId ?? null,
      requestId: error.requestId ?? null, completedBatches: error.completedBatches ?? [], receiptRequestIds: error.receiptRequestIds ?? [],
    } }); throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(() => {
  console.error('Cutover stopped; inspect the private receipt. No credentials or SQL logged.'); process.exitCode = 1;
});

import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertPackageLockWindow, assertSourceLockReceipt, loadCloudBaseManager, parseSingleJsonResult } from './cutover-cloudbase-driver.mjs';
import { buildFreezeSnapshotSql, FREEZE_MIN_HEADROOM, freezeRequestBudget } from './cutover-freeze.mjs';
import { ensurePrivateFile, ensurePrivateOutputDirectory, isAuthorizedSourceIdentity, parsePostgresUrl, runPsqlSingleMessage, writePrivateFile } from './cutover-core.mjs';
import { AUTH_IMPORT_ENV_ID } from './auth-import.mjs';
import { createSourceFreezeProtection, readSourceFreezeSnapshot, validateMaintenanceProof } from './cutover-freeze-protection.mjs';

const SOURCE_PROJECT = 'gcrhhxaopomtposmahsw';
const TARGET_PROJECT = 'dydata-d6g0gd1v37fcddf21';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const FREEZE_EXECUTOR_HELP = `DYData bounded freeze executor

Usage:
  DYDATA_CUTOVER_SOURCE_URL='postgresql://...' node scripts/cloudbase/cutover-freeze-executor.mjs \\
    --rehearsal|--execute-authorized-source|--execute-authorized-cloudbase \\
    --package PRIVATE_PACKAGE.json --expected-sha256 PACKAGE_SHA256 \\
    --source-lock-receipt PRIVATE_LOCK.json --action freeze|rollback \\
    --receipt NEW_PRIVATE_RECEIPT.json \\
    [--maintenance-proof PRIVATE_TWO_DOMAIN_HTTP_PROOF.json] \\
    [--manager-module ABSOLUTE_INSTALLED_MODULE] [--timeout-ms 65000]

Production source and CloudBase execution require a fresh two-domain proof:
dydata.cc and direct.dydata.cc, each with /api/health=200 and a protected route
returning 503 plus x-dydata-maintenance: 1. Those HTTPS checks are repeated at
every execution boundary. The source lock is independently read back as exactly
99 public-table SHARE locks plus auth.users. Each batch is sent once and read
back fully. CloudBase initializes only after the reviewed target package, source
lock and maintenance proof pass preflight. A stopped receipt is never retried
automatically. Credentials and SQL bodies are never printed.`;

function assertReadSqlBudget(sql, pkg) {
  const budget = freezeRequestBudget(sql, pkg.channel, pkg.maxBytes);
  if (budget.headroomBytes <= FREEZE_MIN_HEADROOM) throw new Error('Freeze snapshot read exceeds the package transport budget');
}

function snapshotReadSql(pkg) {
  const sql = buildFreezeSnapshotSql({ excludeExtensionMembers: pkg.snapshotSqlVariant === 'excluded' });
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; SELECT (s)::text AS snapshot FROM (${sql.replace(/;\s*$/, '')}) q(s); COMMIT;`;
}

function assertCloudBaseRequest(result) {
  const requestId = typeof result?.RequestId === 'string' && result.RequestId.trim() ? result.RequestId : null;
  if (!requestId || result.Error != null || result.error != null || result.ok === false || result.success === false || result.isError === true) {
    throw Object.assign(new Error('CloudBase read request did not confirm RequestId'), { requestId });
  }
  return requestId;
}

async function readCloudBaseFreezeSnapshot(manager, pkg) {
  const sql = snapshotReadSql(pkg);
  assertReadSqlBudget(sql, pkg);
  const result = await manager.database.executePGSql({ Sql: sql });
  const requestId = assertCloudBaseRequest(result);
  try {
    const value = parseSingleJsonResult(result);
    const snapshot = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(snapshot)) throw new Error('CloudBase snapshot query did not return a full object array');
    return { snapshot, requestId };
  } catch {
    throw Object.assign(new Error('CloudBase snapshot response was invalid'), { requestId });
  }
}

function assertFreezeBatchBudget(pkg, batch) {
  const budget = freezeRequestBudget(batch.sql, pkg.channel, pkg.maxBytes);
  if (budget.requestBytes !== batch.requestBytes || budget.headroomBytes <= FREEZE_MIN_HEADROOM) {
    throw new Error('Freeze batch request no longer matches its reviewed byte budget');
  }
}

async function sendCloudBaseFreezeBatch(manager, pkg, sql, batch) {
  assertFreezeBatchBudget(pkg, batch);
  if (sql !== batch.sql) throw new Error('Freeze transport SQL differs from the reviewed batch');
  return manager.database.executePGSql({ Sql: sql });
}

function validateConnection(connectionUrl, mode) {
  if (mode === 'rehearsal') {
    const parsed = parsePostgresUrl(connectionUrl);
    const host = parsed.host.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['localhost', '127.0.0.1', '::1'].includes(host) || !parsed.database.startsWith('cutover_rehearsal_')) throw new Error('Rehearsal writes are restricted to loopback cutover_rehearsal_* databases');
    return parsed;
  }
  const parsed = parsePostgresUrl(connectionUrl);
  const identity = { host: parsed.host, port: parsed.env.PGPORT, user: parsed.env.PGUSER, database: parsed.database };
  if (!isAuthorizedSourceIdentity(identity)) throw new Error('Authorized source project mismatch');
  return parsed;
}

export function writeReceiptUpdate(receiptPath, value, { first = false } = {}) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (first) writePrivateFile(receiptPath, content);
  else {
    ensurePrivateFile(receiptPath);
    const tempPath = path.join(path.dirname(receiptPath), `.${path.basename(receiptPath)}.${randomUUID()}.tmp`);
    let descriptor = null;
    try {
      writeFileSync(tempPath, content, { mode: 0o600, flag: 'wx' });
      chmodSync(tempPath, 0o600);
      descriptor = openSync(tempPath, 'r+');
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      renameSync(tempPath, receiptPath);
      chmodSync(receiptPath, 0o600);
      ensurePrivateFile(receiptPath);
    } catch (error) {
      if (descriptor !== null) closeSync(descriptor);
      try { unlinkSync(tempPath); } catch { /* The temporary path may already have been renamed. */ }
      throw error;
    }
  }
}

async function executeCli(args, { executeFreezeBatches, loadVerifiedPackage, assertFreezeWindow }) {
  const options = args.options;
  const receiptPath = path.resolve(options.get('--receipt'));
  ensurePrivateOutputDirectory(path.dirname(receiptPath));
  if (existsSync(receiptPath)) throw new Error('Receipt path must be new');
  writeReceiptUpdate(receiptPath, { version: 1, state: 'STARTING', at: new Date().toISOString() }, { first: true });

  let lastReceipt = { version: 1, state: 'STARTING', at: new Date().toISOString() };
  let sourceReceiptMeta = { sourceLockId: null, sourceLockPid: null, maintenanceProofSha256: null };
  const persist = (value) => {
    lastReceipt = value;
    writeReceiptUpdate(receiptPath, value);
  };
  try {
    if (!process.env.DYDATA_CUTOVER_SOURCE_URL) throw new Error('Set DYDATA_CUTOVER_SOURCE_URL in the environment');
    const connectionUrl = process.env.DYDATA_CUTOVER_SOURCE_URL;
    validateConnection(connectionUrl, args.mode);
    const pkg = loadVerifiedPackage(options.get('--package'), options.get('--expected-sha256'));
    const cloudBaseMode = args.mode === 'execute-authorized-cloudbase';
    const expectedProject = cloudBaseMode ? TARGET_PROJECT : SOURCE_PROJECT;
    const expectedChannel = cloudBaseMode ? 'cloudbase' : 'postgres';
    if (pkg.project !== expectedProject || pkg.channel !== expectedChannel) throw new Error('Reviewed package project/channel does not match the execution marker');
    assertFreezeWindow(pkg);

    const lockReceiptPath = options.get('--source-lock-receipt');
    ensurePrivateFile(lockReceiptPath);
    const lock = JSON.parse(readFileSync(lockReceiptPath, 'utf8'));
    assertSourceLockReceipt(lock, Date.now(), { allowRehearsal: args.mode === 'rehearsal' });
    assertPackageLockWindow(pkg, lock);

    let maintenanceProofSha256 = null;
    let maintenanceProof = null;
    if (args.mode !== 'rehearsal') {
      const proofPath = options.get('--maintenance-proof');
      ensurePrivateFile(proofPath);
      const proofBytes = readFileSync(proofPath);
      maintenanceProof = validateMaintenanceProof(JSON.parse(proofBytes.toString('utf8')));
      maintenanceProofSha256 = sha256(proofBytes);
    }
    sourceReceiptMeta = { sourceLockId: lock.lockId, sourceLockPid: lock.pid, maintenanceProofSha256, executionMode: args.mode };
    const assertProtection = createSourceFreezeProtection({ connectionUrl, lockReceiptPath, pkg, mode: args.mode, timeoutMs: args.timeoutMs, maintenanceProof });
    if (cloudBaseMode) await assertProtection();

    let manager = null;
    if (cloudBaseMode) {
      if (AUTH_IMPORT_ENV_ID !== TARGET_PROJECT) throw new Error('Installed CloudBase manager environment does not match the reviewed target project');
      manager = await loadCloudBaseManager(options.get('--manager-module'));
      if (typeof manager?.database?.executePGSql !== 'function') throw new Error('Installed CloudBase manager lacks executePGSql');
    }

    const receipt = await executeFreezeBatches({
      pkg,
      expectedSha256: options.get('--expected-sha256'),
      action: args.action,
      assertProtection,
      readSnapshot: cloudBaseMode
        ? () => readCloudBaseFreezeSnapshot(manager, pkg)
        : () => readSourceFreezeSnapshot(connectionUrl, pkg, args.timeoutMs),
      transport: cloudBaseMode
        ? (sql, batch) => sendCloudBaseFreezeBatch(manager, pkg, sql, batch)
        : (sql, batch) => {
          assertFreezeBatchBudget(pkg, batch);
          if (sql !== batch.sql) throw new Error('Freeze transport SQL differs from the reviewed batch');
          return runPsqlSingleMessage(connectionUrl, sql, { timeoutMs: args.timeoutMs });
        },
      onReceipt: (value) => persist({ ...value, ...sourceReceiptMeta }),
    });
    receipt.sourceLockId = lock.lockId;
    receipt.sourceLockPid = lock.pid;
    receipt.maintenanceProofSha256 = maintenanceProofSha256;
    persist(receipt);
    console.log(JSON.stringify({ status: 'OK', project: receipt.project, channel: receipt.channel, action: receipt.action, objects: receipt.objects, batches: receipt.completedBatches.length, totalMs: receipt.totalMs, receipt: path.basename(receiptPath) }));
  } catch (error) {
    const failed = error?.receipt
      ? { ...error.receipt, ...sourceReceiptMeta }
      : { ...lastReceipt, ...sourceReceiptMeta, state: 'STOPPED', failure: { name: error?.name ?? 'Error' }, finishedAt: new Date().toISOString() };
    try { persist(failed); } catch { /* The exclusive receipt may already contain the last durable boundary. */ }
    console.error('Freeze executor stopped; inspect the private receipt and database state before any later invocation.');
    process.exitCode = 1;
  }
}

/** Entrypoint called only by the guarded executor script. */
export async function runFreezeExecutorCli({ argv, parseExecutorArgs, executeFreezeBatches, loadVerifiedPackage, assertFreezeWindow }) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(FREEZE_EXECUTOR_HELP); return; }
  try {
    const args = parseExecutorArgs(argv);
    await executeCli(args, { executeFreezeBatches, loadVerifiedPackage, assertFreezeWindow });
  } catch (error) {
    const receiptIndex = argv.indexOf('--receipt');
    const receiptValue = receiptIndex >= 0 ? argv[receiptIndex + 1] : null;
    if (receiptValue) {
      const receiptPath = path.resolve(receiptValue);
      try {
        ensurePrivateOutputDirectory(path.dirname(receiptPath));
        if (!existsSync(receiptPath)) writePrivateFile(receiptPath, `${JSON.stringify({ version: 1, state: 'STOPPED', failure: { name: error?.name ?? 'Error' }, finishedAt: new Date().toISOString() }, null, 2)}\n`);
      } catch { /* Existing receipts are never overwritten. */ }
    }
    console.error('Freeze executor stopped; inspect the private receipt. No input values or SQL body logged.');
    process.exitCode = 1;
  }
}

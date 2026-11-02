#!/usr/bin/env node

// Source-side freeze/rollback executor. The package SQL travels as ONE
// simple-query protocol message (cutover-core runPsqlSingleMessage): the
// statement-at-a-time stdin transport cost one network round trip per
// statement and blew the local executor budget on 2026-11-02 23:17.
// SQL bytes and their SHA binding are never rewritten here.

import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildFreezeSnapshotSql } from './cutover-freeze.mjs';
import {
  assertLoopbackRehearsalUrl,
  ensurePrivateFile,
  isAuthorizedSourceIdentity,
  parsePostgresUrl,
  runPsqlSingleMessage,
} from './cutover-core.mjs';

const SOURCE_PROJECT = 'gcrhhxaopomtposmahsw';

export function parseExecutorArgs(argv) {
  const markers = argv.filter((flag) => ['--rehearsal', '--execute-authorized-source'].includes(flag));
  if (markers.length !== 1) throw new Error('Pass exactly one execution marker: --rehearsal or --execute-authorized-source');
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === markers[0]) continue;
    if (!['--package', '--baseline', '--action', '--snapshot-sql', '--receipt', '--timeout-ms'].includes(key)) {
      throw new Error(`Unknown option ${key}; use --help`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options.set(key, value);
    index += 1;
  }
  for (const required of ['--package', '--baseline', '--action', '--snapshot-sql', '--receipt']) {
    if (!options.has(required)) throw new Error(`Missing ${required}`);
  }
  const action = options.get('--action');
  if (!['freeze', 'rollback'].includes(action)) throw new Error('--action must be freeze or rollback');
  const snapshotSql = options.get('--snapshot-sql');
  if (!['full', 'excluded'].includes(snapshotSql)) throw new Error('--snapshot-sql must be full or excluded');
  const timeoutMs = Number(options.get('--timeout-ms') ?? '65000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1_200_000) throw new Error('--timeout-ms must be 1000..1200000');
  return { mode: markers[0].replace(/^--/, ''), action, snapshotSql, timeoutMs, options };
}

export function loadVerifiedPackage(packagePath, action) {
  ensurePrivateFile(packagePath);
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (pkg?.project !== SOURCE_PROJECT) throw new Error('Executor only handles source-side packages');
  const sql = action === 'freeze' ? pkg.apply : pkg.rollback;
  const expectedSha = action === 'freeze' ? pkg.applySha256 : pkg.rollbackSha256;
  if (typeof sql !== 'string' || typeof expectedSha !== 'string') throw new Error('Package is missing the requested SQL or digest');
  const actualSha = createHash('sha256').update(sql).digest('hex');
  if (actualSha !== expectedSha) throw new Error('Package SQL digest mismatch; refusing to connect');
  return { sql, sha256: expectedSha, objects: pkg.objects, snapshotSqlVariant: pkg.snapshotSqlVariant };
}

export function deriveExpectedState(baseline, action) {
  if (!Array.isArray(baseline) || baseline.length === 0) throw new Error('Baseline snapshot must be a non-empty array');
  return action === 'freeze' ? baseline.map((entry) => ({ ...entry, grants: [] })) : baseline;
}

function snapshotReadSql(snapshotSqlVariant) {
  const snapshotSql = buildFreezeSnapshotSql({ excludeExtensionMembers: snapshotSqlVariant === 'excluded' });
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; SELECT (s)::text AS snapshot FROM (${snapshotSql.replace(/;\s*$/, '')}) q(s); COMMIT;`;
}

async function readSnapshot(connectionUrl, snapshotSqlVariant, timeoutMs) {
  const result = await runPsqlSingleMessage(connectionUrl, snapshotReadSql(snapshotSqlVariant), { timeoutMs: Math.min(timeoutMs, 30_000) });
  const withRows = result.rowSets.filter((rows) => rows.length > 0);
  const text = withRows.length ? withRows[withRows.length - 1][0]?.snapshot ?? null : null;
  return { result, text };
}

function validateConnection(connectionUrl, mode) {
  if (mode === 'rehearsal') return assertLoopbackRehearsalUrl(connectionUrl, { rehearsal: true });
  const parsed = parsePostgresUrl(connectionUrl);
  const identity = { host: parsed.host, port: parsed.env.PGPORT, user: parsed.env.PGUSER, database: parsed.database };
  if (!isAuthorizedSourceIdentity(identity)) throw new Error('Authorized source project mismatch');
  return parsed;
}

export async function executeFreezeAction({ connectionUrl, mode, packagePath, baselinePath, action, snapshotSql, receiptPath, timeoutMs }) {
  validateConnection(connectionUrl, mode);
  const { sql, sha256, objects, snapshotSqlVariant } = loadVerifiedPackage(packagePath, action);
  if (snapshotSqlVariant !== snapshotSql) throw new Error(`Package was built with the ${snapshotSqlVariant} snapshot; refusing to run with --snapshot-sql ${snapshotSql}`);
  ensurePrivateFile(baselinePath);
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const expectedPost = deriveExpectedState(baseline, action);
  // Before a freeze the ACL must equal the baseline; before a rollback it must
  // equal the frozen state. Each action's pre-state is the other's post-state.
  const expectedPre = deriveExpectedState(baseline, action === 'freeze' ? 'rollback' : 'freeze');

  const notices = [];
  const collectNotice = (notice) => {
    if (notices.length < 50) notices.push({ severity: notice?.severity ?? null, message: notice?.message ?? null });
  };
  const receipt = {
    at: new Date().toISOString(), mode, action, project: SOURCE_PROJECT, objects,
    snapshotSqlVariant, packageSha256: sha256, sqlBytes: Buffer.byteLength(sql),
    preStateMatched: null, postStateMatched: null, executed: false, notices, failure: null,
  };

  let failure = null;
  try {
    const preStarted = Date.now();
    const pre = await readSnapshot(connectionUrl, snapshotSql, timeoutMs);
    const preMs = Date.now() - preStarted;
    const preState = pre.text ? JSON.parse(pre.text) : null;
    receipt.preStateMatched = JSON.stringify(preState) === JSON.stringify(expectedPre);
    receipt.preRead = { ms: preMs, roundTrips: pre.result.roundTrips };
    if (!receipt.preStateMatched) throw new Error(`Pre-execution ACL does not match the expected ${action === 'freeze' ? 'baseline' : 'frozen'} state; no SQL was sent`);

    const execute = await runPsqlSingleMessage(connectionUrl, sql, { timeoutMs, onNotice: collectNotice });
    receipt.executed = true;
    receipt.execute = { ms: execute.timing.queryMs, connectMs: execute.timing.connectMs, roundTrips: execute.roundTrips, statementResults: execute.statementResults, lastCommand: execute.lastCommand };
    if (execute.lastCommand !== 'COMMIT') throw new Error(`Batch did not commit (last command ${execute.lastCommand})`);

    const postStarted = Date.now();
    const post = await readSnapshot(connectionUrl, snapshotSql, timeoutMs);
    const postMs = Date.now() - postStarted;
    const postState = post.text ? JSON.parse(post.text) : null;
    receipt.postStateMatched = JSON.stringify(postState) === JSON.stringify(expectedPost);
    receipt.postRead = { ms: postMs, roundTrips: post.result.roundTrips };
    if (!receipt.postStateMatched) throw new Error('Post-execution ACL state does not match the predicted state');
  } catch (error) {
    failure = error;
    receipt.failure = String(error.message).slice(0, 400);
  }
  receipt.totalMs = Date.now() - Date.parse(receipt.at);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(receiptPath, 0o600);
  if (failure) throw failure;
  return receipt;
}

const HELP = `DYData source freeze executor (single-message transport)

Usage:
  DYDATA_CUTOVER_SOURCE_URL='postgresql://...' node scripts/cloudbase/cutover-freeze-executor.mjs \\
    --rehearsal|--execute-authorized-source \\
    --package PRIVATE_PACKAGE.json --baseline PRIVATE_BASELINE.json \\
    --action freeze|rollback --snapshot-sql full|excluded \\
    --receipt NEW_PRIVATE_RECEIPT.json [--timeout-ms 65000]

--rehearsal only accepts loopback cutover_rehearsal_* databases.
--execute-authorized-source only accepts the two exact source identities.
The connection URL is never printed. The package SQL is sent as a single
simple-query protocol message; its SHA is verified before connecting.`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return; }
  if (!process.env.DYDATA_CUTOVER_SOURCE_URL) throw new Error('Set DYDATA_CUTOVER_SOURCE_URL in the environment; its value is never printed');
  const args = parseExecutorArgs(argv);
  const receipt = await executeFreezeAction({
    connectionUrl: process.env.DYDATA_CUTOVER_SOURCE_URL,
    mode: args.mode,
    packagePath: args.options.get('--package'),
    baselinePath: args.options.get('--baseline'),
    action: args.action,
    snapshotSql: args.snapshotSql,
    receiptPath: args.options.get('--receipt'),
    timeoutMs: args.timeoutMs,
  });
  console.log(JSON.stringify({ status: 'OK', action: receipt.action, objects: receipt.objects, executeMs: receipt.execute.ms, totalMs: receipt.totalMs, roundTrips: receipt.execute.roundTrips }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

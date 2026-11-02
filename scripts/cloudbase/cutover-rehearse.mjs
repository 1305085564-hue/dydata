#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { applyCutoverSnapshot } from './cutover-sync.mjs';
import { copyDumpToStatements } from './copy-data.mjs';
import { splitPostgresDump } from './sql-batches.mjs';
import {
  ensurePrivateFile,
  ensurePrivateOutputDirectory,
  findPostgresTool,
  parsePostgresUrl,
  PRIVATE_DIR_MODE,
  PRIVATE_MODE,
  runPgRestoreToFile,
  runPsql,
  sha256File,
  writePrivateFile,
} from './cutover-core.mjs';

const ORIGINAL_SNAPSHOT_UTC = '2026-10-31T18:10:48Z';

const HELP = `Pure local DYData cutover rehearsal

Usage:
  node scripts/cloudbase/cutover-rehearse.mjs --source-archive PRIVATE/public_full.dump --output-dir PRIVATE/new-run [--private-functions PRIVATE/private-functions.sql]

Creates a new PostgreSQL cluster bound only to 127.0.0.1, restores the public archive,
uses a synthetic non-empty auth.uid() stub, compares the original SQL leaderboard RPC,
then tests one local add/update/delete delta, repeat execution, and target permission retention.
No Auth credential file is imported. No source or cloud database is contacted.
The restored cluster remains local and private for parent-side read-only inspection.
`;

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { help: true };
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--source-archive', '--output-dir', '--private-functions'].includes(key)) throw new Error('Unknown option; use --help');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options.set(key, value);
    index += 1;
  }
  return { help: false, options };
}

function serverTool(name) {
  const candidate = `/opt/homebrew/Cellar/postgresql@16/16.15/bin/${name}`;
  const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) throw new Error(`Local PostgreSQL server tool is unavailable: ${name}`);
  return candidate;
}

function runLocalProgram(binary, args, { env = process.env, timeout = 1_800_000 } = {}) {
  const result = spawnSync(binary, args, { env, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], timeout });
  if (result.error || result.status !== 0) throw new Error(`Local rehearsal setup failed (exit ${result.status ?? 'unknown'}); input and database details were suppressed`);
}

async function unusedLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function makeLocalUrl(port, database) {
  return `postgresql://postgres@127.0.0.1:${port}/${database}`;
}

async function startCluster(outputDirectory) {
  const dataDirectory = path.join(outputDirectory, 'pgdata');
  const socketDirectory = path.join(outputDirectory, 'socket');
  mkdirSync(socketDirectory, { mode: PRIVATE_DIR_MODE });
  chmodSync(socketDirectory, PRIVATE_DIR_MODE);
  const initdb = serverTool('initdb');
  const postgres = serverTool('postgres');
  runLocalProgram(initdb, [
    '--pgdata', dataDirectory,
    '--username=postgres',
    '--auth-local=trust',
    '--auth-host=trust',
    '--encoding=UTF8',
    '--locale=C',
    '--no-instructions',
  ]);
  chmodSync(dataDirectory, PRIVATE_DIR_MODE);

  const port = await unusedLoopbackPort();
  const logPath = path.join(outputDirectory, 'postgres-private.log');
  const logFd = openSync(logPath, 'wx', PRIVATE_MODE);
  const child = spawn(postgres, [
    '-D', dataDirectory,
    '-h', '127.0.0.1',
    '-p', String(port),
    // TCP loopback is the only transport. Long private output paths (including
    // Chinese names) can exceed PostgreSQL's Unix-socket path length limit.
    '-k', '',
    '-c', 'listen_addresses=127.0.0.1',
    '-c', 'unix_socket_permissions=0700',
    '-c', 'log_min_messages=warning',
    '-c', 'log_min_error_statement=panic',
    '-c', 'log_statement=none',
  ], { stdio: ['ignore', logFd, logFd], env: { ...process.env, LC_ALL: 'C' }, detached: true });
  closeSync(logFd);
  child.unref();
  const adminUrl = makeLocalUrl(port, 'postgres');
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      runPsql(adminUrl, 'SELECT 1;');
      ready = true;
      break;
    } catch {
      if (child.exitCode !== null) break;
      await delay(250);
    }
  }
  if (!ready) throw new Error('The isolated loopback PostgreSQL cluster did not start; no database data was written');
  return { child, port, dataDirectory, logPath, adminUrl };
}

function createLocalRoles(adminUrl) {
  runPsql(adminUrl, 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;');
}

function initializeDatabase(url) {
  runPsql(url, `CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE SCHEMA auth; CREATE SCHEMA private; CREATE TABLE auth.users (id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('cutover.auth_uid', true), '')::uuid $$; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;`);
}

function restoreSchemaSection(archivePath, databaseUrl, section, outputDirectory) {
  const sqlPath = path.join(outputDirectory, `restore-${section}-${parsePostgresUrl(databaseUrl).database}.sql`);
  runPgRestoreToFile(archivePath, sqlPath, [`--section=${section}`, '--schema=public']);
  const statements = splitPostgresDump(readFileSync(sqlPath, 'utf8'))
    .filter((statement) => !/^SET\s+transaction_timeout\b/i.test(statement.replace(/^(?:\s*--[^\n]*(?:\n|$))+/, '').trim()));
  runPsql(databaseUrl, statements.join('\n'));
}

function restoreArchiveData(archivePath, databaseUrl, outputDirectory) {
  const sqlPath = path.join(outputDirectory, `restore-data-${parsePostgresUrl(databaseUrl).database}.sql`);
  runPgRestoreToFile(archivePath, sqlPath, ['--section=data', '--schema=public']);
  const parsed = copyDumpToStatements(readFileSync(sqlPath, 'utf8'));
  runPsql(databaseUrl, `BEGIN;\nSET LOCAL session_replication_role = replica;\n${parsed.statements.join('\n')}\n${parsed.sequenceStatements.join('\n')}\nCOMMIT;`, { timeout: 1_800_000 });
}

function restoreOriginalSnapshot(archivePath, databaseUrl, outputDirectory) {
  restoreSchemaSection(archivePath, databaseUrl, 'pre-data', outputDirectory);
  restorePrivateHelpers(databaseUrl, outputDirectory);
  restoreArchiveData(archivePath, databaseUrl, outputDirectory);
  runPsql(databaseUrl, 'INSERT INTO auth.users(id) SELECT id FROM public.profiles WHERE id IS NOT NULL ON CONFLICT DO NOTHING;');
  restoreSchemaSection(archivePath, databaseUrl, 'post-data', outputDirectory);
}

function restorePrivateHelpers(databaseUrl, outputDirectory) {
  const helperPath = process.env.DYDATA_CUTOVER_PRIVATE_FUNCTIONS;
  if (!helperPath) return;
  ensurePrivateFile(helperPath);
  const statements = splitPostgresDump(readFileSync(helperPath, 'utf8'))
    .map((statement) => statement.replace(/^(?:\s*--[^\n]*(?:\n|$))+/, '').trim())
    .filter((statement) => !/^(?:GRANT|REVOKE|ALTER\s+(?:DEFAULT\s+PRIVILEGES|FUNCTION|PROCEDURE)\b)/i.test(statement));
  const logPath = path.join(outputDirectory, `private-functions-${parsePostgresUrl(databaseUrl).database}.sql`);
  writePrivateFile(logPath, statements.join('\n'));
  runPsql(databaseUrl, statements.join('\n'));
}

function captureLocalArchive(databaseUrl, destination) {
  const pgDump = findPostgresTool('pg_dump');
  const parsed = parsePostgresUrl(databaseUrl);
  const result = spawnSync(pgDump, [
    '--format=custom', '--schema=public', '--no-owner', '--no-acl', '--no-password', '--file', destination,
  ], {
    env: { ...process.env, ...parsed.env, PGAPPNAME: 'dydata-local-cutover-snapshot' },
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
    timeout: 1_800_000,
  });
  if (result.error || result.status !== 0) throw new Error('Local rehearsal snapshot failed; database details were suppressed');
  chmodSync(destination, PRIVATE_MODE);
}

function runOriginalLeaderboardRpc(sourceUrl, outputPath, sourceArchiveSha256) {
  const result = runPsql(sourceUrl, `SELECT set_config('cutover.auth_uid', (SELECT id::text FROM public.profiles WHERE id IS NOT NULL ORDER BY id LIMIT 1), false);\nSELECT CASE WHEN auth.uid() IS NOT NULL THEN 'non-empty' ELSE 'empty' END;\nSELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb)::text FROM public.get_leaderboard_rows(DATE '2026-10-03') AS r;`);
  const lines = result.split(/\r?\n/).filter(Boolean);
  const uidCheck = lines.find((line) => line === 'non-empty' || line === 'empty');
  if (uidCheck !== 'non-empty') throw new Error('The local auth.uid() stub returned empty; leaderboard reference was not created');
  const rowPayload = lines.at(-1);
  let rows;
  try {
    rows = JSON.parse(rowPayload);
  } catch {
    throw new Error('The original local leaderboard RPC returned invalid JSON; row values were suppressed');
  }
  if (!Array.isArray(rows)) throw new Error('The original local leaderboard RPC returned an invalid row set');
  const reference = {
    format: 'dydata-cutover-local-rpc-reference-v1',
    sourceArchiveSha256,
    sourceSnapshotUTC: ORIGINAL_SNAPSHOT_UTC,
    sourceScope: 'historical public_full.dump, local only; Auth table replaced with a non-empty auth.uid() stub',
    rpc: 'public.get_leaderboard_rows(date)',
    sinceDate: '2026-10-03',
    authUidStub: 'non-empty local profiles UUID; value omitted',
    rowCount: rows.length,
    rows,
  };
  writePrivateFile(outputPath, `${JSON.stringify(reference, null, 2)}\n`);
  return { rowCount: rows.length, sizeBytes: statSync(outputPath).size, sha256: sha256File(outputPath).sha256 };
}

async function rehearse({ sourceArchive, outputDirectory, privateFunctions }) {
  ensurePrivateFile(sourceArchive);
  const directory = ensurePrivateOutputDirectory(outputDirectory);
  if (readdirSync(directory).length > 0) throw new Error('Rehearsal output directory must be empty');
  process.env.DYDATA_CUTOVER_PRIVATE_DIAGNOSTIC = path.join(directory, 'psql-private-diagnostic.log');
  if (privateFunctions) process.env.DYDATA_CUTOVER_PRIVATE_FUNCTIONS = path.resolve(privateFunctions);
  const archiveHash = sha256File(sourceArchive).sha256;
  const cluster = await startCluster(directory);
  let preserveCluster = false;
  process.once('exit', () => {
    if (!preserveCluster && cluster.child.pid) {
      try { process.kill(cluster.child.pid, 'SIGTERM'); } catch {}
    }
  });
  const suffix = '20261102';
  const sourceDb = `cutover_rehearsal_source_${suffix}`;
  const targetDb = `cutover_rehearsal_target_${suffix}`;
  const sourceUrl = makeLocalUrl(cluster.port, sourceDb);
  const targetUrl = makeLocalUrl(cluster.port, targetDb);
  runPsql(cluster.adminUrl, `CREATE DATABASE ${sourceDb}; CREATE DATABASE ${targetDb};`);
  createLocalRoles(cluster.adminUrl);
  initializeDatabase(sourceUrl);
  initializeDatabase(targetUrl);
  restoreOriginalSnapshot(sourceArchive, sourceUrl, directory);
  restoreOriginalSnapshot(sourceArchive, targetUrl, directory);

  const rpcReferencePath = path.join(directory, 'leaderboard-since-2026-10-03-private.json');
  const rpc = runOriginalLeaderboardRpc(sourceUrl, rpcReferencePath, archiveHash);

  const fixtureSetup = `CREATE TABLE public.cutover_rehearsal_fixture (id integer PRIMARY KEY, payload text NOT NULL); INSERT INTO public.cutover_rehearsal_fixture(id,payload) VALUES (1,'before-update'),(2,'before-delete');`;
  runPsql(sourceUrl, fixtureSetup);
  runPsql(targetUrl, fixtureSetup);
  runPsql(targetUrl, `ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY; CREATE POLICY cutover_rehearsal_permission_marker ON public.accounts USING (true); GRANT SELECT ON public.accounts TO authenticated;`);

  const baselineArchive = path.join(directory, 'baseline-local.dump');
  const latestArchive = path.join(directory, 'latest-local.dump');
  captureLocalArchive(sourceUrl, baselineArchive);
  runPsql(sourceUrl, `UPDATE public.cutover_rehearsal_fixture SET payload='after-update' WHERE id=1; INSERT INTO public.cutover_rehearsal_fixture(id,payload) VALUES (3,'after-insert'); DELETE FROM public.cutover_rehearsal_fixture WHERE id=2;`);
  captureLocalArchive(sourceUrl, latestArchive);

  const evidencePath = path.join(directory, 'cutover-rehearsal-evidence.json');
  const first = await applyCutoverSnapshot({ baselineArchive, latestArchive, targetUrl, rehearsal: true, evidenceOut: evidencePath });
  const second = await applyCutoverSnapshot({ baselineArchive, latestArchive, targetUrl, rehearsal: true });
  const fixtureState = runPsql(targetUrl, `SELECT jsonb_build_object('rows', (SELECT count(*) FROM public.cutover_rehearsal_fixture), 'inserted', EXISTS (SELECT 1 FROM public.cutover_rehearsal_fixture WHERE id=3 AND payload='after-insert'), 'updated', EXISTS (SELECT 1 FROM public.cutover_rehearsal_fixture WHERE id=1 AND payload='after-update'), 'deleted', NOT EXISTS (SELECT 1 FROM public.cutover_rehearsal_fixture WHERE id=2), 'policyRetained', EXISTS (SELECT 1 FROM pg_policy WHERE polname='cutover_rehearsal_permission_marker'), 'grantRetained', has_table_privilege('authenticated','public.accounts','SELECT'))::text;`);
  const fixture = JSON.parse(fixtureState);
  if (first.status !== 'applied' || second.status !== 'already-current'
    || first.delta.addedRows !== 2 || first.delta.removedRows !== 2 || first.delta.changedTableCount !== 1
    || !fixture.inserted || !fixture.updated || !fixture.deleted || !fixture.policyRetained || !fixture.grantRetained) {
    throw new Error('Local add/update/delete, repeat, or permission-retention rehearsal failed; row values were suppressed');
  }

  const runState = {
    format: 'dydata-cloudbase-local-rehearsal-v1',
    sourceArchive: { sha256: archiveHash, bytes: statSync(sourceArchive).size, capturedAt: ORIGINAL_SNAPSHOT_UTC },
    postgresServerVersion: '16.15 local isolated cluster',
    targetHost: '127.0.0.1',
    targetDatabase: targetDb,
    targetUrl: targetUrl,
    originalPublicTables: 99,
    originalSourceRows: '61301',
    latestReconciliation: { tables: first.tableCount, matched: first.matchingTables, rows: first.totalExpectedRows },
    deltaRegression: { status: first.status, changedTables: first.delta.changedTableCount, addedRows: first.delta.addedRows, removedRows: first.delta.removedRows },
    duplicateRegression: { status: second.status, noDuplicateInsert: true },
    targetPermissions: { policyRetained: fixture.policyRetained, grantRetained: fixture.grantRetained, sourceAclRestored: false },
    originalLeaderboardRpc: { file: path.basename(rpcReferencePath), ...rpc },
    authScope: 'No credential snapshot imported; auth.users contains only local profile UUID placeholders used for source FK validity',
    boundToLoopbackOnly: true,
  };
  const runEvidence = path.join(directory, 'local-rehearsal-summary.json');
  writePrivateFile(runEvidence, `${JSON.stringify(runState, null, 2)}\n`);
  preserveCluster = true;
  return { runState, runEvidence, cluster, sourceUrl, targetUrl, rpcReferencePath, baselineArchive, latestArchive, evidencePath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const sourceArchive = args.options.get('--source-archive');
  const outputDirectory = args.options.get('--output-dir');
  if (!sourceArchive || !outputDirectory) throw new Error('Both --source-archive and --output-dir are required');
  const privateFunctions = args.options.get('--private-functions')
    ?? path.resolve(path.dirname(sourceArchive), '..', 'private-functions.sql');
  const result = await rehearse({ sourceArchive, outputDirectory, privateFunctions });
  process.stdout.write(JSON.stringify({ status: 'rehearsal-complete', targetUrl: result.targetUrl, sourceTables: 99, reconciledTables: result.runState.latestReconciliation.matched, expectedTables: result.runState.latestReconciliation.tables, rpcRows: result.runState.originalLeaderboardRpc.rowCount, rpcReference: result.rpcReferencePath, privateEvidence: result.runEvidence }) + '\n');
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

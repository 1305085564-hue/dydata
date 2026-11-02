#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ensurePrivateOutputDirectory,
  findPostgresTool,
  parsePostgresUrl,
  PRIVATE_MODE,
  sha256File,
  writePrivateFile,
} from './cutover-core.mjs';

import { validateLockSource, lockSourceIdentity } from './cutover-lock-keeper.mjs';
import { assertSnapshotLockBinding, assertSourceLockReceipt } from './cutover-cloudbase-driver.mjs';

const HELP = `DYData read-only cutover snapshot export

Usage:
  DYDATA_CUTOVER_SOURCE_URL='postgresql://…' node scripts/cloudbase/cutover-export.mjs --output-dir /private/path/new-bundle [--source-lock-receipt /private/held.json]

The exporter opens one read-only, serializable, deferrable transaction, exports its PostgreSQL
snapshot, and uses that snapshot for both the complete public custom-format archive and the
complete database archive and separate private Auth JSON file. It never prints the connection URL, row values, hashes of Auth
records, passwords or tokens. All output files are owner-only and must stay outside the repository.

Production export has not been run in this task; only the existing local archive was used for rehearsal.
`;

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { help: true };
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--output-dir','--source-lock-receipt'].includes(key)) throw new Error('Unknown option; use --help');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for --output-dir');
    options.set(key, value);
    index += 1;
  }
  return { help: false, options };
}

function sourceProcessEnv(applicationName) {
  const parsed = parsePostgresUrl(process.env.DYDATA_CUTOVER_SOURCE_URL ?? '');
  const env = { ...process.env, ...parsed.env, PGAPPNAME: applicationName, PGCONNECT_TIMEOUT: '10' };
  delete env.DYDATA_CUTOVER_SOURCE_URL;
  return env;
}

function waitForSnapshotExporter(psql) {
  return new Promise((resolve, reject) => {
    const env = sourceProcessEnv('dydata-cutover-readonly-export');
    const child = spawn(psql, ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1'], {
      env,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let output = '';
    let settled = false;
    let timer;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      reject(new Error('Could not establish the read-only export snapshot; connection details were suppressed'));
    };
    timer = setTimeout(fail, 30_000);
    timer.unref?.();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const line = output.split(/\r?\n/).find((value) => value.startsWith('{'));
      if (!line || settled) return;
      try {
        const value = JSON.parse(line);
        if (typeof value.snapshot !== 'string' || typeof value.capturedAt !== 'string') return;
        settled = true;
        clearTimeout(timer);
        resolve({ child, snapshot: value.snapshot, capturedAt: value.capturedAt });
      } catch {
        // Keep waiting for the complete line; psql may split output chunks arbitrarily.
      }
    });
    child.on('error', fail);
    child.on('exit', (code) => {
      if (!settled) fail();
      else if (code !== 0) child.__cutoverExitError = true;
    });
    child.stdin.write(
      `BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE;\nSELECT jsonb_build_object('snapshot', pg_export_snapshot(), 'capturedAt', transaction_timestamp())::text;\n\\prompt _cutover_release\n`,
    );
  });
}

async function releaseSnapshotExporter(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  const onExit = () => resolveExit();
  child.once('exit', onExit);
  try {
    child.stdin.write('release\nCOMMIT;\n\\q\n');
    child.stdin.end();
  } catch {
    child.kill('SIGTERM');
  }
  let timeout;
  const completed = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => { timeout = setTimeout(() => resolve(false), 5_000); }),
  ]);
  clearTimeout(timeout);
  if (!completed) {
    child.kill('SIGTERM');
    let killTimeout;
    await Promise.race([exited, new Promise((resolve) => { killTimeout = setTimeout(resolve, 1_000); })]);
    clearTimeout(killTimeout);
  }
  child.removeListener('exit', onExit);
}

function writeFailedReceipt(directory, { stage, capturedAt }) {
  const partialFiles = [];
  for (const file of ['database_full.dump', 'public_full.dump', 'auth_users_private.json', 'manifest.json']) {
    const fullPath = path.join(directory, file);
    if (!existsSync(fullPath)) continue;
    const stat = statSync(fullPath);
    partialFiles.push({
      file,
      bytes: stat.size,
      ownerOnly: (stat.mode & 0o077) === 0,
      containsSensitiveCredentials: file === 'auth_users_private.json',
    });
  }
  const receipt = {
    format: 'dydata-cutover-export-failure-v1',
    status: 'failed; partial files preserved for review',
    failedStage: stage,
    ...(capturedAt ? { capturedAt } : {}),
    partialFiles,
    sourceDatabaseWrites: false,
    credentialValuesWrittenToLogs: false,
    nextRunRequiresNewEmptyPrivateDirectory: true,
  };
  try {
    writePrivateFile(path.join(directory, 'failed-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  } catch {
    // Preserve partial artifacts even if a failure receipt cannot be written.
  }
}

function runSnapshotAuthExport(snapshot, capturedAt, outputPath) {
  const psql = findPostgresTool('psql');
  const sql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET TRANSACTION SNAPSHOT '${snapshot.replaceAll("'", "''")}';\nSELECT jsonb_build_object('capturedAt', '${capturedAt.replaceAll("'", "''")}', 'sourceUsers', coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password, 'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until, 'created_at', u.created_at) ORDER BY u.id), '[]'::jsonb))::text FROM auth.users AS u;\nCOMMIT;\n`;
  const result = spawnSync(psql, ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8',
    env: sourceProcessEnv('dydata-cutover-private-auth-export'),
    timeout: 1_200_000,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0 || !result.stdout.trim().startsWith('{')) {
    throw new Error('The private Auth export failed; credentials and database output were suppressed');
  }
  writePrivateFile(outputPath, `${result.stdout.trim()}\n`);
}

function runPublicDump(snapshot, outputPath, fullDatabase = false) {
  const pgDump = findPostgresTool('pg_dump');
  const result = spawnSync(pgDump, [
    '--format=custom',
    ...(fullDatabase?[]:['--schema=public']),
    `--snapshot=${snapshot}`,
    '--file', outputPath,
    '--no-password',
  ], {
    encoding: 'utf8',
    env: sourceProcessEnv('dydata-cutover-public-export'),
    timeout: 1_800_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (result.error || result.status !== 0) {
    throw new Error('The read-only public archive failed; source details were suppressed');
  }
  chmodSync(outputPath, PRIVATE_MODE);
}

export async function exportConsistentBundle(outputDirectory, { sourceLockReceipt } = {}) {
  const readLock=()=>JSON.parse(readFileSync(sourceLockReceipt,'utf8'));
  const held=sourceLockReceipt?readLock():null;
  if(held){assertSourceLockReceipt(held,Date.now(),{allowRehearsal:true});const actual=lockSourceIdentity(validateLockSource(process.env.DYDATA_CUTOVER_SOURCE_URL,held.rehearsal));if(JSON.stringify(actual)!==JSON.stringify(held.source))throw Error('Export connection differs from locked source');}
  if (!process.env.DYDATA_CUTOVER_SOURCE_URL) throw new Error('Set DYDATA_CUTOVER_SOURCE_URL in the environment; its value is never printed');
  parsePostgresUrl(process.env.DYDATA_CUTOVER_SOURCE_URL);
  const directory = ensurePrivateOutputDirectory(outputDirectory);
  if (readdirSync(directory).length > 0) throw new Error('Cutover output directory must be empty');

  const publicArchive = path.join(directory, 'public_full.dump');
  const databaseArchive=path.join(directory,'database_full.dump');
  const authPrivate = path.join(directory, 'auth_users_private.json');
  const manifestPath = path.join(directory, 'manifest.json');
  const psql = findPostgresTool('psql');
  let exported;
  let stage = 'snapshot';
  try {
    exported = await waitForSnapshotExporter(psql);
    stage = 'full database archive';
    runPublicDump(exported.snapshot,databaseArchive,true);
    stage = 'public archive';
    runPublicDump(exported.snapshot, publicArchive);
    stage = 'private Auth sidecar';
    runSnapshotAuthExport(exported.snapshot, exported.capturedAt, authPrivate);
    stage = 'manifest';
    const binding=held?{sourceLock:{lockId:held.lockId,acquiredAt:held.acquiredAt,pid:held.pid,source:held.source,closesAt:held.closesAt,project:held.project,rehearsal:held.rehearsal},capturedAt:exported.capturedAt}:null;
    if(binding)assertSnapshotLockBinding(binding,readLock(),Date.now(),{allowRehearsal:true});
    const manifest = {
      format: 'dydata-cutover-source-manifest-v1',
      capturedAt: exported.capturedAt,
      consistentReadOnlySnapshot: true,
      ...(binding?{sourceLock:binding.sourceLock}:{}),
      database:{file:path.basename(databaseArchive),...sha256File(databaseArchive),scope:'all pg_dump-visible non-system schemas, including managed Auth/Storage metadata; no role globals, COS bytes or provider backups'},
      transaction: 'SERIALIZABLE READ ONLY DEFERRABLE; public pg_dump and Auth query imported the same exported snapshot',
      public: {
        file: path.basename(publicArchive),
        ...sha256File(publicArchive),
        scope: 'complete public schema archive including definitions, tables, views, functions, sequences, indexes, constraints, triggers, policies and source ACL metadata',
      },
      auth: {
        file: path.basename(authPrivate),
        ...sha256File(authPrivate),
        ownerOnly: true,
        includesSensitiveCredentials: true,
        includedFields: ['id', 'email', 'encrypted_password', 'email_confirmed_at', 'banned_until', 'created_at'],
        valuesOmittedFromManifest: true,
      },
      excluded: ['COS/storage object bytes','PostgreSQL cluster global roles and platform configuration outside the database'],
      migrationInputs:'Only public archive and Auth allowlist are migration inputs; database_full.dump is a private disaster-recovery backup, never restore managed schemas to CloudBase',
      targetWrites: false,
    };
    writePrivateFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { directory, manifest, manifestPath };
  } catch (error) {
    writeFailedReceipt(directory, { stage, capturedAt: exported?.capturedAt });
    throw error;
  } finally {
    if (exported?.child) await releaseSnapshotExporter(exported.child);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const outputDirectory = args.options.get('--output-dir');
  if (!outputDirectory) throw new Error('Missing required option --output-dir');
  const result = await exportConsistentBundle(outputDirectory,{sourceLockReceipt:args.options.get('--source-lock-receipt')});
  process.stdout.write(JSON.stringify({ status: 'exported', consistentSnapshot: true, publicArchiveSha256: result.manifest.public.sha256, authSidecar: 'private', manifest: path.basename(result.manifestPath) }) + '\n');
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

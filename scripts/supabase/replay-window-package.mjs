// Offline package reproduction and empty, loopback-only Supabase clock rehearsal.
// This script never reads environment files or opens a remote database connection.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApply, buildRollback, emptyDatabaseAssertion, quote, snapshotQuery } from './permission-batch-a.mjs';

export function boundWindow(transaction, start, end) {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  assert(iso.test(start) && iso.test(end) && Number.isFinite(Date.parse(start)) && Date.parse(start) < Date.parse(end), 'Invalid approved window');
  assert(transaction.startsWith('BEGIN;') && /COMMIT;\s*$/.test(transaction), 'Expected one bounded transaction');
  // Keep the reviewed formatting: fixed original inputs reproduce original bytes.
  const gate = `DO $approved_window$ BEGIN IF clock_timestamp()<${quote(start)}::timestamptz OR clock_timestamp()>=${quote(end)}::timestamptz THEN RAISE EXCEPTION 'Outside approved production window' USING ERRCODE='55000'; END IF; END $approved_window$;`;
  return transaction.replace('BEGIN;', `BEGIN;\n${gate}`).replace(/COMMIT;\s*$/, `${gate}\nCOMMIT;\n`);
}

export function validateReplayPaths(localDirectory, outputDirectory) {
  assert(typeof localDirectory === 'string' && /^\/tmp\/dydata-supabase-batch-a-[a-zA-Z0-9_-]+$/.test(localDirectory), 'Explicit local lab directory required');
  assert(!lstatSync(localDirectory).isSymbolicLink(), 'Local symbolic link aliases are forbidden');
  assert(typeof outputDirectory === 'string' && dirname(outputDirectory) === localDirectory && resolve(outputDirectory) === outputDirectory && /^replay-[a-zA-Z0-9._-]+$/.test(basename(outputDirectory)), 'Output must be a new direct replay child of the local lab');
  assert(!existsSync(outputDirectory), 'Refuse existing output directory');
  return { localDirectory, outputDirectory };
}

export function replayWindowPackage({ localDirectory, outputDirectory, before, expectedAfter, approvedStart, approvedEnd }) {
  validateReplayPaths(localDirectory, outputDirectory);
  const originalApply = boundWindow(buildApply(before), approvedStart, approvedEnd);
  const originalRollback = boundWindow(buildRollback(before, expectedAfter), approvedStart, approvedEnd);
  const bootstrap = JSON.parse(readFileSync(join(localDirectory, 'bootstrap-receipt.json'), 'utf8'));
  const config = readFileSync(join(localDirectory, 'supabase/config.toml'), 'utf8');
  const project = config.match(/^project_id = "([^"]+)"/m)?.[1];
  assert.equal(project, basename(localDirectory), 'Local config/project mismatch');
  assert.equal(bootstrap.project, project, 'Local bootstrap receipt mismatch');
  assert.equal(bootstrap.productionAccessed, false);
  assert.equal(bootstrap.productionDataImported, false);
  assert.equal(bootstrap.counts.tables, 99);
  mkdirSync(outputDirectory, { mode: 0o700 });
  const save = (name, value) => writeFileSync(join(outputDirectory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  const records = [];
  const sql = (text, name) => {
    try {
      const stdout = execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-XAtq'], {
        input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000,
      });
      if (name) save(`${name}.stdout.log`, stdout);
      return stdout.trim();
    } catch (error) {
      if (name) {
        save(`${name}.stdout.log`, String(error.stdout ?? ''));
        save(`${name}.stderr.log`, String(error.stderr ?? ''));
      }
      throw error;
    }
  };
  const snapshot = () => JSON.parse(sql(snapshotQuery));
  // Before ANY function replacement, and after every scenario: no identities or data.
  sql(emptyDatabaseAssertion, 'empty-entry');
  const localBefore = snapshot();
  save('local-before.json', localBefore);
  // Local raw ACL order may differ from production. The unchanged reviewed-source
  // guard checks definitions/owner/config/effective grants; local drift and rollback
  // below remain bound to the complete, unnormalised local snapshot.
  buildApply(localBefore);
  const apply = buildApply(localBefore);
  const now = Date.now();
  const localStart = new Date(now - 60_000).toISOString();
  const localEnd = new Date(now + 10 * 60_000).toISOString();
  const futureStart = new Date(now + 20 * 60_000).toISOString();
  const futureEnd = new Date(now + 30 * 60_000).toISOString();
  const expiredStart = new Date(now - 20 * 60_000).toISOString();
  const expiredEnd = new Date(now - 10 * 60_000).toISOString();
  const reject = (transaction, start, end, expected, name) => {
    let error;
    try { sql(boundWindow(transaction, start, end), name); } catch (caught) { error = caught; }
    assert(error && String(error.stderr).includes('Outside approved production window'), `${name} must fail at the clock guard`);
    assert.deepEqual(snapshot(), expected, `${name} changed metadata`);
    sql(emptyDatabaseAssertion);
    records.push({ name, result: 'PASS', nonzeroExit: error.status, metadataUnchanged: true });
  };
  let localAfter;
  try {
    reject(apply, futureStart, futureEnd, localBefore, 'future-apply');
    reject(apply, expiredStart, expiredEnd, localBefore, 'expired-apply');
    sql(boundWindow(apply, localStart, localEnd), 'allowed-apply');
    localAfter = snapshot();
    save('local-after.json', localAfter);
    assert.deepEqual(localAfter.functions, expectedAfter.functions, 'Real applied functions differ from supplied expected state');
    sql(emptyDatabaseAssertion);
    records.push({ name: 'allowed-apply', result: 'PASS', functionsExactlyExpected: true });
    const rollback = buildRollback(localBefore, localAfter);
    reject(rollback, futureStart, futureEnd, localAfter, 'future-rollback');
    reject(rollback, expiredStart, expiredEnd, localAfter, 'expired-rollback');
    sql(boundWindow(rollback, localStart, localEnd), 'allowed-rollback');
    localAfter = undefined;
    assert.deepEqual(snapshot(), localBefore, 'Exact local rollback failed');
    sql(emptyDatabaseAssertion);
    records.push({ name: 'allowed-rollback', result: 'PASS', exactOriginalMetadataRestored: true });
    // A past production approval stays expired even though local replay succeeds.
    if (Date.now() >= Date.parse(approvedEnd)) {
      reject(apply, approvedStart, approvedEnd, localBefore, 'fixed-approved-window-expired');
    }
  } catch (error) {
    save('failure.json', { message: error.message, records });
    // Only restore our empty lab from a known applied snapshot; never remote state.
    if (localAfter) {
      sql(boundWindow(buildRollback(localBefore, localAfter), localStart, localEnd), 'failure-local-rollback');
      assert.deepEqual(snapshot(), localBefore, 'Failure cleanup did not restore local metadata');
      sql(emptyDatabaseAssertion);
    }
    throw error;
  }
  const files = {
    'before-snapshot.json': JSON.stringify(before, null, 2),
    'expected-after-snapshot.json': JSON.stringify(expectedAfter, null, 2),
    'batch-a-authorized-apply.sql': originalApply,
    'batch-a-authorized-rollback.sql': originalRollback,
  };
  for (const [name, text] of Object.entries(files)) save(name, text);
  save('local-restored.json', snapshot());
  const receipt = {
    replayedAt: new Date().toISOString(), localProject: project, productionAccessed: false, productionWrites: 0,
    approvedStart, approvedEnd, localTestStart: localStart, localTestEnd: localEnd,
    approvedWindowExpired: Date.now() >= Date.parse(approvedEnd), records,
    files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')])),
  };
  save('replay-receipt.json', receipt);
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const names = ['local-dir', 'output-dir', 'before', 'after', 'approved-start', 'approved-end'];
  assert.equal(args.length, names.length * 2, 'Specify all six explicit replay options');
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i].replace(/^--/, '');
    assert(args[i].startsWith('--') && names.includes(name) && !(name in values), 'Invalid or duplicate replay option');
    values[name] = args[i + 1];
  }
  const receipt = replayWindowPackage({
    localDirectory: values['local-dir'], outputDirectory: values['output-dir'],
    before: JSON.parse(readFileSync(values.before, 'utf8')), expectedAfter: JSON.parse(readFileSync(values.after, 'utf8')),
    approvedStart: values['approved-start'], approvedEnd: values['approved-end'],
  });
  console.log(JSON.stringify(receipt));
}

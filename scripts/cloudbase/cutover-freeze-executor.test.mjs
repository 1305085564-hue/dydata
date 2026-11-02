import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pgClientOptions, runPsqlSingleMessage } from './cutover-core.mjs';
import { buildFreezePackage, buildFreezeSnapshotSql, FREEZE_SNAPSHOT_SQL } from './cutover-freeze.mjs';
import { deriveExpectedState, loadVerifiedPackage, parseExecutorArgs } from './cutover-freeze-executor.mjs';

test('single-message client options parse the URL without echoing credentials', () => {
  const options = pgClientOptions('postgresql://operator:p%40ss@db.host:5433/cutover?sslmode=require');
  assert.equal(options.host, 'db.host');
  assert.equal(options.port, '5433');
  assert.equal(options.database, 'cutover');
  assert.equal(options.user, 'operator');
  assert.equal(options.password, 'p@ss');
  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
  assert.equal(options.query_timeout, 65_000);
  const plain = pgClientOptions('postgresql://postgres@127.0.0.1:55432/cutover_rehearsal_x');
  assert.equal(plain.ssl, undefined);
  assert.throws(() => pgClientOptions('mysql://user@host/db'), /PostgreSQL URL format/);
  assert.throws(() => pgClientOptions('postgresql://user@host'), /host and database/);
  assert.throws(() => pgClientOptions('postgresql://user@host/db?sslmode=verify-full'), /Unsupported sslmode/);
});

test('single-message transport sends the whole batch as one protocol message', async () => {
  const queries = [];
  const fakeClient = {
    on () {},
    async connect () {},
    async query (sql) {
      queries.push(sql);
      return [
        { command: 'BEGIN', rows: [] },
        { command: 'SELECT', rows: [{ snapshot: '[]' }] },
        { command: 'COMMIT', rows: [] },
      ];
    },
    async end () {},
  };
  const result = await runPsqlSingleMessage(
    'postgresql://postgres@127.0.0.1:55432/cutover_rehearsal_x',
    'BEGIN; SELECT 1; COMMIT;',
    { createClient: () => fakeClient },
  );
  assert.equal(queries.length, 1);
  assert.equal(queries[0], 'BEGIN; SELECT 1; COMMIT;');
  assert.equal(result.roundTrips, 1);
  assert.equal(result.statementResults, 3);
  assert.equal(result.lastCommand, 'COMMIT');
  assert.equal(result.rowSets[1][0].snapshot, '[]');
});

test('single-message transport rolls back on the same connection after a failure', async () => {
  const queries = [];
  const fakeClient = {
    on () {},
    async connect () {},
    async query (sql) {
      queries.push(sql);
      if (sql === 'ROLLBACK;') return [{ command: 'ROLLBACK', rows: [] }];
      throw Object.assign(new Error('Freeze ACL baseline drift'), { code: 'P0001' });
    },
    async end () {},
  };
  await assert.rejects(
    () => runPsqlSingleMessage('postgresql://postgres@127.0.0.1:55432/cutover_rehearsal_x', 'BEGIN; DO; COMMIT;', { createClient: () => fakeClient }),
    /rolled back on the same connection/,
  );
  assert.ok(queries.includes('ROLLBACK;'));
});

test('single-message transport reports lost connections instead of claiming rollback', async () => {
  const fakeClient = {
    on () {},
    async connect () {},
    async query (sql) {
      if (sql === 'ROLLBACK;') throw new Error('Connection terminated');
      throw new Error('statement timeout');
    },
    async end () {},
  };
  await assert.rejects(
    () => runPsqlSingleMessage('postgresql://postgres@127.0.0.1:55432/cutover_rehearsal_x', 'BEGIN; SELECT 1; COMMIT;', { createClient: () => fakeClient }),
    /connection lost mid-batch/,
  );
});

test('single-message transport refuses empty SQL and failed connections', async () => {
  await assert.rejects(
    () => runPsqlSingleMessage('postgresql://postgres@127.0.0.1:5432/db', '  '),
    /non-empty SQL/,
  );
  const unreachable = { on () {}, async connect () { throw new Error('ECONNREFUSED'); }, async query () {}, async end () {} };
  await assert.rejects(
    () => runPsqlSingleMessage('postgresql://postgres@127.0.0.1:5432/db', 'SELECT 1;', { createClient: () => unreachable }),
    /could not connect/,
  );
});

test('freeze snapshot builder keeps the full variant byte-identical and filters extension members on request', () => {
  assert.equal(buildFreezeSnapshotSql(), FREEZE_SNAPSHOT_SQL);
  const excluded = buildFreezeSnapshotSql({ excludeExtensionMembers: true });
  assert.match(excluded, /d\.objid=c\.oid AND d\.classid='pg_class'::regclass AND d\.deptype='e'/);
  assert.match(excluded, /d\.objid=p\.oid AND d\.classid='pg_proc'::regclass AND d\.deptype='e'/);
  assert.doesNotMatch(FREEZE_SNAPSHOT_SQL, /pg_depend/);
});

test('freeze package binds the guard to the same snapshot variant as its input', () => {
  const snapshot = [
    { kind: 'table', name: 'videos', args: null, col: null, owner: 'postgres', grants: [{ role: 'authenticated', privilege: 'SELECT', grantable: false }] },
  ];
  const input = { snapshot, project: 'gcrhhxaopomtposmahsw', opensAt: '2026-11-02T10:00:00Z', closesAt: '2026-11-02T12:00:00Z' };
  const full = buildFreezePackage(input);
  const excluded = buildFreezePackage({ ...input, excludeExtensionMembers: true });
  assert.equal(full.snapshotSqlVariant, 'full');
  assert.equal(excluded.snapshotSqlVariant, 'excluded');
  assert.doesNotMatch(full.apply, /pg_depend/);
  assert.match(excluded.apply, /d\.objid=p\.oid AND d\.classid='pg_proc'::regclass/);
  assert.equal(full.apply, buildFreezePackage(input).apply);
  assert.equal(full.objects, 1);
});

test('executor args require one marker and explicit snapshot scope', () => {
  const base = ['--package', '/private/pkg.json', '--baseline', '/private/base.json', '--action', 'freeze', '--snapshot-sql', 'excluded', '--receipt', '/private/r.json'];
  assert.equal(parseExecutorArgs(['--rehearsal', ...base]).mode, 'rehearsal');
  assert.throws(() => parseExecutorArgs(base), /exactly one execution marker/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', '--execute-authorized-source', ...base]), /exactly one execution marker/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', ...base, '--unknown', 'x']), /Unknown option/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', ...base.map((v, i) => (base[i - 1] === '--action' ? 'explode' : v))]), /freeze or rollback/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', '--package', 'p', '--baseline', 'b', '--action', 'freeze', '--snapshot-sql', 'wide', '--receipt', 'r']), /full or excluded/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', ...base, '--timeout-ms', '10']), /1000\.\.1200000/);
});

test('executor verifies package digest and project before any connection', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'freeze-executor-test-'));
  chmodSync(directory, 0o700);
  const snapshot = [
    { kind: 'table', name: 'videos', args: null, col: null, owner: 'postgres', grants: [{ role: 'authenticated', privilege: 'SELECT', grantable: false }] },
  ];
  const pkg = buildFreezePackage({ snapshot, project: 'gcrhhxaopomtposmahsw', opensAt: '2026-11-02T10:00:00Z', closesAt: '2026-11-02T12:00:00Z' });
  const packagePath = path.join(directory, 'pkg.json');
  writeFileSync(packagePath, JSON.stringify(pkg), { mode: 0o600 });
  chmodSync(packagePath, 0o600);
  const loaded = loadVerifiedPackage(packagePath, 'freeze');
  assert.equal(loaded.sha256, pkg.applySha256);
  assert.equal(loaded.snapshotSqlVariant, 'full');
  const tampered = JSON.parse(JSON.stringify(pkg));
  tampered.apply = tampered.apply.replace('REVOKE', 'REVOKE /*x*/ ');
  const tamperedPath = path.join(directory, 'tampered.json');
  writeFileSync(tamperedPath, JSON.stringify(tampered), { mode: 0o600 });
  chmodSync(tamperedPath, 0o600);
  assert.throws(() => loadVerifiedPackage(tamperedPath, 'freeze'), /digest mismatch/);
  const wrongProject = { ...pkg, project: 'dydata-d6g0gd1v37fcddf21' };
  const wrongPath = path.join(directory, 'wrong.json');
  writeFileSync(wrongPath, JSON.stringify(wrongProject), { mode: 0o600 });
  chmodSync(wrongPath, 0o600);
  assert.throws(() => loadVerifiedPackage(wrongPath, 'freeze'), /source-side packages/);
});

test('executor derives the predicted post state for freeze and rollback', () => {
  const baseline = [
    { kind: 'table', name: 'videos', args: null, col: null, owner: 'postgres', grants: [{ role: 'PUBLIC', privilege: 'EXECUTE', grantable: false }] },
  ];
  const frozen = deriveExpectedState(baseline, 'freeze');
  assert.deepEqual(frozen[0].grants, []);
  assert.deepEqual(baseline[0].grants, [{ role: 'PUBLIC', privilege: 'EXECUTE', grantable: false }]);
  assert.deepEqual(deriveExpectedState(baseline, 'rollback'), baseline);
  assert.throws(() => deriveExpectedState([], 'freeze'), /non-empty array/);
  // Each action's pre-state is the other action's post-state: a rollback only
  // starts from the frozen state, never from the untouched baseline.
  assert.deepEqual(deriveExpectedState(frozen, 'freeze'), frozen);
  assert.deepEqual(deriveExpectedState(baseline, 'rollback'), baseline);
  assert.deepEqual(deriveExpectedState(frozen, 'rollback'), frozen);
});

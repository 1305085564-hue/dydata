import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertMaintenanceLive,
  buildSourceLockReadbackSql,
  parseExecutorArgs,
  validateMaintenanceProof,
  validateSourceLockReadback,
} from './cutover-freeze-executor.mjs';
import { writeReceiptUpdate } from './cutover-freeze-executor-cli.mjs';

const clone = (value) => structuredClone(value);

test('executor args require a reviewed package digest, lock receipt, and production maintenance proof', () => {
  const common = ['--package', '/private/pkg.json', '--expected-sha256', 'a'.repeat(64), '--action', 'freeze', '--source-lock-receipt', '/private/lock.json', '--receipt', '/private/r.json'];
  const rehearsal = parseExecutorArgs(['--rehearsal', ...common]);
  assert.equal(rehearsal.mode, 'rehearsal');
  assert.equal(rehearsal.action, 'freeze');
  assert.throws(() => parseExecutorArgs(['--execute-authorized-source', ...common]), /maintenance-proof/);
  assert.equal(parseExecutorArgs(['--execute-authorized-source', ...common, '--maintenance-proof', '/private/maintenance.json']).mode, 'execute-authorized-source');
  assert.throws(() => parseExecutorArgs(['--execute-authorized-cloudbase', ...common, '--maintenance-proof', '/private/maintenance.json']), /manager-module/);
  assert.equal(parseExecutorArgs(['--execute-authorized-cloudbase', ...common, '--maintenance-proof', '/private/maintenance.json', '--manager-module', '/private/sdk.mjs']).mode, 'execute-authorized-cloudbase');
  assert.throws(() => parseExecutorArgs(['--rehearsal', ...common.filter((value) => value !== '--expected-sha256' && value !== 'a'.repeat(64))]), /expected-sha256/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', '--execute-authorized-source', ...common, '--maintenance-proof', '/private/m.json']), /exactly one execution marker/);
  assert.throws(() => parseExecutorArgs(['--rehearsal', ...common, '--baseline', '/private/old.json']), /Unknown option/);
});

test('CLI argument failures create a private exclusive failure receipt without connecting', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'freeze-executor-cli-test-'));
  chmodSync(directory, 0o700);
  const outputDirectory = path.join(directory, 'receipts');
  const receiptPath = path.join(outputDirectory, 'failure.json');
  const executorPath = new URL('./cutover-freeze-executor.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [executorPath, '--execute-authorized-source', '--package', '/missing/pkg.json', '--receipt', receiptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, DYDATA_CUTOVER_SOURCE_URL: '' },
  });
  assert.equal(result.status, 1);
  assert.equal((statSync(receiptPath).mode & 0o077), 0);
  assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).state, 'STOPPED');
  const original = readFileSync(receiptPath, 'utf8');
  const repeated = spawnSync(process.execPath, [executorPath, '--execute-authorized-source', '--package', '/missing/pkg.json', '--receipt', receiptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(repeated.status, 1);
  assert.equal(readFileSync(receiptPath, 'utf8'), original);
});

test('CLI rejects untrusted arguments without echoing their values', () => {
  const canary = '--private-value-must-never-appear';
  const executorPath = new URL('./cutover-freeze-executor.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [executorPath, '--rehearsal', canary], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes(canary), false);
  assert.match(result.stderr, /Freeze executor stopped/);
});

test('receipt updates use a synced same-directory private temporary file and preserve exclusive creation', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'freeze-executor-receipt-test-'));
  chmodSync(directory, 0o700);
  const receiptPath = path.join(directory, 'receipt.json');
  writeReceiptUpdate(receiptPath, { state: 'RUNNING', completedBatches: [] }, { first: true });
  const original = readFileSync(receiptPath, 'utf8');
  assert.throws(() => writeReceiptUpdate(receiptPath, { state: 'OVERWRITE' }, { first: true }), /EEXIST/);
  assert.equal(readFileSync(receiptPath, 'utf8'), original);
  writeReceiptUpdate(receiptPath, { state: 'STOPPED', completedBatches: [{ start: 0, end: 1 }] });
  assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).state, 'STOPPED');
  assert.equal((statSync(receiptPath).mode & 0o077), 0);
  assert.deepEqual(readdirSync(directory), ['receipt.json']);
});

test('maintenance proof requires fresh HTTP evidence for two distinct HTTPS domains', () => {
  const now = Date.now();
  const checkedAt = new Date(now - 30_000).toISOString();
  const response = (status, headers = {}) => ({ checkedAt, status, headers });
  const proof = {
    checkedAt,
    domains: [
      { domain: 'https://dydata.cc', checks: [
        { url: 'https://dydata.cc/api/health', ...response(200) },
        { url: 'https://dydata.cc/admin', ...response(503, { 'x-dydata-maintenance': '1' }) },
      ] },
      { domain: 'https://direct.dydata.cc', checks: [
        { url: 'https://direct.dydata.cc/api/health', ...response(200) },
        { url: 'https://direct.dydata.cc/admin', ...response(503, { 'x-dydata-maintenance': '1' }) },
      ] },
    ],
  };
  assert.deepEqual(validateMaintenanceProof(proof).domains, ['dydata.cc', 'direct.dydata.cc']);
  assert.throws(() => validateMaintenanceProof({ freeze: '1' }), /two-domain HTTP proof/);
  assert.throws(() => validateMaintenanceProof({ ...proof, domains: proof.domains.slice(0, 1) }), /two distinct domains/);
  const noHttpEvidence = clone(proof);
  noHttpEvidence.domains[1].checks[1].status = 200;
  assert.throws(() => validateMaintenanceProof(noHttpEvidence), /maintenance response/);
  const wrongHeader = clone(proof);
  wrongHeader.domains[0].checks[1].headers = { 'x-other-maintenance': '1' };
  assert.throws(() => validateMaintenanceProof(wrongHeader), /maintenance response/);
  const customPort = clone(proof);
  customPort.domains[0].domain = 'https://dydata.cc:8443';
  customPort.domains[0].checks.forEach((check) => { check.url = check.url.replace('https://dydata.cc/', 'https://dydata.cc:8443/'); });
  assert.throws(() => validateMaintenanceProof(customPort), /approved HTTPS domains/);
  const wrongHealthPath = clone(proof);
  wrongHealthPath.domains[0].checks[0].url = 'https://dydata.cc/health';
  assert.throws(() => validateMaintenanceProof(wrongHealthPath), /health HTTP response/);
  const stale = clone(proof);
  stale.checkedAt = new Date(now - 11 * 60_000).toISOString();
  assert.throws(() => validateMaintenanceProof(stale), /fresh/);
});

test('source lock readback requires every actual public table plus auth.users in the same PID and database', () => {
  const sql = buildSourceLockReadbackSql(12345);
  assert.match(sql, /pg_tables WHERE schemaname='public'/);
  assert.match(sql, /lockedPublicTableCount/);
  assert.match(sql, /n\.nspname='auth' AND c\.relname='users'/);
  assert.match(sql, /mode='ShareLock' AND l\.granted/);
  assert.match(sql, /'lockCount'.*mode='ShareLock' AND granted/);
  assert.match(sql, /pg_stat_activity WHERE pid=12345 AND datname=current_database\(\)/);
  assert.ok((sql.match(/l\.database=\(SELECT oid FROM pg_database WHERE datname=current_database\(\)\)/g) ?? []).length >= 2);
  assert.match(sql, /WHERE database=\(SELECT oid FROM pg_database WHERE datname=current_database\(\)\)/);
  const valid = { pid: 12345, active: true, publicTableCount: 99, lockedPublicTableCount: 99, authUsersLocked: true, lockCount: 100 };
  assert.deepEqual(validateSourceLockReadback(valid, 12345), valid);
  for (const change of [{ publicTableCount: 98 }, { lockedPublicTableCount: 98 }, { authUsersLocked: false }, { lockCount: 100, pid: 987 }, { active: false }]) {
    assert.throws(() => validateSourceLockReadback({ ...valid, ...change }, 12345), /each of the 99 public tables and auth.users/);
  }
});

test('live maintenance protection rechecks health and maintenance responses on both domains', async () => {
  const checkedAt = new Date().toISOString();
  const proof = validateMaintenanceProof({
    checkedAt,
    domains: ['https://dydata.cc', 'https://direct.dydata.cc'].map((domain) => ({
      domain,
      checks: [
        { url: `${domain}/api/health`, checkedAt, status: 200, headers: {} },
        { url: `${domain}/admin`, checkedAt, status: 503, headers: { 'x-dydata-maintenance': '1' } },
      ],
    })),
  });
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const maintenance = !url.endsWith('/api/health');
    return { status: maintenance ? 503 : 200, headers: new Headers(maintenance ? { 'x-dydata-maintenance': '1' } : {}) };
  };
  await assertMaintenanceLive(proof, fetchImpl);
  assert.equal(requests.length, 4);
  await assert.rejects(() => assertMaintenanceLive(proof, async (url) => ({
    status: url.endsWith('/api/health') ? 200 : 200,
    headers: new Headers(),
  })), /not active/);
});

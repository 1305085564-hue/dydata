import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildFreezePackage } from './cutover-freeze.mjs';
import { reviewArtifact, verifyReview, runReviewedFreeze } from './cutover-runner.mjs';
import { runBatches } from './sql-batches.mjs';

test('offline review distinguishes body digest from pretty JSON file digest and catches drift', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cutover-review-'));
  try {
    const pkg = buildFreezePackage({ project: 'gcrhhxaopomtposmahsw', snapshot: [{ kind: 'table', name: 'public.accounts', owner: 'postgres', acl: null, grants: [] }], opensAt: '2026-11-03T14:00:00Z', closesAt: '2026-11-03T15:00:00Z' });
    const file = path.join(dir, 'freeze.json'); writeFileSync(file, JSON.stringify(pkg, null, 2), { mode: 0o600 });
    const review = reviewArtifact(file, 'freeze');
    assert.notEqual(review.fileSha256, review.bodySha256);
    assert.equal(verifyReview(file, review).expectedSha256, pkg.packageSha256);
    writeFileSync(file, JSON.stringify(pkg), { mode: 0o600 });
    assert.throws(() => verifyReview(file, review), /changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('cutover review binds file bytes rather than a claimed embedded digest', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cutover-review-'));
  try {
    const file = path.join(dir, 'package.json'), text = JSON.stringify({ packageSha256: 'ignored' });
    writeFileSync(file, text, { mode: 0o600 });
    const review = reviewArtifact(file, 'cutover');
    assert.equal(verifyReview(file, review).expectedSha256, createHash('sha256').update(text).digest('hex'));
    assert.throws(() => verifyReview(file, { ...review, bodySha256: 'wrong' }), /changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('a confirmed commit after an execution error stops before the next write', async () => {
  const digest = createHash('sha256').update('SELECT 1;').digest('hex');
  let writes = 0, lookups = 0;
  await assert.rejects(runBatches({ batches: [{ id: 'a', sql: 'SELECT 1;' }, { id: 'b', sql: 'SELECT 2;' }], stopOnExecutionError: true,
    lookupReceipt: async () => ++lookups === 1 ? null : { sha256: digest },
    execute: async () => { writes++; throw Error('timeout'); },
  }), error => error.outcome === 'COMMITTED' && error.batchId === 'a');
  assert.equal(writes, 1);
});
test('ACL recovery works with a lost lock, while maintenance remains mandatory', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cutover-recover-'));
  const originalFetch = globalThis.fetch;
  try {
    const snapshot = [{ kind: 'table', name: 'public.accounts', owner: 'postgres', acl: null, grants: [] }];
    const pkg = buildFreezePackage({ project: 'dydata-d6g0gd1v37fcddf21', snapshot, opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 3600000).toISOString() });
    const file = path.join(dir, 'freeze.json'); writeFileSync(file, JSON.stringify(pkg, null, 2), { mode: 0o600 });
    const now = new Date().toISOString();
    const proof = { checkedAt: now, domains: ['https://dydata.cc', 'https://direct.dydata.cc'].map(domain => ({ domain, checks: [
      { url: domain + '/api/health', status: 200 }, { url: domain + '/login', status: 503, headers: { 'x-dydata-maintenance': '1' } },
    ] })) };
    globalThis.fetch = async url => new Response('', { status: url.endsWith('/api/health') ? 200 : 503, headers: { 'x-dydata-maintenance': '1' } });
    const opts = { file, review: reviewArtifact(file, 'freeze'), action: 'rollback', connectionUrl: 'postgresql://postgres:unused@db.gcrhhxaopomtposmahsw.supabase.co:5432/postgres', lockReceiptPath: '/missing-lock', maintenanceProof: proof,
      manager: { database: { executePGSql: async sql => { assert.ok(sql.Sql.startsWith('BEGIN READ ONLY')); return { RequestId: 'recovery-read', Rows: [JSON.stringify([snapshot])] }; } } }, onReceipt: () => {},
    };
    const receipt = await runReviewedFreeze(opts);
    assert.equal(receipt.state, 'COMPLETE');
    globalThis.fetch = async () => new Response('', { status: 200 });
    await assert.rejects(runReviewedFreeze(opts), /maintenance/);
  } finally { globalThis.fetch = originalFetch; rmSync(dir, { recursive: true, force: true }); }
});

test('failed CloudBase snapshot responses stop recovery before writes and retain RequestId', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cutover-failed-snapshot-'));
  const originalFetch = globalThis.fetch;
  try {
    const snapshot = [{ kind: 'table', name: 'accounts', owner: 'postgres', grants: [
      { role: 'authenticated', privilege: 'SELECT', grantable: false },
    ] }];
    const frozenSnapshot = snapshot.map(object => ({ ...object, grants: [] }));
    const now = Date.now();
    const pkg = buildFreezePackage({ project: 'dydata-d6g0gd1v37fcddf21', snapshot,
      opensAt: new Date(now - 60000).toISOString(), closesAt: new Date(now + 3600000).toISOString() });
    const file = path.join(dir, 'freeze.json');
    writeFileSync(file, JSON.stringify(pkg, null, 2), { mode: 0o600 });
    const review = reviewArtifact(file, 'freeze');
    const proof = { checkedAt: new Date(now).toISOString(), domains: ['https://dydata.cc', 'https://direct.dydata.cc'].map(domain => ({ domain, checks: [
      { url: domain + '/api/health', status: 200 },
      { url: domain + '/login', status: 503, headers: { 'x-dydata-maintenance': '1' } },
    ] })) };
    globalThis.fetch = async url => new Response('', { status: url.endsWith('/api/health') ? 200 : 503,
      headers: { 'x-dydata-maintenance': '1' } });

    for (const [label, failure] of [
      ['Error', { Error: { Code: 'InternalError' } }],
      ['error', { error: { message: 'snapshot failed' } }],
      ['ok=false', { ok: false }],
      ['success=false', { success: false }],
      ['isError=true', { isError: true }],
    ]) {
      await t.test(label, async () => {
        let reads = 0, writes = 0;
        const requestId = `failed-snapshot-${label}`;
        const manager = { database: { async executePGSql({ Sql }) {
          if (!Sql.startsWith('BEGIN READ ONLY;')) { writes++; throw Error('Unexpected recovery write'); }
          reads++;
          // Plausible stale rows must never override an explicit failure marker.
          return { RequestId: requestId, Rows: [JSON.stringify([frozenSnapshot])], ...failure };
        } } };
        await assert.rejects(runReviewedFreeze({ file, review, action: 'rollback',
          connectionUrl: 'postgresql://postgres:unused@db.gcrhhxaopomtposmahsw.supabase.co:5432/postgres',
          lockReceiptPath: '/missing-lock', maintenanceProof: proof, manager }), error => {
          assert.equal(error.requestId, requestId);
          assert.equal(error.receipt.state, 'STOPPED');
          assert.equal(error.receipt.failure.stage, 'initial-snapshot');
          assert.equal(error.receipt.snapshotReadFailures[0].requestId, requestId);
          return true;
        });
        assert.equal(reads, 1);
        assert.equal(writes, 0);
      });
    }
  } finally { globalThis.fetch = originalFetch; rmSync(dir, { recursive: true, force: true }); }
});

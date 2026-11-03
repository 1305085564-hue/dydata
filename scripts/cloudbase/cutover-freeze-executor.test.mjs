import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFreezePackage, freezeRequestBudget, freezeStateAt } from './cutover-freeze.mjs';
import {
  deriveExpectedState,
  executeFreezeBatches,
  loadVerifiedPackage,
} from './cutover-freeze-executor.mjs';

const makeSnapshot = (length = 24, { grants = true } = {}) => Array.from({ length }, (_, index) => ({
  kind: 'table',
  name: `table_${String(index).padStart(3, '0')}`,
  args: null,
  col: null,
  owner: 'postgres',
  grants: grants ? [{ role: 'authenticated', privilege: 'SELECT', grantable: false }] : [],
}));
const makePackage = (snapshot = makeSnapshot(1200), { maxBytes = 280_000 } = {}) => {
  const now = Date.now();
  return buildFreezePackage({
    snapshot,
    project: 'gcrhhxaopomtposmahsw',
    opensAt: new Date(now - 60_000).toISOString(),
    closesAt: new Date(now + 30 * 60_000).toISOString(),
    maxBytes,
  });
};
const clone = (value) => structuredClone(value);

test('executor package loader verifies v2 digest and exposes bounded batches only', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'freeze-executor-test-'));
  chmodSync(directory, 0o700);
  const pkg = makePackage();
  const packagePath = path.join(directory, 'pkg.json');
  writeFileSync(packagePath, JSON.stringify(pkg), { mode: 0o600 });
  chmodSync(packagePath, 0o600);
  const loaded = loadVerifiedPackage(packagePath, pkg.packageSha256);
  assert.equal(loaded.packageSha256, pkg.packageSha256);
  assert.equal(loaded.applyBatches.length > 1, true);
  assert.equal(loaded.apply, undefined);
  assert.throws(() => loadVerifiedPackage(packagePath, '0'.repeat(64)), /digest mismatch|Reviewed package SHA/);
});

test('package loader requires an external 64-hex SHA before reading the package', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'freeze-executor-test-'));
  chmodSync(directory, 0o700);
  const packagePath = path.join(directory, 'does-not-exist.json');
  for (const expectedSha256 of [undefined, null, '']) {
    assert.throws(
      () => loadVerifiedPackage(packagePath, expectedSha256),
      /external.*SHA256/i,
    );
  }
});

test('batch executor requires an external 64-hex SHA before any connection callback', async () => {
  const pkg = makePackage(makeSnapshot(2));
  for (const expectedSha256 of [undefined, null, '']) {
    let connected = false;
    await assert.rejects(() => executeFreezeBatches({
      pkg,
      expectedSha256,
      action: 'freeze',
      assertProtection: async () => { connected = true; },
      readSnapshot: async () => { connected = true; return clone(pkg.snapshot); },
      transport: async () => { connected = true; throw new Error('unexpected connection'); },
    }), /external.*SHA256/i);
    assert.equal(connected, false);
  }
});

test('freeze starts only from baseline, checks protection around every one-message batch, and validates each post-state', async () => {
  const pkg = makePackage();
  assert.ok(pkg.applyBatches.length > 1, 'fixture must exercise multiple transactions');
  let state = clone(pkg.snapshot);
  const events = [];
  const calls = [];
  const receipt = await executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => events.push('protection'),
    readSnapshot: async () => clone(state),
    transport: async (sql, batch) => {
      calls.push({ sql, batch });
      events.push(`transport:${batch.start}-${batch.end}`);
      state = freezeStateAt(pkg.snapshot, batch.end);
      return { lastCommand: 'COMMIT', roundTrips: 1 };
    },
    onReceipt: async (value) => events.push(`receipt:${value.state}`),
  });
  assert.equal(calls.length, pkg.applyBatches.length);
  assert.deepEqual(calls.map(({ sql, batch }) => [sql, batch.sql]), calls.map(({ sql, batch }) => [batch.sql, batch.sql]));
  assert.equal(receipt.state, 'COMPLETE');
  assert.equal(receipt.completedBatches.length, pkg.applyBatches.length);
  assert.equal(receipt.unknownBoundary, null);
  assert.deepEqual(state, deriveExpectedState(pkg.snapshot, 'freeze'));
  assert.equal(events.filter((event) => event === 'protection').length, pkg.applyBatches.length * 3 + 1);
  for (const [index, event] of events.entries()) {
    if (typeof event === 'string' && event.startsWith('transport:')) assert.equal(events[index - 1], 'protection');
  }
  assert.ok(receipt.totalMs >= 0);
  assert.ok(receipt.completedBatches.every((batch) => batch.startedAt && batch.endedAt && batch.elapsedMs >= 0 && batch.transportElapsedMs >= 0));
});

test('freeze refuses an already-partial state before transport', async () => {
  const pkg = makePackage();
  const state = freezeStateAt(pkg.snapshot, pkg.applyBatches[0].end);
  let sends = 0;
  await assert.rejects(() => executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => state,
    transport: async () => { sends += 1; return { lastCommand: 'COMMIT' }; },
  }), /must start from the baseline/);
  assert.equal(sends, 0);
});

test('protection callback failure stops before sending the first batch', async () => {
  const pkg = makePackage();
  let sends = 0;
  await assert.rejects(() => executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => { throw new Error('lock or freeze protection lost'); },
    readSnapshot: async () => clone(pkg.snapshot),
    transport: async () => { sends += 1; return { lastCommand: 'COMMIT' }; },
  }), (error) => {
    assert.equal(error.receipt.state, 'STOPPED');
    assert.equal(error.receipt.unknownBoundary, null);
    return true;
  });
  assert.equal(sends, 0);
});

test('last protection is checked after the in-flight receipt is durable and immediately before transport', async () => {
  const pkg = makePackage();
  let inFlightReceiptWritten = false;
  let protectionCalls = 0;
  let sends = 0;
  const events = [];
  await assert.rejects(() => executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {
      protectionCalls += 1;
      events.push('protection');
      if (protectionCalls === 2 && inFlightReceiptWritten) throw new Error('source lock lost during receipt write');
    },
    readSnapshot: async () => clone(pkg.snapshot),
    transport: async () => { sends += 1; },
    onReceipt: async (receipt) => {
      if (receipt.inFlightBatch) {
        inFlightReceiptWritten = true;
        if (receipt.inFlightBatch.preSendReceiptAt) events.push('receipt:pre-send');
      }
    },
  }), (error) => {
    assert.equal(error.receipt.state, 'STOPPED');
    assert.equal(error.receipt.unknownBoundary, null);
    return true;
  });
  assert.equal(sends, 0);
  const receiptIndex = events.indexOf('receipt:pre-send');
  assert.ok(receiptIndex >= 0);
  assert.equal(events[receiptIndex + 1], 'protection');
});

test('rollback resumes from a verified partial frontier and restores only proven frozen grants', async () => {
  const pkg = makePackage();
  assert.ok(pkg.applyBatches.length > 1, 'fixture must exercise a partial frontier');
  const frontier = pkg.applyBatches[0].end;
  let state = freezeStateAt(pkg.snapshot, frontier);
  const sent = [];
  const receipt = await executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'rollback',
    assertProtection: async () => {},
    readSnapshot: async () => clone(state),
    transport: async (sql, batch) => {
      sent.push(batch);
      state = freezeStateAt(pkg.snapshot, batch.start);
      return { lastCommand: 'COMMIT', roundTrips: 1 };
    },
  });
  assert.ok(receipt.rollbackFrontier <= frontier);
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].start, sent[0].end], [0, frontier]);
  assert.deepEqual(state, pkg.snapshot);
  assert.equal(receipt.state, 'COMPLETE');
});

test('rollback with observationally ambiguous grantless states chooses the minimum safe boundary and sends no needless batch', async () => {
  const pkg = makePackage(makeSnapshot(8, { grants: false }));
  let sends = 0;
  const receipt = await executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'rollback',
    assertProtection: async () => {},
    readSnapshot: async () => clone(pkg.snapshot),
    transport: async () => { sends += 1; return { lastCommand: 'COMMIT' }; },
  });
  assert.equal(receipt.rollbackFrontier, 0);
  assert.equal(sends, 0);
  assert.deepEqual(receipt.completedBatches, []);
});

test('rollback uses only complete package boundaries when a grantless suffix makes the object frontier ambiguous', async () => {
  const snapshot = makeSnapshot(8).map((item, index) => ({ ...item, grants: index < 6 ? item.grants : [] }));
  const pkg = makePackage(snapshot);
  const observed = freezeStateAt(snapshot, 6);
  assert.deepEqual(observed, freezeStateAt(snapshot, 8));
  let state = clone(observed);
  const sent = [];
  const receipt = await executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'rollback',
    assertProtection: async () => {},
    readSnapshot: async () => clone(state),
    transport: async (sql, batch) => {
      sent.push(batch);
      assert.equal(sql, batch.sql);
      state = clone(pkg.snapshot);
      return { lastCommand: 'COMMIT' };
    },
  });
  assert.equal(receipt.rollbackFrontier, 8);
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].start, sent[0].end], [0, 8]);
  assert.deepEqual(state, pkg.snapshot);
  assert.equal(receipt.state, 'COMPLETE');
});

test('transport uncertainty stops without retry and preserves the unknown boundary in the failure receipt', async () => {
  const pkg = makePackage();
  let sends = 0;
  const saved = [];
  await assert.rejects(() => executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => clone(pkg.snapshot),
    transport: async () => { sends += 1; throw Object.assign(new Error('lost response'), { requestId: 'request-1' }); },
    onReceipt: async (receipt) => saved.push(clone(receipt)),
  }), (error) => {
    assert.equal(error.receipt.state, 'STOPPED');
    assert.equal(error.receipt.completedBatches.length, 0);
    assert.equal(error.receipt.unknownBoundary.start, pkg.applyBatches[0].start);
    assert.equal(error.receipt.unknownBoundary.end, pkg.applyBatches[0].end);
    assert.equal(error.receipt.unknownBoundary.requestId, 'request-1');
  assert.deepEqual(error.receipt.unknownBoundary.matchingBoundaries, [0]);
  assert.equal(error.receipt.diagnostic.observation, 'MATCHES_PRE_BOUNDARY');
    return true;
  });
  assert.equal(sends, 1);
  assert.ok(saved.some((receipt) => receipt.inFlightBatch));
  assert.equal(saved.at(-1).unknownBoundary.end, pkg.applyBatches[0].end);
});

test('confirmed commit with a mismatched readback stops at that batch and records the confirmed unknown boundary', async () => {
  const pkg = makePackage();
  let sends = 0;
  await assert.rejects(() => executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => clone(pkg.snapshot),
    transport: async () => { sends += 1; return { lastCommand: 'COMMIT' }; },
  }), (error) => {
    assert.equal(error.receipt.state, 'STOPPED');
    assert.equal(error.receipt.completedBatches.length, 0);
    assert.equal(error.receipt.unknownBoundary.confirmation, 'COMMIT');
    assert.equal(error.receipt.unknownBoundary.stage, 'post-batch-snapshot');
    return true;
  });
  assert.equal(sends, 1);
});

test('unknown CloudBase batch gets one read-only legal-boundary diagnostic with its RequestId', async () => {
  const now = Date.now();
  const pkg = buildFreezePackage({
    snapshot: makeSnapshot(3),
    project: 'dydata-d6g0gd1v37fcddf21',
    opensAt: new Date(now - 60_000).toISOString(),
    closesAt: new Date(now + 10 * 60_000).toISOString(),
  });
  let snapshotReads = 0;
  let sends = 0;
  await assert.rejects(() => executeFreezeBatches({
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => ({ snapshot: clone(pkg.snapshot), requestId: `snapshot-read-${++snapshotReads}` }),
    transport: async () => { sends += 1; throw Object.assign(new Error('lost response'), { requestId: 'batch-request-1' }); },
  }), (error) => {
    assert.equal(error.receipt.unknownBoundary.requestId, 'batch-request-1');
    assert.equal(error.receipt.diagnostic.status, 'READ');
    assert.equal(error.receipt.diagnostic.readRequestId, 'snapshot-read-2');
    assert.deepEqual(error.receipt.diagnostic.matchingBoundaries, [0]);
    assert.equal(error.receipt.diagnostic.observation, 'MATCHES_PRE_BOUNDARY');
    assert.equal(error.receipt.totalMs >= 0, true);
    return true;
  });
  assert.equal(snapshotReads, 2);
  assert.equal(sends, 1);
});

test('a window that expires after transport still permits one read-only diagnostic and never resumes writes', async () => {
  const realNow = Date.now;
  const openedAt = realNow();
  const pkg = buildFreezePackage({
    snapshot: makeSnapshot(3),
    project: 'gcrhhxaopomtposmahsw',
    opensAt: new Date(openedAt - 1000).toISOString(),
    closesAt: new Date(openedAt + 1000).toISOString(),
  });
  let fakeNow = openedAt;
  let reads = 0;
  let writes = 0;
  Date.now = () => fakeNow;
  try {
    await assert.rejects(() => executeFreezeBatches({
      pkg,
      expectedSha256: pkg.packageSha256,
      action: 'freeze',
      assertProtection: async () => {},
      readSnapshot: async () => { reads += 1; return clone(pkg.snapshot); },
      transport: async () => {
        writes += 1;
        fakeNow = Date.parse(pkg.closesAt) + 1;
        throw new Error('transport lost at the close boundary');
      },
    }), (error) => {
      assert.equal(error.receipt.state, 'STOPPED');
      assert.equal(error.receipt.failure.stage, 'transport');
      assert.equal(error.receipt.diagnostic.status, 'READ');
      assert.deepEqual(error.receipt.diagnostic.matchingBoundaries, [0]);
      return true;
    });
  } finally {
    Date.now = realNow;
  }
  assert.equal(reads, 2);
  assert.equal(writes, 1);
});

test('missing commit or CloudBase RequestId is treated as an unconfirmed batch and never retried', async () => {
  const pgPkg = makePackage();
  let pgSends = 0;
  await assert.rejects(() => executeFreezeBatches({
    pkg: pgPkg,
    expectedSha256: pgPkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => clone(pgPkg.snapshot),
    transport: async () => { pgSends += 1; return { lastCommand: 'SELECT' }; },
  }), /confirm COMMIT/);
  assert.equal(pgSends, 1);

  const now = Date.now();
  const cloudPkg = buildFreezePackage({ snapshot: makeSnapshot(3), project: 'dydata-d6g0gd1v37fcddf21', opensAt: new Date(now - 60_000).toISOString(), closesAt: new Date(now + 10 * 60_000).toISOString() });
  assert.equal(cloudPkg.applyBatches[0].requestBytes, freezeRequestBudget(cloudPkg.applyBatches[0].sql, 'cloudbase').requestBytes);
  assert.equal(cloudPkg.applyBatches[0].requestBytes, Buffer.byteLength(JSON.stringify({ EnvId: 'dydata-d6g0gd1v37fcddf21', Sql: cloudPkg.applyBatches[0].sql })));
  let cloudSends = 0;
  await assert.rejects(() => executeFreezeBatches({
    pkg: cloudPkg,
    expectedSha256: cloudPkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => clone(cloudPkg.snapshot),
    transport: async () => { cloudSends += 1; return { Rows: [] }; },
  }), /RequestId/);
  assert.equal(cloudSends, 1);

  let cloudState = clone(cloudPkg.snapshot);
  const cloudReceipt = await executeFreezeBatches({
    pkg: cloudPkg,
    expectedSha256: cloudPkg.packageSha256,
    action: 'freeze',
    assertProtection: async () => {},
    readSnapshot: async () => clone(cloudState),
    transport: async (sql, batch) => {
      assert.equal(sql, batch.sql);
      cloudState = freezeStateAt(cloudPkg.snapshot, batch.end);
      return { RequestId: 'cloudbase-request-1' };
    },
  });
  assert.equal(cloudReceipt.state, 'COMPLETE');
  assert.equal(cloudReceipt.completedBatches[0].requestId, 'cloudbase-request-1');
});

test('out-of-window, invalid package, and missing protection callback fail before transport', async () => {
  const pkg = makePackage();
  let sends = 0;
  const base = {
    pkg,
    expectedSha256: pkg.packageSha256,
    action: 'freeze',
    readSnapshot: async () => clone(pkg.snapshot),
    transport: async () => { sends += 1; return { lastCommand: 'COMMIT' }; },
  };
  await assert.rejects(() => executeFreezeBatches({ ...base, assertProtection: undefined }), /assertProtection callback/);
  await assert.rejects(() => executeFreezeBatches({ ...base, assertProtection: async () => {}, expectedSha256: '0'.repeat(64) }), /digest mismatch/);
  const expired = buildFreezePackage({
    snapshot: pkg.snapshot,
    project: pkg.project,
    opensAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    closesAt: new Date(Date.now() - 60_000).toISOString(),
    maxBytes: pkg.maxBytes,
  });
  await assert.rejects(() => executeFreezeBatches({ ...base, pkg: expired, expectedSha256: expired.packageSha256, assertProtection: async () => {} }), /window/);
  assert.equal(sends, 0);
});

test('deriveExpectedState preserves baseline and predicts full freeze/restore', () => {
  const baseline = makeSnapshot(1);
  const frozen = deriveExpectedState(baseline, 'freeze');
  assert.deepEqual(frozen[0].grants, []);
  assert.notEqual(baseline[0].grants.length, 0);
  assert.deepEqual(deriveExpectedState(baseline, 'rollback'), baseline);
  assert.throws(() => deriveExpectedState([], 'freeze'), /non-empty array/);
});

test('uncertain restore stops after one send and a new explicit restore uses the diagnosed frontier',async()=>{
 const pkg=makePackage();let state=freezeStateAt(pkg.snapshot,pkg.objects),sends=0;
 const base={pkg,expectedSha256:pkg.packageSha256,action:'rollback',assertProtection:async()=>{},readSnapshot:async()=>clone(state)};
 await assert.rejects(executeFreezeBatches({...base,transport:async(_sql,batch)=>{
  sends++;state=freezeStateAt(pkg.snapshot,batch.start);throw Object.assign(Error('lost restore response'),{requestId:'restore-unknown'});
 }}),error=>{
  assert.equal(error.receipt.state,'STOPPED');assert.equal(error.receipt.completedBatches.length,0);
  assert.equal(error.receipt.diagnostic.observation,'MATCHES_POST_BOUNDARY');
  assert.deepEqual(error.receipt.diagnostic.matchingBoundaries,[pkg.rollbackBatches[0].start]);return true;
 });
 assert.equal(sends,1);
 const restored=[];
 const receipt=await executeFreezeBatches({...base,transport:async(_sql,batch)=>{
  restored.push([batch.start,batch.end]);state=freezeStateAt(pkg.snapshot,batch.start);return {lastCommand:'COMMIT'};
 }});
 assert.equal(receipt.state,'COMPLETE');assert.deepEqual(state,pkg.snapshot);
 assert.deepEqual(restored,pkg.rollbackBatches.slice(1).map(b=>[b.start,b.end]));
});

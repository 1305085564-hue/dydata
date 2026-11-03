#!/usr/bin/env node

// Bounded, receipt-backed freeze executor. The source and CloudBase adapters
// live in separate modules; this file owns immutable package execution semantics.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FREEZE_MIN_HEADROOM, freezeRequestBudget, freezeStateAt, verifyFreezePackage } from './cutover-freeze.mjs';
import { ensurePrivateFile } from './cutover-core.mjs';
import { runFreezeExecutorCli } from './cutover-freeze-executor-cli.mjs';

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function assertExternalPackageSha(expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error('An external 64-hex SHA256 digest is required');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function parseExecutorArgs(argv) {
  const markers = argv.filter((flag) => ['--rehearsal', '--execute-authorized-source', '--execute-authorized-cloudbase'].includes(flag));
  if (markers.length !== 1) throw new Error('Pass exactly one execution marker: --rehearsal, --execute-authorized-source, or --execute-authorized-cloudbase');
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === markers[0]) continue;
    if (!['--package', '--expected-sha256', '--action', '--source-lock-receipt', '--maintenance-proof', '--manager-module', '--receipt', '--timeout-ms'].includes(key)) {
      throw new Error(`Unknown option ${key}; use --help`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    if (options.has(key)) throw new Error(`Duplicate option ${key}`);
    options.set(key, value);
    index += 1;
  }
  for (const required of ['--package', '--expected-sha256', '--action', '--source-lock-receipt', '--receipt']) {
    if (!options.has(required)) throw new Error(`Missing ${required}`);
  }
  const action = options.get('--action');
  if (!['freeze', 'rollback'].includes(action)) throw new Error('--action must be freeze or rollback');
  if (!/^[a-f0-9]{64}$/.test(options.get('--expected-sha256'))) throw new Error('--expected-sha256 must be a lowercase SHA256 digest');
  if (markers[0] !== '--rehearsal' && !options.has('--maintenance-proof')) throw new Error('Missing --maintenance-proof for authorized production execution');
  if (markers[0] === '--execute-authorized-cloudbase' && !options.has('--manager-module')) throw new Error('Missing --manager-module for authorized CloudBase execution');
  if (markers[0] !== '--execute-authorized-cloudbase' && options.has('--manager-module')) throw new Error('--manager-module is only valid with --execute-authorized-cloudbase');
  const timeoutMs = Number(options.get('--timeout-ms') ?? '65000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1_200_000) throw new Error('--timeout-ms must be 1000..1200000');
  return { mode: markers[0].replace(/^--/, ''), action, timeoutMs, options };
}

export function loadVerifiedPackage(packagePath, expectedSha256) {
  assertExternalPackageSha(expectedSha256);
  ensurePrivateFile(packagePath);
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (!['gcrhhxaopomtposmahsw', 'dydata-d6g0gd1v37fcddf21'].includes(pkg?.project)) throw new Error('Freeze executor package project is not supported');
  verifyFreezePackage(pkg, expectedSha256);
  return pkg;
}

export function deriveExpectedState(baseline, action) {
  if (!Array.isArray(baseline) || baseline.length === 0) throw new Error('Baseline snapshot must be a non-empty array');
  if (!['freeze', 'rollback'].includes(action)) throw new Error('Action must be freeze or rollback');
  return freezeStateAt(baseline, action === 'freeze' ? baseline.length : 0);
}

export function assertFreezeWindow(pkg, now = Date.now()) {
  const opens = Date.parse(pkg?.opensAt);
  const closes = Date.parse(pkg?.closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || now < opens || now >= closes) throw new Error('Outside authorized freeze window');
}

function normalizeSnapshot(value) {
  const snapshot = Array.isArray(value) ? value : value?.snapshot;
  if (!Array.isArray(snapshot) || snapshot.length === 0) throw new Error('Snapshot reader must return a non-empty full snapshot');
  const requestId = typeof value?.requestId === 'string' && value.requestId.trim()
    ? value.requestId.slice(0, 200)
    : (typeof value?.RequestId === 'string' && value.RequestId.trim() ? value.RequestId.slice(0, 200) : null);
  return { snapshot, requestId };
}

function batchReceipt(batch) {
  return { action: batch.action, start: batch.start, end: batch.end, sha256: batch.sha256 };
}

function hasAnyRestoreGrant(snapshot, start, end, frontier) {
  for (let index = start; index < end && index < frontier; index += 1) {
    if (snapshot[index].grants.length > 0) return true;
  }
  return false;
}

function matchingFreezeBoundaries(snapshot, actual, batchBoundaries) {
  if (!Array.isArray(actual) || actual.length !== snapshot.length) return [];
  const matches = [];
  for (const frontier of batchBoundaries) {
    if (sameJson(actual, freezeStateAt(snapshot, frontier))) matches.push(frontier);
  }
  return matches;
}

function confirmedTransportResult(result, channel) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Batch transport returned no confirmation');
  if (channel === 'postgres') {
    if (result.lastCommand !== 'COMMIT') throw new Error('Batch transport did not confirm COMMIT');
    return { confirmation: 'COMMIT', requestId: null };
  }
  if (channel === 'cloudbase') {
    const requestId = typeof result.RequestId === 'string' && result.RequestId.trim() ? result.RequestId : null;
    if (!requestId || result.Error != null || result.error != null || result.ok === false || result.success === false || result.isError === true) {
      throw Object.assign(new Error('CloudBase batch transport did not confirm RequestId'), { requestId });
    }
    return { confirmation: 'RequestId', requestId };
  }
  throw new Error('Freeze package has an unsupported transport channel');
}

function safeErrorMetadata(error) {
  return { name: typeof error?.name === 'string' ? error.name.slice(0, 80) : 'Error' };
}

function assertBatchBudget(pkg, batch) {
  const budget = freezeRequestBudget(batch.sql, pkg.channel, pkg.maxBytes);
  if (budget.requestBytes !== batch.requestBytes || budget.headroomBytes <= FREEZE_MIN_HEADROOM) {
    throw new Error('Freeze batch request no longer matches its reviewed byte budget');
  }
}

/** A protection callback is mandatory; it must check live maintenance and the source's exact 100 held locks. */
export async function executeFreezeBatches({ pkg, expectedSha256, action, transport, readSnapshot, assertProtection, onReceipt }) {
  assertExternalPackageSha(expectedSha256);
  pkg = deepFreeze(structuredClone(pkg));
  verifyFreezePackage(pkg, expectedSha256);
  if (action !== 'freeze' && action !== 'rollback') throw new Error('Action must be freeze or rollback');
  if (typeof transport !== 'function') throw new TypeError('A batch transport callback is required');
  if (typeof readSnapshot !== 'function') throw new TypeError('A full snapshot reader callback is required');
  if (typeof assertProtection !== 'function') throw new TypeError('An assertProtection callback is required');
  assertFreezeWindow(pkg);

  const batches = action === 'freeze' ? pkg.applyBatches : pkg.rollbackBatches;
  const boundaries = [0, ...pkg.applyBatches.map((batch) => batch.end)];
  const overallStartedMs = Date.now();
  const receipt = {
    version: 1,
    packageSha256: pkg.packageSha256,
    project: pkg.project,
    channel: pkg.channel,
    action,
    state: 'RUNNING',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    totalMs: null,
    objects: pkg.objects,
    expectedSha256,
    initialStateMatched: false,
    finalStateMatched: false,
    rollbackFrontier: null,
    completedBatches: [],
    snapshotReads: [],
    snapshotReadFailures: [],
    inFlightBatch: null,
    unknownBoundary: null,
    diagnostic: null,
    failure: null,
  };
  let stage = 'initial-protection';
  let transportStarted = false;
  let currentExpected = null;
  let selectedBatches = [];
  let liveBatch = null;
  let liveBatchStartedMs = null;
  let transportStartedMs = null;

  const notify = async () => {
    if (typeof onReceipt === 'function') await onReceipt(structuredClone(receipt));
  };
  const readFullSnapshot = async (readStage) => {
    try {
      const result = normalizeSnapshot(await readSnapshot());
      if (result.requestId) receipt.snapshotReads.push({ stage: readStage, requestId: result.requestId, at: new Date().toISOString() });
      return result;
    } catch (error) {
      const requestId = typeof error?.requestId === 'string' ? error.requestId.slice(0, 200) : (typeof error?.RequestId === 'string' ? error.RequestId.slice(0, 200) : null);
      receipt.snapshotReadFailures.push({ stage: readStage, requestId, name: safeErrorMetadata(error).name, at: new Date().toISOString() });
      throw error;
    }
  };
  const setUnknown = (batch, error, unknownStage, confirmation = null) => {
    if (!batch) return;
    receipt.unknownBoundary = {
      ...batchReceipt(batch),
      stage: unknownStage,
      requestId: typeof error?.requestId === 'string' ? error.requestId.slice(0, 200) : (typeof error?.RequestId === 'string' ? error.RequestId.slice(0, 200) : null),
      confirmation,
      startedAt: receipt.inFlightBatch?.startedAt ?? null,
      endedAt: new Date().toISOString(),
      elapsedMs: liveBatchStartedMs === null ? null : Date.now() - liveBatchStartedMs,
      transportElapsedMs: transportStartedMs === null ? null : Date.now() - transportStartedMs,
    };
  };

  try {
    await notify();
    await assertProtection();
    stage = 'initial-snapshot';
    const initial = (await readFullSnapshot('initial-snapshot')).snapshot;
    if (initial.length !== pkg.snapshot.length) throw new Error('Current snapshot object count differs from the verified package');

    if (action === 'freeze') {
      if (!sameJson(initial, pkg.snapshot)) throw new Error('Freeze must start from the baseline snapshot');
      receipt.initialStateMatched = true;
      currentExpected = pkg.snapshot;
      selectedBatches = batches;
    } else {
      const matching = matchingFreezeBoundaries(pkg.snapshot, initial, boundaries);
      if (matching.length === 0) throw new Error('Rollback state does not match the baseline or a complete freeze-batch boundary');
      const minimumSafeFrontier = matching[0];
      receipt.rollbackFrontier = minimumSafeFrontier;
      receipt.initialStateMatched = true;
      currentExpected = initial;
      // Grantless objects can make legal package boundaries observationally
      // identical. Restore only ranges proven frozen below the minimum match.
      selectedBatches = batches.filter((batch) => hasAnyRestoreGrant(pkg.snapshot, batch.start, batch.end, minimumSafeFrontier));
    }
    await notify();

    let protectionAlreadyChecked = true;
    for (const batch of selectedBatches) {
      if (protectionAlreadyChecked) protectionAlreadyChecked = false;
      else {
        stage = 'pre-batch-protection';
        assertFreezeWindow(pkg);
        await assertProtection();
        stage = 'pre-batch-snapshot';
        currentExpected = (await readFullSnapshot('pre-batch-snapshot')).snapshot;
      }

      const expectedPre = action === 'freeze'
        ? freezeStateAt(pkg.snapshot, batch.start)
        : freezeStateAt(pkg.snapshot, batch.end);
      if (!sameJson(currentExpected, expectedPre)) throw new Error(`Current snapshot does not match the expected ${action} batch boundary`);

      assertFreezeWindow(pkg);
      liveBatch = batch;
      liveBatchStartedMs = Date.now();
      transportStarted = false;
      receipt.inFlightBatch = { ...batchReceipt(batch), startedAt: new Date(liveBatchStartedMs).toISOString() };
      stage = 'before-transport-receipt';
      await notify();

      receipt.inFlightBatch.preSendReceiptAt = new Date().toISOString();
      stage = 'before-final-protection-receipt';
      await notify();

      verifyFreezePackage(pkg, expectedSha256);
      assertBatchBudget(pkg, batch);
      stage = 'last-batch-protection';
      assertFreezeWindow(pkg);
      await assertProtection();
      assertFreezeWindow(pkg);
      stage = 'transport';
      transportStarted = true;
      transportStartedMs = Date.now();
      receipt.inFlightBatch.transportStartedAt = new Date(transportStartedMs).toISOString();
      const result = await transport(batch.sql, batch);
      const transportElapsedMs = Date.now() - transportStartedMs;
      const confirmation = confirmedTransportResult(result, pkg.channel);
      receipt.inFlightBatch.confirmation = confirmation.confirmation;
      receipt.inFlightBatch.requestId = confirmation.requestId;
      receipt.inFlightBatch.transportElapsedMs = transportElapsedMs;
      stage = 'transport-confirmed-receipt';
      await notify();

      stage = 'post-batch-protection';
      assertFreezeWindow(pkg);
      await assertProtection();
      stage = 'post-batch-snapshot';
      const expectedPost = action === 'freeze'
        ? freezeStateAt(pkg.snapshot, batch.end)
        : freezeStateAt(pkg.snapshot, batch.start);
      const actualPost = (await readFullSnapshot('post-batch-snapshot')).snapshot;
      if (!sameJson(actualPost, expectedPost)) throw new Error('Post-batch snapshot does not match the predicted complete state');

      const completedAt = new Date().toISOString();
      receipt.completedBatches.push({
        ...batchReceipt(batch),
        confirmation: confirmation.confirmation,
        requestId: confirmation.requestId,
        startedAt: receipt.inFlightBatch.startedAt,
        transportStartedAt: receipt.inFlightBatch.transportStartedAt,
        completedAt,
        endedAt: completedAt,
        elapsedMs: Date.now() - liveBatchStartedMs,
        transportElapsedMs,
      });
      receipt.inFlightBatch = null;
      receipt.unknownBoundary = null;
      currentExpected = expectedPost;
      liveBatch = null;
      liveBatchStartedMs = null;
      transportStartedMs = null;
      transportStarted = false;
      stage = 'batch-complete-receipt';
      await notify();
    }

    stage = 'final-protection';
    assertFreezeWindow(pkg);
    await assertProtection();
    stage = 'final-snapshot';
    const finalSnapshot = (await readFullSnapshot('final-snapshot')).snapshot;
    const expectedFinal = action === 'freeze' ? deriveExpectedState(pkg.snapshot, 'freeze') : deriveExpectedState(pkg.snapshot, 'rollback');
    if (!sameJson(finalSnapshot, expectedFinal)) throw new Error('Final snapshot does not match the requested complete state');
    receipt.finalStateMatched = true;
    receipt.state = 'COMPLETE';
    receipt.finishedAt = new Date().toISOString();
    receipt.totalMs = Date.now() - overallStartedMs;
    stage = 'complete-receipt';
    await notify();
    return receipt;
  } catch (error) {
    if (transportStarted && liveBatch && !receipt.completedBatches.some((batch) => batch.start === liveBatch.start && batch.end === liveBatch.end)) {
      setUnknown(liveBatch, error, stage, receipt.inFlightBatch?.confirmation ?? null);
      receipt.diagnostic = { status: 'RUNNING', attemptedAt: new Date().toISOString(), matchingBoundaries: [], readRequestId: null };
      try {
        const diagnostic = await readFullSnapshot('unknown-boundary-diagnostic');
        const matching = matchingFreezeBoundaries(pkg.snapshot, diagnostic.snapshot, boundaries);
        const preFrontier = action === 'freeze' ? liveBatch.start : liveBatch.end;
        const postFrontier = action === 'freeze' ? liveBatch.end : liveBatch.start;
        receipt.diagnostic = {
          status: 'READ',
          readAt: new Date().toISOString(),
          readRequestId: diagnostic.requestId,
          matchingBoundaries: matching,
          observation: matching.includes(preFrontier) && matching.includes(postFrontier)
            ? 'AMBIGUOUS_PRE_OR_POST'
            : matching.includes(postFrontier)
              ? 'MATCHES_POST_BOUNDARY'
              : matching.includes(preFrontier)
                ? 'MATCHES_PRE_BOUNDARY'
                : matching.length > 0 ? 'OTHER_LEGAL_BOUNDARY' : 'NO_LEGAL_BOUNDARY',
        };
        receipt.unknownBoundary.diagnosticReadRequestId = diagnostic.requestId;
        receipt.unknownBoundary.matchingBoundaries = matching;
      } catch (diagnosticError) {
        receipt.diagnostic = {
          status: 'FAILED',
          readAt: new Date().toISOString(),
          readRequestId: typeof diagnosticError?.requestId === 'string' ? diagnosticError.requestId.slice(0, 200) : (typeof diagnosticError?.RequestId === 'string' ? diagnosticError.RequestId.slice(0, 200) : null),
          matchingBoundaries: [],
          failure: safeErrorMetadata(diagnosticError),
        };
        receipt.unknownBoundary.diagnosticReadRequestId = receipt.diagnostic.readRequestId;
      }
    }
    receipt.state = 'STOPPED';
    receipt.finishedAt = new Date().toISOString();
    receipt.totalMs = Date.now() - overallStartedMs;
    receipt.failure = { stage, ...safeErrorMetadata(error) };
    try {
      await notify();
    } catch (receiptError) {
      receipt.receiptWriteFailure = safeErrorMetadata(receiptError);
    }
    if (error && typeof error === 'object') error.receipt = structuredClone(receipt);
    throw error;
  }
}

export {
  assertMaintenanceLive,
  buildSourceLockReadbackSql,
  validateMaintenanceProof,
  validateSourceLockReadback,
} from './cutover-freeze-protection.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFreezeExecutorCli({
    argv: process.argv.slice(2),
    parseExecutorArgs,
    executeFreezeBatches,
    loadVerifiedPackage,
    assertFreezeWindow,
  }).catch(() => {
    console.error('Freeze executor stopped; inspect the private receipt. No input values or SQL body logged.');
    process.exitCode = 1;
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { boundWindow, validateReplayPaths } from './replay-window-package.mjs';

const start = '2000-01-01T16:00:00+08:00';
const end = '2000-01-01T17:30:00+08:00';
const transaction = "BEGIN;\nSET LOCAL lock_timeout='3s';\nCOMMIT;\n";

test('fixed approved window is preserved byte-for-byte independently of the replay date', () => {
  const gate = `DO $approved_window$ BEGIN IF clock_timestamp()<'${start}'::timestamptz OR clock_timestamp()>='${end}'::timestamptz THEN RAISE EXCEPTION 'Outside approved production window' USING ERRCODE='55000'; END IF; END $approved_window$;`;
  assert.equal(boundWindow(transaction, start, end), `BEGIN;\n${gate}\nSET LOCAL lock_timeout='3s';\n${gate}\nCOMMIT;\n`);
  assert.equal((boundWindow(transaction, start, end).match(/Outside approved production window/g) || []).length, 2);
});

test('invalid windows and a transaction without complete boundaries are rejected', () => {
  for (const [a, b] of [['bad', end], [start, 'bad'], [end, start], [start, start]]) {
    assert.throws(() => boundWindow(transaction, a, b), /approved window/i);
  }
  assert.throws(() => boundWindow('SELECT 1;', start, end), /transaction/i);
  assert.throws(() => boundWindow('BEGIN; SELECT 1;', start, end), /transaction/i);
});

test('output is a new direct child of the explicit local lab, never the historical production directory', () => {
  const root = mkdtempSync('/tmp/dydata-supabase-batch-a-window-unit-');
  try {
    const output = join(root, 'replay-new');
    assert.equal(validateReplayPaths(root, output).outputDirectory, output);
    assert.throws(() => validateReplayPaths(root, '/Users/mac/.local/share/dydata/supabase/2026-11-02/production-batch-a'), /output/i);
    assert.throws(() => validateReplayPaths('/tmp/other-project', output), /local/i);
    mkdirSync(output);
    assert.throws(() => validateReplayPaths(root, output), /existing/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('local directory symlink aliases and output traversal cannot bypass the lab boundary', () => {
  const root = mkdtempSync('/tmp/dydata-supabase-batch-a-window-unit-');
  const alias = `${root}-alias`;
  try {
    symlinkSync(root, alias);
    assert.throws(() => validateReplayPaths(alias, join(alias, 'replay-new')), /symbolic|symlink/i);
    assert.throws(() => validateReplayPaths(root, join(root, '..', 'outside')), /output/i);
  } finally {
    rmSync(alias, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

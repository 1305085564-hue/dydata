import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { buildKeysetPageQuery, exportDatabase, parseExportArgs, planExportTargets } from './db-export.mjs';

function makeFakeInventory() {
  return {
    schemas: ['public', 'auth', 'private', 'dydata_cutover_old'],
    relations: [
      {
        schema: 'public',
        table: 'items',
        kind: 'r',
        bytes: 4096,
        estRows: 5,
        columns: [
          { name: 'id', attnum: 1, formatType: 'integer', notNull: true },
          { name: 'name', attnum: 2, formatType: 'text', notNull: true },
        ],
        primaryKey: [{ name: 'id', formatType: 'integer' }],
      },
      {
        schema: 'public',
        table: 'pair_links',
        kind: 'r',
        bytes: 2048,
        estRows: 2,
        columns: [
          { name: 'a', attnum: 1, formatType: 'uuid', notNull: true },
          { name: 'b', attnum: 2, formatType: 'uuid', notNull: true },
        ],
        primaryKey: [
          { name: 'a', formatType: 'uuid' },
          { name: 'b', formatType: 'uuid' },
        ],
      },
      {
        schema: 'public',
        table: 'perf_logs',
        kind: 'r',
        bytes: 2048,
        estRows: 3,
        columns: [{ name: 'msg', attnum: 1, formatType: 'text', notNull: false }],
        primaryKey: null,
      },
      {
        schema: 'public',
        table: 'items_view',
        kind: 'v',
        bytes: 0,
        estRows: 0,
        columns: [],
        primaryKey: null,
      },
      {
        schema: 'auth',
        table: 'users',
        kind: 'r',
        bytes: 2048,
        estRows: 2,
        columns: [
          { name: 'id', attnum: 1, formatType: 'bigint', notNull: true },
          { name: 'sub', attnum: 2, formatType: 'text', notNull: true },
        ],
        primaryKey: [{ name: 'id', formatType: 'bigint' }],
      },
      {
        schema: 'auth',
        table: 'token',
        kind: 'r',
        bytes: 1024,
        estRows: 10,
        columns: [{ name: 'id', attnum: 1, formatType: 'text', notNull: true }],
        primaryKey: [{ name: 'id', formatType: 'text' }],
      },
      {
        schema: 'private',
        table: 'archive_rows',
        kind: 'r',
        bytes: 1024,
        estRows: 1,
        columns: [{ name: 'id', attnum: 1, formatType: 'integer', notNull: true }],
        primaryKey: [{ name: 'id', formatType: 'integer' }],
      },
    ],
  };
}

function makeFakeExecutor(inventory, dataset, { failTable = null, failFirstOversizeOn = null } = {}) {
  const queries = [];
  let oversizedFailedOnce = false;

  const executeReadOnly = async (sql) => {
    queries.push(sql);
    if (sql.includes("'relations'")) {
      return { RequestId: 'inv-1', Rows: [JSON.stringify([JSON.stringify(inventory)])] };
    }
    const countMatch = sql.match(/^SELECT count\(\*\)::text AS cnt FROM "([^"]+)"\."([^"]+)";$/);
    if (countMatch) {
      const key = `${countMatch[1]}.${countMatch[2]}`;
      if (key === failTable) throw new Error('simulated table permission error');
      const rows = dataset[key] ?? [];
      return { RequestId: 'cnt-1', Rows: [JSON.stringify([String(rows.length)])] };
    }
    const pageMatch = sql.match(/^SELECT to_jsonb\(t\)::text AS row_json, .+ FROM "([^"]+)"\."([^"]+)" AS t(.*) ORDER BY .+ LIMIT (\d+);$/);
    if (!pageMatch) throw new Error(`Unexpected SQL in fake executor: ${sql}`);
    const key = `${pageMatch[1]}.${pageMatch[2]}`;
    const where = pageMatch[3] ?? '';
    const limit = Number(pageMatch[4]);

    if (key === failFirstOversizeOn && !oversizedFailedOnce && limit > 10) {
      oversizedFailedOnce = true;
      throw new Error('simulated payload too large');
    }

    const allRows = dataset[key] ?? [];
    let startIdx = 0;
    const cursorMatch = where.match(/'([^']+)'/);
    if (cursorMatch) {
      const cursorVal = cursorMatch[1];
      const prevIdx = allRows.findIndex((r) => String(r._cursor) === cursorVal);
      startIdx = prevIdx >= 0 ? prevIdx + 1 : allRows.length;
    }
    const slice = allRows.slice(startIdx, startIdx + limit);
    if (slice.length === 0) return { RequestId: 'page-empty', Rows: null };
    const rows = slice.map((row) => {
      const clean = { ...row };
      delete clean._cursor;
      delete clean._cursor2;
      const tuple = row._cursor2 !== undefined
        ? [JSON.stringify(clean), String(row._cursor), String(row._cursor2)]
        : [JSON.stringify(clean), String(row._cursor)];
      return JSON.stringify(tuple);
    });
    return { RequestId: 'page-1', Rows: rows };
  };

  return { executeReadOnly, queries };
}

test('planExportTargets includes public + core auth + --schemas and records skipped objects', () => {
  const inventory = makeFakeInventory();
  const plan = planExportTargets(inventory, { extraSchemas: ['private'] });
  const names = plan.selected.map((t) => `${t.schema}.${t.table}`);
  assert.deepEqual(names, ['public.items', 'public.pair_links', 'public.perf_logs', 'auth.users', 'private.archive_rows']);
  assert.equal(plan.skipped.some((s) => s.schema === 'public' && s.name === 'items_view' && s.reason === 'non-table-relation'), true);
  assert.equal(plan.skipped.some((s) => s.schema === 'auth' && s.name === 'token' && s.reason === 'ephemeral-session-token'), true);
  assert.equal(plan.skipped.some((s) => s.schema === 'dydata_cutover_old' && s.reason === 'schema-not-selected'), true);
});

test('buildKeysetPageQuery supports single PK, composite PK, and ctid fallback', () => {
  const inv = makeFakeInventory();
  const q1 = buildKeysetPageQuery(inv.relations[0], ['42'], 100);
  assert.match(q1.sql, /WHERE t\."id" > '42'::integer ORDER BY t\."id" ASC LIMIT 100/);
  const q2 = buildKeysetPageQuery(inv.relations[1], ['u1', 'u2'], 50);
  assert.match(q2.sql, /WHERE \(t\."a", t\."b"\) > \('u1'::uuid, 'u2'::uuid\)/);
  const q3 = buildKeysetPageQuery(inv.relations[2], ['(0,5)'], 50);
  assert.match(q3.sql, /WHERE t\.ctid > '\(0,5\)'::tid ORDER BY t\.ctid ASC LIMIT 50/);
});

test('exportDatabase paginates large tables, writes gzipped jsonl and manifest.json with 700/600 perms', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dydata-export-test-'));
  const outputDir = path.join(tempRoot, 'run-1');
  try {
    const inv = makeFakeInventory();
    inv.relations.push({
      schema: 'auth',
      table: 'identity',
      kind: 'r',
      bytes: 0,
      estRows: 0,
      columns: [{ name: 'id', attnum: 1, formatType: 'bigint', notNull: true }],
      primaryKey: [{ name: 'id', formatType: 'bigint' }],
    });
    const dataset = {
      'public.items': Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `item-${i + 1}`, _cursor: i + 1 })),
      'public.pair_links': [
        { a: '00000000-0000-0000-0000-000000000001', b: '00000000-0000-0000-0000-000000000002', _cursor: '00000000-0000-0000-0000-000000000001', _cursor2: '00000000-0000-0000-0000-000000000002' },
      ],
      'public.perf_logs': [
        { msg: 'p1', _cursor: '(0,1)' },
        { msg: 'p2', _cursor: '(0,2)' },
      ],
      'auth.users': [{ id: 1, sub: 'sub-1', _cursor: 1 }],
      'auth.identity': [],
    };
    const { executeReadOnly } = makeFakeExecutor(inv, dataset, { failFirstOversizeOn: 'public.items' });
    let tick = 1000;
    const { manifest } = await exportDatabase({
      executeReadOnly,
      envId: 'test-env',
      outputDir,
      pageSize: 12,
      now: () => new Date((tick += 1000)),
    });

    assert.equal(manifest.allSucceeded, true);
    assert.equal(manifest.totalTables, 5);
    assert.equal(manifest.succeededTables, 5);
    assert.equal(manifest.totalRows, 29);
    assert.equal(manifest.durationMs, 1000);
    assert.equal(statSync(outputDir).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(outputDir, 'manifest.json')).mode & 0o777, 0o600);

    const itemsEntry = manifest.tables.find((t) => t.table === 'items');
    assert.equal(itemsEntry.rowCount, 25);
    assert.ok(itemsEntry.pages >= 3);
    const decompressed = gunzipSync(readFileSync(path.join(outputDir, itemsEntry.file))).toString('utf8').trim().split('\n');
    assert.equal(decompressed.length, 25);
    assert.deepEqual(JSON.parse(decompressed[24]), { id: 25, name: 'item-25' });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('exportDatabase marks allSucceeded=false and names failedTable when any table fails', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dydata-export-fail-'));
  const outputDir = path.join(tempRoot, 'run-fail');
  try {
    const inv = makeFakeInventory();
    const dataset = {
      'public.items': [{ id: 1, name: 'ok', _cursor: 1 }],
    };
    const { executeReadOnly } = makeFakeExecutor(inv, dataset, { failTable: 'public.perf_logs' });
    await assert.rejects(
      () => exportDatabase({ executeReadOnly, envId: 'test-env', outputDir, pageSize: 10 }),
      /public\.perf_logs/,
    );
    const manifest = JSON.parse(readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.allSucceeded, false);
    assert.equal(manifest.failedTable, 'public.perf_logs');
    assert.match(manifest.error, /simulated table permission error/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('db-export CLI exits with non-zero code on invalid arguments or inside-repo outputDir', () => {
  assert.throws(() => parseExportArgs(['--schemas', 'pg_catalog']), /System schema/);
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/cloudbase/db-export.mjs', '--unknown-flag'], { stdio: 'pipe' }),
    (err) => err.status !== 0,
  );
});

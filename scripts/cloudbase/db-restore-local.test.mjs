import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { loadAndVerifyBackup, verifyRestoredRowCounts } from './db-restore-local.mjs';
import {
  buildBatchInsertSql,
  buildRepairStatements,
  compareLocalAndProdSchema,
  describeSchemaMismatches,
} from './db-restore-schema.mjs';

test('compareLocalAndProdSchema detects missing tables, missing columns, and type mismatches', () => {
  const localTables = [
    {
      schema: 'public',
      table: 'videos',
      columns: [
        { name: 'id', formatType: 'uuid', notNull: true },
        { name: 'nullable_diff', formatType: 'text', notNull: true },
      ],
    },
    {
      schema: 'auth',
      table: 'users',
      columns: [{ name: 'id', formatType: 'uuid', notNull: true }],
    },
  ];
  const prodTables = [
    {
      schema: 'public',
      table: 'videos',
      columns: [
        { name: 'id', formatType: 'uuid', notNull: true },
        { name: 'nullable_diff', formatType: 'text', notNull: false },
        { name: 'extra_col', formatType: 'text', notNull: false },
      ],
    },
    {
      schema: 'public',
      table: 'prod_only_table',
      columns: [{ name: 'id', formatType: 'bigint', notNull: true }],
      primaryKey: [{ name: 'id', formatType: 'bigint' }],
    },
    {
      schema: 'auth',
      table: 'users',
      columns: [
        { name: 'id', formatType: 'bigint', notNull: true, defaultExpr: "nextval('auth.users_id_seq'::regclass)" },
        { name: 'sub', formatType: 'text', notNull: true },
      ],
      primaryKey: [{ name: 'id', formatType: 'bigint' }],
    },
  ];

  const diff = compareLocalAndProdSchema(localTables, prodTables);
  assert.equal(diff.totalMismatches, 5);
  const lines = describeSchemaMismatches(diff);
  assert.equal(lines.some((l) => l.includes('[缺表] public.prod_only_table')), true);
  assert.equal(lines.some((l) => l.includes('[缺列] public.videos.extra_col')), true);
  assert.equal(lines.some((l) => l.includes('[类型不一致] auth.users.id')), true);
  assert.equal(lines.some((l) => l.includes('[非空约束不一致] public.videos.nullable_diff')), true);

  const repairSql = buildRepairStatements(diff, prodTables, [
    { schema: 'public', table: 'profiles', constraintName: 'profiles_id_fkey', targetTable: 'auth.users' },
  ]);
  const joined = repairSql.join('\n');
  assert.match(joined, /DROP CONSTRAINT IF EXISTS "profiles_id_fkey"/);
  assert.match(joined, /DROP TABLE IF EXISTS "auth"\."users"/);
  assert.match(joined, /CREATE SEQUENCE IF NOT EXISTS "auth"\."users_id_seq"/);
  assert.match(joined, /CREATE TABLE IF NOT EXISTS "public"\."prod_only_table"/);
  assert.match(joined, /ALTER TABLE "public"\."videos" ADD COLUMN IF NOT EXISTS "extra_col" text/);
  assert.match(joined, /ALTER TABLE "public"\."videos" ALTER COLUMN "nullable_diff" DROP NOT NULL/);
});

test('buildBatchInsertSql excludes generated columns and uses OVERRIDING SYSTEM VALUE for identity tables', () => {
  const sql = buildBatchInsertSql({
    schema: 'public',
    table: 'script_usage_records',
    columns: [
      { name: 'id', identityGeneration: 'a', generatedKind: '' },
      { name: 'hits', identityGeneration: '', generatedKind: '' },
      { name: 'conversion_rate', identityGeneration: '', generatedKind: 's' },
    ],
  });
  assert.match(sql, /INSERT INTO "public"\."script_usage_records" \("id", "hits"\) OVERRIDING SYSTEM VALUE SELECT "id", "hits"/);
  assert.doesNotMatch(sql, /conversion_rate/);
});

test('loadAndVerifyBackup rejects incomplete manifest or corrupted gzip file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dydata-restore-test-'));
  try {
    mkdirSync(path.join(dir, 'tables'));
    const gz = gzipSync('{"id":1}\n');
    const sha256 = createHash('sha256').update(gz).digest('hex');
    writeFileSync(path.join(dir, 'tables', 'public.items.jsonl.gz'), gz);

    writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ allSucceeded: false, failedTable: 'public.bad', tables: [] }),
    );
    assert.throws(() => loadAndVerifyBackup(dir), /拒绝恢复/);

    writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        allSucceeded: true,
        tables: [{ schema: 'public', table: 'items', file: 'tables/public.items.jsonl.gz', rowCount: 1, sha256: '0'.repeat(64), status: 'succeeded' }],
      }),
    );
    assert.throws(() => loadAndVerifyBackup(dir), /SHA256/);

    writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        allSucceeded: true,
        tables: [{ schema: 'public', table: 'items', file: 'tables/public.items.jsonl.gz', rowCount: 1, sha256, status: 'succeeded' }],
      }),
    );
    const loaded = loadAndVerifyBackup(dir);
    assert.equal(loaded.manifest.tables.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyRestoredRowCounts flags any table row count mismatch', async () => {
  const manifest = {
    tables: [
      { schema: 'public', table: 'a', rowCount: 10 },
      { schema: 'public', table: 'b', rowCount: 5 },
    ],
  };
  const counts = { 'public.a': 10, 'public.b': 4 };
  const res = await verifyRestoredRowCounts(manifest, async (s, t) => counts[`${s}.${t}`]);
  assert.equal(res.allMatched, false);
  assert.equal(res.mismatchCount, 1);
  assert.equal(res.results[1].match, false);
});

test('db-restore-local CLI exits non-zero when backup manifest is failed or missing', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dydata-restore-cli-'));
  try {
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ allSucceeded: false, failedTable: 'public.x', tables: [] }));
    assert.throws(
      () => execFileSync(process.execPath, ['scripts/cloudbase/db-restore-local.mjs', '--backup-dir', dir], { stdio: 'pipe' }),
      (err) => err.status !== 0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

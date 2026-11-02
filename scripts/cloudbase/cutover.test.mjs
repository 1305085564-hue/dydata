import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLoopbackRehearsalUrl,
  buildExpectedMetricsSql,
  buildRefreshSql,
  compareMetrics,
  computeSnapshotDelta,
  enrichWithTargetColumns,
  parseMetrics,
} from './cutover-core.mjs';
import { buildTargetMetadataQuery, parseTargetMetadata } from './cutover-sync.mjs';

function snapshot(name, rows) {
  const statements = rows.map((value) => `INSERT INTO public."${name}" ("id", "payload") OVERRIDING SYSTEM VALUE VALUES (${value});`);
  return { statements, sequenceStatements: [], tables: [{ name, columns: ['id', 'payload'], rowCount: rows.length }] };
}

test('local writer requires the rehearsal marker, loopback host, and rehearsal database name', () => {
  const valid = assertLoopbackRehearsalUrl('postgresql://postgres@127.0.0.1:5432/cutover_rehearsal_test', { rehearsal: true });
  assert.equal(valid.host, '127.0.0.1');
  assert.throws(() => assertLoopbackRehearsalUrl('postgresql://postgres@127.0.0.1/cutover_rehearsal_test'), /explicit --rehearsal/);
  assert.throws(() => assertLoopbackRehearsalUrl('postgresql://postgres@db.example/cutover_rehearsal_test', { rehearsal: true }), /loopback/);
  assert.throws(() => assertLoopbackRehearsalUrl('postgresql://postgres@127.0.0.1/production', { rehearsal: true }), /database name/);
});

test('snapshot delta reports additions and removals without exposing row values', () => {
  const before = snapshot('items', ['E\'1\', E\'same\'', 'E\'2\', E\'old\'', 'E\'2\', E\'old\'']);
  const after = snapshot('items', ['E\'1\', E\'changed\'', 'E\'2\', E\'old\'', 'E\'3\', E\'new\'']);

  const [delta] = computeSnapshotDelta(before, after);

  assert.deepEqual(delta, { name: 'items', baselineRows: 3, latestRows: 3, addedRows: 2, removedRows: 2 });
  assert.equal(Object.hasOwn(delta, 'rows'), false);
});

test('expected aggregate SQL reuses the shared dual-digest row shape', () => {
  const parsed = snapshot('items', ["E'1', E'one'"]);
  const [table] = parsed.tables;
  const enriched = enrichWithTargetColumns(parsed, [{
    name: 'items',
    columns: [{ name: 'id', generated: false }, { name: 'payload', generated: false }, { name: 'derived', generated: true }],
  }]);
  assert.deepEqual(enriched.tables[0].generatedColumns, ['derived']);

  const sql = buildExpectedMetricsSql(enriched);

  assert.match(sql, /md5\(\(to_jsonb\(r\) - 'derived'\)::text\)/);
  assert.match(sql, /'count', n::text, 'h1', h1::text, 'h2', h2::text/);
  assert.equal(table.name, 'items');
});

test('target metadata preserves ordinal columns and generated-column flags', () => {
  const query = buildTargetMetadataQuery(['items']);
  assert.match(query, /jsonb_agg\(jsonb_build_object\('name', a\.attname, 'generated', a\.attgenerated <> ''\) ORDER BY a\.attnum\)/);

  assert.deepEqual(parseTargetMetadata('[{"name":"items","columns":[{"name":"id","generated":false}]}]'), [
    { name: 'items', columns: [{ name: 'id', generated: false }] },
  ]);
  assert.throws(() => parseTargetMetadata('[{"name":"items","columns":[{"name":"id","generated":"false"}]}]'), /invalid column/);
});

test('refresh SQL carries only row and sequence data, never source schema or ACL changes', () => {
  const parsed = enrichWithTargetColumns(snapshot('items', ["E'1', E'one'"]), [{
    name: 'items', columns: [{ name: 'id', generated: false }, { name: 'payload', generated: false }],
  }]);
  const metrics = { items: { count: '1', h1: '10', h2: '-20' } };
  const sql = buildRefreshSql(parsed, metrics, metrics);

  assert.match(sql, /LOCK TABLE public\."items" IN ACCESS EXCLUSIVE MODE/);
  assert.match(sql, /SET LOCAL session_replication_role = replica/);
  assert.match(sql, /TRUNCATE TABLE public\."items"/);
  assert.match(sql, /INSERT INTO public\."items"/);
  assert.doesNotMatch(sql, /CREATE\s+(?:TABLE|FUNCTION|POLICY)|GRANT\s|REVOKE\s|ALTER\s+DEFAULT PRIVILEGES/i);
  assert.match(sql, /cutover baseline reconciliation failed/);
  assert.match(sql, /cutover latest reconciliation failed/);
});

test('dual digest comparison rejects count-preserving data drift', () => {
  const result = compareMetrics(
    { items: { count: '1', h1: '3', h2: '4' } },
    { items: { count: '1', h1: '5', h2: '4' } },
    ['items'],
  );
  assert.equal(result.tables[0].countMatches, true);
  assert.equal(result.tables[0].hashesMatch, false);
  assert.equal(result.ok, false);
  assert.deepEqual(parseMetrics('{"items":{"count":"1","h1":"3","h2":"4"}}', 'test'), {
    items: { count: '1', h1: '3', h2: '4' },
  });
});

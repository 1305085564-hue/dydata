import assert from 'node:assert/strict';
import test from 'node:test';

import { copyDumpToStatements } from './copy-data.mjs';
import {
  buildActualQuery,
  buildExpectedQueries,
  reconcileTables,
} from './data-reconciliation.mjs';

function parsed({ name = 'items', columns = ['id', 'payload'], rows = [] } = {}) {
  return {
    statements: rows.map((values) =>
      `INSERT INTO public."${name.replaceAll('"', '""')}" (${columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(', ')}) OVERRIDING SYSTEM VALUE VALUES (${values});`,
    ),
    tables: [{ name, columns, rowCount: rows.length }],
  };
}

test('VALUES rows contain one parenthesized composite expression', () => {
  const [sql] = buildExpectedQueries({ parsed: parsed({ rows: ["E'1', E'x'"] }) });
  assert.match(sql, /VALUES\n  \(ROW\(/);
  assert.match(sql, /::public\."items"\)\n\) AS v\(r\)/);
});

test('builds expected hashes from intact INSERT value expressions and safely quoted identifiers', () => {
  const input = parsed({
    name: 'items "archived"',
    columns: ['id', 'payload, "summary"', 'nullable'],
    rows: [String.raw`E'1', E'你, O''Reilly', NULL`],
  });

  const [query] = buildExpectedQueries({ parsed: input });

  assert.match(query, /ROW\(E'1', E'你, O''Reilly', NULL\)::public\."items ""archived"""/);
  assert.match(query, /AS v\(r\)/);
  assert.match(query, /md5\(to_jsonb\(r\)::text\)/);
  assert.doesNotMatch(query, /INSERT INTO/);
});

test('uses the converter output from the same archive without reparsing a second snapshot', () => {
  const archive = [
    'COPY public."archive rows" (id, payload) FROM stdin;',
    `1\t{"city":"北京","text":"a;b, O'Reilly"}`,
    String.raw`\.`,
  ].join('\n');
  const converted = copyDumpToStatements(archive);
  const queries = buildExpectedQueries({ parsed: converted });

  assert.equal(queries.length, 1);
  assert.match(queries[0], /ROW\(E'1', E'\{"city":"北京","text":"a;b, O''Reilly"\}'\)::public\."archive rows"/);
});

test('chunks expected rows by UTF-8 bytes without splitting multibyte values', () => {
  const input = parsed({
    columns: ['id', 'payload'],
    rows: [
      String.raw`E'1', E'北京雪山'`,
      String.raw`E'2', E'深圳广州'`,
      String.raw`E'3', E'杭州成都'`,
    ],
  });
  const oneRowBytes = Buffer.byteLength(buildExpectedQueries({ parsed: parsed({
    columns: ['id', 'payload'], rows: [String.raw`E'1', E'北京雪山'`],
  }) })[0], 'utf8');

  const queries = buildExpectedQueries({ parsed: input, maxBytes: oneRowBytes + 3 });

  assert.equal(queries.length, 3);
  assert.ok(queries.every((query) => Buffer.byteLength(query, 'utf8') <= oneRowBytes + 3));
  assert.ok(queries.every((query) => /北京雪山|深圳广州|杭州成都/.test(query)));
});

test('sums negative hash segments with BigInt across expected chunks', async () => {
  const input = parsed({ rows: [String.raw`E'1', E'a'`, String.raw`E'2', E'b'`] });
  const maxBytes = Buffer.byteLength(buildExpectedQueries({ parsed: parsed({ rows: [String.raw`E'1', E'a'`] }) })[0], 'utf8') + 3;
  const replies = [
    { Rows: ['[1,-3,8]'] },
    { Rows: ['[1,-4,-2]'] },
    { Rows: ['[2,-7,6]'] },
  ];
  const result = await reconcileTables({
    parsed: input,
    maxBytes,
    execute: async () => replies.shift(),
  });

  assert.deepEqual(result.tables[0].expected, { count: '2', h1: '-7', h2: '6' });
  assert.deepEqual(result.tables[0].actual, { count: '2', h1: '-7', h2: '6' });
  assert.equal(result.tables[0].matches, true);
});

test('reports a mismatch when row contents differ even if counts match', async () => {
  const replies = [{ Rows: ['[1,10,20]'] }, { Rows: ['[1,11,20]'] }];
  const result = await reconcileTables({
    parsed: parsed({ rows: [String.raw`E'1', E'source'`] }),
    execute: async () => replies.shift(),
  });

  assert.equal(result.tables[0].countMatches, true);
  assert.equal(result.tables[0].hashesMatch, false);
  assert.equal(result.tables[0].matches, false);
  assert.equal(result.ok, false);
});

test('reconciles each non-empty table with only its own expected query chunks', async () => {
  const alpha = parsed({ name: 'alpha', columns: ['id', 'payload'], rows: [String.raw`E'1', E'alpha-a'`, String.raw`E'2', E'alpha-b'`] });
  const beta = parsed({ name: 'beta', columns: ['id', 'payload'], rows: [String.raw`E'3', E'beta-a'`] });
  const input = {
    statements: [...alpha.statements, ...beta.statements],
    tables: [...alpha.tables, ...beta.tables],
  };
  const replies = new Map([
    ['alpha-expected', { Rows: ['[2,30,40]'] }],
    ['alpha-actual', { Rows: ['[2,30,40]'] }],
    ['beta-expected', { Rows: ['[1,-7,8]'] }],
    ['beta-actual', { Rows: ['[1,-7,8]'] }],
  ]);
  const result = await reconcileTables({
    parsed: input,
    execute: async (query) => {
      const key = query.includes('FROM public."alpha" AS t')
        ? 'alpha-actual'
        : query.includes('FROM public."beta" AS t')
          ? 'beta-actual'
          : query.includes("E'alpha-a'")
            ? 'alpha-expected'
            : 'beta-expected';
      const reply = replies.get(key);
      if (!reply) throw new Error(`unexpected extra query: ${key}`);
      replies.delete(key);
      return reply;
    },
  });

  assert.equal(result.tables.length, 2);
  assert.deepEqual(result.tables.map(({ name, matches }) => ({ name, matches })), [
    { name: 'alpha', matches: true },
    { name: 'beta', matches: true },
  ]);
  assert.deepEqual(result.tables.map(({ expected }) => expected.count), ['2', '1']);
  assert.equal(result.queriesExecuted, 4);
});

test('marks a table mismatched if executed expected queries do not cover its COPY rowCount', async () => {
  const replies = [{ Rows: ['[1,5,6]'] }, { Rows: ['[1,5,6]'] }];
  const result = await reconcileTables({
    parsed: parsed({ rows: [String.raw`E'1', E'a'`, String.raw`E'2', E'b'`] }),
    execute: async () => replies.shift(),
  });

  assert.equal(result.tables[0].sourceRowCountMatches, false);
  assert.equal(result.tables[0].matches, false);
  assert.equal(result.ok, false);
});

test('treats an empty source table as zero expected rows and still checks the real table', async () => {
  let calls = 0;
  const result = await reconcileTables({
    parsed: parsed({ rows: [] }),
    execute: async (query) => {
      calls += 1;
      assert.match(query, /FROM public\."items" AS t/);
      return { Rows: ['[0,0,0]'] };
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result.tables[0].expected, { count: '0', h1: '0', h2: '0' });
  assert.equal(result.tables[0].matches, true);
});

test('builds the actual table query using the target row composite JSON', () => {
  const query = buildActualQuery({ name: 'odd" table' });

  assert.match(query, /to_jsonb\(t\)::text/);
  assert.match(query, /FROM public\."odd"" table" AS t/);
  assert.match(query, /substr\(md5\(to_jsonb\(t\)::text\),17,16\)/);
});

test('pads a generated middle column and hashes expected/actual rows without it', async () => {
  const columns = [
    'id', 'case_id', 'recorded_by', 'account_id', 'account_name_snapshot', 'team_id',
    'used_at', 'views', 'follows', 'source', 'daily_report_id', 'note', 'created_at',
    'updated_at', 'result_flag',
  ];
  const typeColumns = [...columns.slice(0, 9), 'conversion_rate', ...columns.slice(9)];
  const values = [
    String.raw`E'00000000-0000-0000-0000-000000000001'`,
    String.raw`E'00000000-0000-0000-0000-000000000002'`,
    String.raw`E'00000000-0000-0000-0000-000000000003'`,
    'NULL',
    String.raw`E'account'`,
    'NULL',
    String.raw`E'2026-11-01'`,
    String.raw`E'10'`,
    String.raw`E'3'`,
    String.raw`E'manual'`,
    'NULL',
    String.raw`E'O''Reilly'`,
    String.raw`E'2026-11-01 00:00:00+00'`,
    String.raw`E'2026-11-01 00:00:00+00'`,
    String.raw`E'pass'`,
  ];
  const input = {
    statements: [`INSERT INTO public."script_usage_records" (${columns.map((column) => `"${column}"`).join(', ')}) OVERRIDING SYSTEM VALUE VALUES (${values.join(', ')});`],
    tables: [{
      name: 'script_usage_records',
      columns,
      typeColumns,
      generatedColumns: ['conversion_rate'],
      rowCount: 1,
    }],
  };
  const executed = [];
  const result = await reconcileTables({
    parsed: input,
    execute: async (sql) => {
      executed.push(sql);
      return { Rows: ['[1,123,456]'] };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(executed.length, 2);
  assert.match(executed[0], /ROW\([\s\S]*E'3', NULL, E'manual'[\s\S]*\)::public\."script_usage_records"/);
  assert.match(executed[0], /to_jsonb\(r\)\s*-\s*'conversion_rate'/);
  assert.match(executed[1], /to_jsonb\(t\)\s*-\s*'conversion_rate'/);
  assert.match(executed[0], /VALUES\n  \(ROW\(/);
  assert.match(executed[0], /\)\n\) AS v\(r\)/);
});

test('fails closed when generated columns lack declaration order or COPY order differs from type metadata', () => {
  const statement = 'INSERT INTO public."generated_items" ("id", "payload") OVERRIDING SYSTEM VALUE VALUES (E\'1\', E\'x\');';
  assert.throws(() => buildExpectedQueries({
    parsed: {
      statements: [statement],
      tables: [{ name: 'generated_items', columns: ['id', 'payload'], generatedColumns: ['derived'], rowCount: 1 }],
    },
  }), /typeColumns/i);

  assert.throws(() => buildExpectedQueries({
    parsed: {
      statements: [statement],
      tables: [{
        name: 'generated_items',
        columns: ['payload', 'id'],
        typeColumns: ['id', 'derived', 'payload'],
        generatedColumns: ['derived'],
        rowCount: 1,
      }],
    },
  }), /COPY column order.*typeColumns/i);
});

test('rejects malformed or multi-statement INSERT inputs and row-count drift', () => {
  const input = parsed({ rows: [String.raw`E'1', E'ok'`] });
  assert.throws(() => buildExpectedQueries({ parsed: { ...input, statements: [`${input.statements[0]} SELECT 1;`] } }), /single INSERT/i);
  assert.throws(() => buildExpectedQueries({ parsed: { ...input, tables: [{ ...input.tables[0], rowCount: 2 }] } }), /rowCount/i);
  assert.throws(() => buildExpectedQueries({ parsed: parsed({ columns: ['id', 'bad\0column'], rows: [String.raw`E'1', E'ok'`] }) }), /identifier/i);
  assert.throws(() => buildActualQuery({ name: 'bad\0name' }), /identifier/i);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { copyDumpToStatements } from './copy-data.mjs';

test('converts COPY rows to identity-preserving INSERTs and keeps sequence statements separate', () => {
  const row = [
    '42',
    "O'Reilly C:\\\\archive",
    '{"city":"北京","path":"C:\\\\tmp"}',
    String.raw`\\xDEADBEEF`,
    String.raw`\N`,
    String.raw`\\N`,
    '',
    String.raw`line\nnext\tend\b\f\r\v`,
  ].join('\t');
  const dump = [
    '-- dump header',
    String.raw`\restrict guard`,
    'SET statement_timeout = 0;',
    "SELECT pg_catalog.set_config('search_path', '', false);",
    'COPY public."Mixed Table" (id, "quote""col", payload, bytes, nullable, literal_null, empty, escaped) FROM stdin;',
    row,
    String.raw`\.`,
    "SELECT pg_catalog.setval('public.Mixed Table_id_seq', 42, true);",
    String.raw`\unrestrict guard`,
    '',
  ].join('\n');

  const result = copyDumpToStatements(dump);

  assert.deepEqual(result.statements, [String.raw`INSERT INTO public."Mixed Table" ("id", "quote""col", "payload", "bytes", "nullable", "literal_null", "empty", "escaped") OVERRIDING SYSTEM VALUE VALUES (E'42', E'O''Reilly C:\\archive', E'{"city":"北京","path":"C:\\tmp"}', E'\\xDEADBEEF', NULL, E'\\N', E'', E'line\nnext\tend\b\f\r\013');`]);
  assert.deepEqual(result.sequenceStatements, ["SELECT pg_catalog.setval('public.Mixed Table_id_seq', 42, true);"]);
  assert.deepEqual(result.tables, [{
    name: 'Mixed Table',
    columns: ['id', 'quote"col', 'payload', 'bytes', 'nullable', 'literal_null', 'empty', 'escaped'],
    rowCount: 1,
    sha256ofrawCopy: createHash('sha256').update(`${row}\n`, 'utf8').digest('hex'),
  }]);
});

test('decodes octal and hexadecimal escapes as UTF-8 bytes', () => {
  const dump = [
    'COPY public.words (octal_value, hex_value) FROM stdin;',
    [String.raw`\344\275\240`, String.raw`\xE9\x9B\xaa`].join('\t'),
    [String.raw`\xE4\xBD\xa0`, String.raw`\351\233\252`].join('\t'),
    String.raw`\.`,
  ].join('\n');

  const result = copyDumpToStatements(dump);

  assert.deepEqual(result.statements, [
    String.raw`INSERT INTO public."words" ("octal_value", "hex_value") OVERRIDING SYSTEM VALUE VALUES (E'你', E'雪');`,
    String.raw`INSERT INTO public."words" ("octal_value", "hex_value") OVERRIDING SYSTEM VALUE VALUES (E'你', E'雪');`,
  ]);
  assert.equal(result.tables[0].rowCount, 2);
});

test('preserves quoted identifiers, escaped apostrophes, literal backslashes, and empty fields', () => {
  const dump = [
    'COPY public."a""b" ("A B", "select") FROM stdin;',
    [String.raw`it's\\`, String.raw`\\N`].join('\t'),
    [String.raw`\x5c\x27quote`, ''].join('\t'),
    ['', ''].join('\t'),
    String.raw`\.`,
  ].join('\n');

  const result = copyDumpToStatements(dump);

  assert.equal(result.tables[0].name, 'a"b');
  assert.deepEqual(result.tables[0].columns, ['A B', 'select']);
  assert.equal(result.statements.length, 3);
  assert.ok(result.statements[0].includes(String.raw`E'it''s\\'`));
  assert.ok(result.statements[0].includes(String.raw`E'\\N'`));
  assert.ok(result.statements[1].includes(String.raw`E'\\''quote'`));
  assert.ok(result.statements[2].endsWith("VALUES (E'', E'');"));
});

test('rejects unknown commands, non-public schemas, mismatched rows, missing terminators, and NUL', () => {
  assert.throws(() => copyDumpToStatements('ALTER TABLE public.t ENABLE TRIGGER ALL;'), /unknown command/i);
  assert.throws(() => copyDumpToStatements('COPY private.t (id) FROM stdin;\n1\n\\.'), /only public/i);
  assert.throws(() => copyDumpToStatements('COPY public.t (a, b) FROM stdin;\n1\n\\.'), /field count/i);
  assert.throws(() => copyDumpToStatements('COPY public.t (a) FROM stdin;\n1'), /missing.*\\\./i);
  assert.throws(() => copyDumpToStatements('COPY public.t (a) FROM stdin;\n\\000\n\\.'), /NUL/i);
});

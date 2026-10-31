import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  BatchExecutionError,
  RECEIPT_SCHEMA_SQL,
  ReceiptConflictError,
  packSqlBatches,
  runBatches,
  splitPostgresDump,
} from './sql-batches.mjs';

test('splitPostgresDump handles dump meta, quoted text, dollar bodies, and nested comments', () => {
  const dump = String.raw`-- header ;
\restrict dump-key
CREATE FUNCTION "f;""x"() RETURNS void AS $body$
BEGIN
  PERFORM 'doubled '' quote;';
  /* outer ; /* nested ; */ still outer ; */
  -- semicolon ; and apparent meta command \restrict ignored
END;
$body$ LANGUAGE plpgsql;
SELECT E'escaped \' quote; still string;';
SELECT "a;""b" /* outer ; /* nested ; */ tail */;
SELECT 2 -- line comment ; is ignored
;
INSERT INTO "table;name" VALUES ($other$body; with $$ inside$other$);
SELECT $meta$
\restrict literal
\unrestrict literal
;$meta$;
\unrestrict dump-key
`;

  const statements = splitPostgresDump(dump);

  assert.equal(statements.length, 6);
  assert.match(statements[0], /CREATE FUNCTION/);
  assert.match(statements[0], /nested ;/);
  assert.match(statements[1], /E'escaped \\' quote; still string;'/);
  assert.match(statements[2], /"a;""b"/);
  assert.match(statements[2], /nested ;/);
  assert.match(statements[3], /SELECT 2/);
  assert.match(statements[4], /"table;name"/);
  assert.match(statements[5], /\\restrict literal/);
  assert.doesNotMatch(statements.join('\n'), /^\\(?:un)?restrict dump-key$/m);
  assert.throws(() => splitPostgresDump(dump, { filterDumpMeta: false }), /unterminated SQL statement/i);
});

test('splitPostgresDump rejects unterminated strings, dollar bodies, and block comments', () => {
  assert.throws(() => splitPostgresDump("SELECT 'broken;"), /unterminated single-quoted string/i);
  assert.throws(() => splitPostgresDump('SELECT $tag$broken;'), /unterminated dollar-quoted string/i);
  assert.throws(() => splitPostgresDump('SELECT 1 /* outer /* inner */'), /unterminated block comment/i);
});

test('packSqlBatches enforces UTF-8 byte budgets and hashes complete batches', () => {
  const statements = ["INSERT INTO t VALUES ('雪');", 'SELECT 2;'];
  const firstBytes = Buffer.byteLength(statements[0], 'utf8');
  const batches = packSqlBatches(statements, { maxBytes: firstBytes, migrationId: 'm-雪' });

  assert.equal(batches.length, 2);
  assert.equal(batches[0].bytes, firstBytes);
  assert.equal(batches[0].id, 'm-雪:1');
  assert.equal(
    batches[0].sha256,
    createHash('sha256').update(statements[0], 'utf8').digest('hex'),
  );
  assert.throws(
    () => packSqlBatches([statements[0]], { maxBytes: firstBytes - 1, migrationId: 'm' }),
    /single statement .* exceeds.*byte budget/i,
  );
  assert.throws(
    () => packSqlBatches(['SELECT 1'], { maxBytes: 100, migrationId: 'm' }),
    /complete statement/i,
  );
});

test('runBatches applies settings, payload, and receipt in one transaction and returns request id and time', async () => {
  const calls = [];
  const batch = { id: "migration'o:1", sql: 'SELECT 1;' };
  const hash = createHash('sha256').update(batch.sql, 'utf8').digest('hex');
  let lookupCalls = 0;
  const report = await runBatches({
    batches: [batch],
    searchPath: ['pg_catalog', 'custom schema'],
    lookupReceipt: async (id) => {
      assert.equal(id, batch.id);
      lookupCalls += 1;
      return lookupCalls === 1 ? null : { sha256: hash };
    },
    execute: async (sql, metadata) => {
      calls.push({ sql, metadata });
      return { RequestId: 'request-1' };
    },
  });

  assert.equal(report.status, 'completed');
  assert.equal(report.requestId, 'request-1');
  assert.ok(report.ms >= 0);
  assert.equal(calls.length, 1);
  assert.equal(lookupCalls, 2);
  assert.equal(calls[0].metadata.batchId, batch.id);
  assert.match(calls[0].sql, /BEGIN;\s*SET LOCAL check_function_bodies = false;/);
  assert.match(calls[0].sql, /SET LOCAL search_path = "pg_catalog", "custom schema";/);
  assert.match(calls[0].sql, /SELECT 1;\s*INSERT INTO dydata_migration\.sql_batch_receipts/);
  assert.match(calls[0].sql, /VALUES \('migration''o:1', '[a-f0-9]{64}'\);\s*COMMIT;/);
  assert.doesNotMatch(calls[0].sql, /\bPUBLIC\b/i);
  assert.match(RECEIPT_SCHEMA_SQL, /CREATE SCHEMA IF NOT EXISTS dydata_migration/);
  assert.match(RECEIPT_SCHEMA_SQL, /REVOKE ALL ON SCHEMA dydata_migration FROM PUBLIC/);
});

test('runBatches skips a matching receipt and stops on a different hash', async () => {
  const batch = { id: 'migration:1', sql: 'SELECT 1;' };
  let executeCalls = 0;
  const hash = createHash('sha256').update(batch.sql, 'utf8').digest('hex');
  const skipped = await runBatches({
    batches: [batch],
    lookupReceipt: async () => ({ sha256: hash }),
    execute: async () => {
      executeCalls += 1;
    },
  });
  assert.equal(skipped.batches[0].status, 'skipped');
  assert.equal(executeCalls, 0);

  await assert.rejects(
    runBatches({
      batches: [batch],
      lookupReceipt: async () => ({ sha256: '0'.repeat(64) }),
      execute: async () => {
        executeCalls += 1;
      },
    }),
    ReceiptConflictError,
  );
  assert.equal(executeCalls, 0);
});

test('runBatches rejects transaction control that could separate SQL from its receipt', async () => {
  let executeCalls = 0;
  await assert.rejects(
    runBatches({
      batches: [{ id: 'migration:1', sql: 'SELECT 1; COMMIT;' }],
      lookupReceipt: async () => null,
      execute: async () => {
        executeCalls += 1;
      },
    }),
    /must not manage transaction boundaries/i,
  );
  assert.equal(executeCalls, 0);
});

test('runBatches confirms a lost response from the matching committed receipt without replaying', async () => {
  const batch = { id: 'migration:1', sql: 'SELECT 1;' };
  const hash = createHash('sha256').update(batch.sql, 'utf8').digest('hex');
  let executeCalls = 0;
  let lookupCalls = 0;
  const report = await runBatches({
    batches: [batch],
    lookupReceipt: async () => {
      lookupCalls += 1;
      return lookupCalls === 1 ? null : { sha256: hash };
    },
    execute: async () => {
      executeCalls += 1;
      const error = new Error('connection dropped after commit');
      error.requestId = 'request-lost';
      throw error;
    },
  });

  assert.equal(executeCalls, 1);
  assert.equal(report.batches[0].status, 'committed-after-error');
  assert.equal(report.requestId, 'request-lost');
});

test('runBatches reports rollback and never automatically retries an absent receipt', async () => {
  const batch = { id: 'migration:1', sql: 'SELECT 1;' };
  let executeCalls = 0;

  await assert.rejects(
    runBatches({
      batches: [batch],
      lookupReceipt: async () => null,
      execute: async () => {
        executeCalls += 1;
        const error = new Error('request failed');
        error.transactionRolledBack = true;
        throw error;
      },
    }),
    (error) => error instanceof BatchExecutionError && error.outcome === 'ROLLED_BACK',
  );
  assert.equal(executeCalls, 1);
});

test('runBatches reports UNKNOWN for an unconfirmed timeout even if the receipt commits later', async () => {
  const batch = { id: 'migration:1', sql: 'SELECT 1;' };
  const hash = createHash('sha256').update(batch.sql, 'utf8').digest('hex');
  let executeCalls = 0;
  let lookupCalls = 0;
  let receipt = null;
  let finishLateCommit;
  const lateCommit = new Promise((resolve) => {
    finishLateCommit = resolve;
  });

  await assert.rejects(
    runBatches({
      batches: [batch],
      lookupReceipt: async () => {
        lookupCalls += 1;
        return receipt;
      },
      execute: async () => {
        executeCalls += 1;
        setTimeout(() => {
          receipt = { sha256: hash };
          finishLateCommit();
        }, 20);
        const error = new Error('request timed out');
        error.requestId = 'request-timeout';
        throw error;
      },
    }),
    (error) => error instanceof BatchExecutionError && error.outcome === 'UNKNOWN',
  );

  assert.equal(executeCalls, 1);
  assert.equal(lookupCalls, 2);
  await lateCommit;
  assert.equal(receipt.sha256, hash);
});

test('runBatches does not report success without a matching receipt after execute resolves', async () => {
  const batch = { id: 'migration:1', sql: 'SELECT 1;' };
  let lookupCalls = 0;

  await assert.rejects(
    runBatches({
      batches: [batch],
      lookupReceipt: async () => {
        lookupCalls += 1;
        return null;
      },
      execute: async () => ({ RequestId: 'request-without-receipt' }),
    }),
    (error) => error instanceof BatchExecutionError
      && error.outcome === 'UNKNOWN'
      && error.requestId === 'request-without-receipt',
  );
  assert.equal(lookupCalls, 2);
});

test('runBatches reports UNKNOWN when receipt state cannot be established', async () => {
  const batch = { id: 'migration:1', sql: 'SELECT 1;' };
  let executeCalls = 0;
  let lookupCalls = 0;

  await assert.rejects(
    runBatches({
      batches: [batch],
      lookupReceipt: async () => {
        lookupCalls += 1;
        if (lookupCalls === 1) return null;
        throw new Error('receipt lookup unavailable');
      },
      execute: async () => {
        executeCalls += 1;
        throw new Error('request timed out');
      },
    }),
    (error) => error instanceof BatchExecutionError && error.outcome === 'UNKNOWN',
  );
  assert.equal(executeCalls, 1);
});

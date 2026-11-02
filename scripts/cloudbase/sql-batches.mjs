import { createHash } from 'node:crypto';

/**
 * SQL to provision the private receipt ledger. Exported for the caller to run
 * deliberately; runBatches never initializes an external database.
 */
export const RECEIPT_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS dydata_migration;
REVOKE ALL ON SCHEMA dydata_migration FROM PUBLIC;
CREATE TABLE IF NOT EXISTS dydata_migration.sql_batch_receipts (
  batch_id text PRIMARY KEY,
  sha256 text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE dydata_migration.sql_batch_receipts FROM PUBLIC;`;

const DEFAULT_SEARCH_PATH = ['pg_catalog', 'public'];
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';
}

function isIdentifierChar(char) {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}

function findDollarDelimiter(source, index) {
  if (index > 0 && isIdentifierChar(source[index - 1])) return null;
  const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(source.slice(index));
  return match?.[0] ?? null;
}

function hasEscapeStringPrefix(source, quoteIndex) {
  const previous = source[quoteIndex - 1];
  const beforePrevious = source[quoteIndex - 2];
  if ((previous === 'e' || previous === 'E') && !isIdentifierChar(beforePrevious)) return true;
  return previous === '&'
    && (source[quoteIndex - 2] === 'u' || source[quoteIndex - 2] === 'U')
    && !isIdentifierChar(source[quoteIndex - 3]);
}

/**
 * Split plain PostgreSQL dump text into complete statements. Only standalone
 * pg_dump `\\restrict` and `\\unrestrict` lines are filtered by default;
 * other psql meta commands are left for the caller to handle explicitly.
 */
export function splitPostgresDump(source, { filterDumpMeta = true } = {}) {
  if (typeof source !== 'string') throw new TypeError('SQL dump must be a string');

  let state = 'normal';
  let dollarDelimiter = '';
  let blockDepth = 0;
  let singleBackslashEscapes = false;
  let hasCode = false;
  let statementStart = 0;
  let filteredChars = null;
  const ranges = [];
  const charAt = (index) => source[index];

  for (let i = 0; i < source.length;) {
    const char = charAt(i);

    if (state === 'line-comment') {
      if (char === '\n') state = 'normal';
      i += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (char === '/' && charAt(i + 1) === '*') {
        blockDepth += 1;
        i += 2;
      } else if (char === '*' && charAt(i + 1) === '/') {
        blockDepth -= 1;
        i += 2;
        if (blockDepth === 0) state = 'normal';
      } else {
        i += 1;
      }
      continue;
    }

    if (state === 'single-quoted') {
      if (char === '\\' && singleBackslashEscapes) {
        i += Math.min(2, source.length - i);
      } else if (char === "'" && charAt(i + 1) === "'") {
        i += 2;
      } else if (char === "'") {
        state = 'normal';
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (state === 'double-quoted') {
      if (char === '"' && charAt(i + 1) === '"') {
        i += 2;
      } else if (char === '"') {
        state = 'normal';
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (state === 'dollar-quoted') {
      if (source.startsWith(dollarDelimiter, i)) {
        i += dollarDelimiter.length;
        state = 'normal';
      } else {
        i += 1;
      }
      continue;
    }

    if (filterDumpMeta && !hasCode && (i === 0 || charAt(i - 1) === '\n')) {
      const lineEnd = source.indexOf('\n', i);
      const end = lineEnd === -1 ? source.length : lineEnd;
      const line = source.slice(i, end);
      if (/^[\t ]*\\(?:restrict|unrestrict)\b[^\r\n]*\r?$/.test(line)) {
        filteredChars ??= source.split('');
        for (let j = i; j < end; j += 1) {
          if (filteredChars[j] !== '\r') filteredChars[j] = ' ';
        }
        i = end;
        continue;
      }
    }

    if (char === '-' && charAt(i + 1) === '-') {
      state = 'line-comment';
      i += 2;
    } else if (char === '/' && charAt(i + 1) === '*') {
      state = 'block-comment';
      blockDepth = 1;
      i += 2;
    } else if (char === "'") {
      hasCode = true;
      singleBackslashEscapes = hasEscapeStringPrefix(source, i);
      state = 'single-quoted';
      i += 1;
    } else if (char === '"') {
      hasCode = true;
      state = 'double-quoted';
      i += 1;
    } else if (char === '$' && findDollarDelimiter(source, i)) {
      hasCode = true;
      dollarDelimiter = findDollarDelimiter(source, i);
      state = 'dollar-quoted';
      i += dollarDelimiter.length;
    } else if (char === ';') {
      if (hasCode) ranges.push([statementStart, i + 1]);
      statementStart = i + 1;
      hasCode = false;
      i += 1;
    } else {
      if (!isWhitespace(char)) hasCode = true;
      i += 1;
    }
  }

  if (state === 'single-quoted') throw new SyntaxError('Unterminated single-quoted string in SQL dump');
  if (state === 'double-quoted') throw new SyntaxError('Unterminated quoted identifier in SQL dump');
  if (state === 'dollar-quoted') throw new SyntaxError('Unterminated dollar-quoted string in SQL dump');
  if (state === 'block-comment') throw new SyntaxError('Unterminated block comment in SQL dump');
  if (hasCode) throw new SyntaxError('Unterminated SQL statement in dump');

  const parsedSource = filteredChars?.join('') ?? source;
  return ranges.map(([start, end]) => parsedSource.slice(start, end));
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Pack complete SQL statements without exceeding a UTF-8 byte budget. */
export function packSqlBatches(statements, { maxBytes, migrationId } = {}) {
  if (!Array.isArray(statements)) throw new TypeError('statements must be an array');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive safe integer');
  }
  if (typeof migrationId !== 'string' || migrationId.trim() === '' || migrationId.includes('\0')) {
    throw new TypeError('migrationId must be a non-empty string without NUL');
  }

  const batches = [];
  let currentStatements = [];
  let currentBytes = 0;

  const flush = () => {
    if (currentStatements.length === 0) return;
    const sql = currentStatements.join('');
    batches.push({
      id: `${migrationId}:${batches.length + 1}`,
      sql,
      sha256: sha256(sql),
      bytes: currentBytes,
    });
    currentStatements = [];
    currentBytes = 0;
  };

  statements.forEach((statement, index) => {
    if (typeof statement !== 'string' || statement.trim() === '') {
      throw new TypeError(`statement ${index + 1} must be a non-empty string`);
    }
    if (statement.includes('\0')) throw new TypeError(`statement ${index + 1} contains NUL`);
    let parsedStatements;
    try {
      parsedStatements = splitPostgresDump(statement, { filterDumpMeta: false });
    } catch {
      throw new TypeError(`statement ${index + 1} must be exactly one complete statement`);
    }
    if (parsedStatements.length !== 1) {
      throw new TypeError(`statement ${index + 1} must be exactly one complete statement`);
    }
    const bytes = Buffer.byteLength(statement, 'utf8');
    if (bytes > maxBytes) {
      throw new RangeError(`Single statement ${index + 1} (${bytes} bytes) exceeds the ${maxBytes}-byte budget`);
    }
    if (currentBytes + bytes > maxBytes) flush();
    currentStatements.push(statement);
    currentBytes += bytes;
  });

  flush();
  return batches;
}

function quoteIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.length === 0 || identifier.includes('\0')) {
    throw new TypeError('searchPath entries must be non-empty strings without NUL');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new TypeError('SQL text values must be strings without NUL');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function getLeadingTokens(statement, count = 2) {
  const tokens = [];
  for (let i = 0; i < statement.length && tokens.length < count;) {
    if (isWhitespace(statement[i])) {
      i += 1;
      continue;
    }
    if (statement.startsWith('--', i)) {
      const end = statement.indexOf('\n', i + 2);
      i = end === -1 ? statement.length : end + 1;
      continue;
    }
    if (statement.startsWith('/*', i)) {
      let depth = 1;
      i += 2;
      while (i < statement.length && depth > 0) {
        if (statement.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (statement.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }
    const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(statement.slice(i));
    if (!match) break;
    tokens.push(match[0].toUpperCase());
    i += match[0].length;
  }
  return tokens;
}

function assertBatchHasNoTransactionControl(sql) {
  const statements = splitPostgresDump(sql, { filterDumpMeta: false });
  if (statements.length === 0) throw new TypeError('Batch SQL must contain at least one complete statement');
  for (const statement of statements) {
    const [first, second] = getLeadingTokens(statement);
    if (['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'ABORT', 'SAVEPOINT', 'RELEASE'].includes(first)
      || (first === 'START' && second === 'TRANSACTION')
      || (first === 'PREPARE' && second === 'TRANSACTION')) {
      throw new TypeError('Batch SQL must not manage transaction boundaries');
    }
  }
}

function getReceiptHash(receipt) {
  if (receipt == null || receipt === false || receipt?.found === false) return null;
  const value = receipt.sha256 ?? receipt.hash;
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new TypeError('Receipt lookup must return null or an object containing a SHA-256 hash');
  }
  return value.toLowerCase();
}

function readRequestId(value) {
  if (typeof value === 'string') return value;
  const id = value?.requestId ?? value?.RequestId;
  return typeof id === 'string' ? id : null;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

export class ReceiptConflictError extends Error {
  constructor(batchId) {
    super(`A different receipt hash already exists for batch ${batchId}`);
    this.name = 'ReceiptConflictError';
    this.batchId = batchId;
  }
}

export class BatchExecutionError extends Error {
  constructor({ batchId, outcome, requestId, ms, completedBatches, reason }) {
    super(`Batch ${batchId} execution outcome is ${outcome}`);
    this.name = 'BatchExecutionError';
    this.batchId = batchId;
    this.outcome = outcome;
    this.requestId = requestId ?? null;
    this.ms = ms;
    this.completedBatches = completedBatches;
    this.reason = reason;
  }
}

/** The exact SQL sent by runBatches, also used by offline byte validation. */
export function wrapSqlBatch({ id, sql, sha256: hash }, { searchPath = DEFAULT_SEARCH_PATH } = {}) {
  const pathSql = searchPath.map(quoteIdentifier).join(', ');
  return [
    'BEGIN;',
    'SET LOCAL check_function_bodies = false;',
    `SET LOCAL search_path = ${pathSql};`,
    sql,
    `INSERT INTO dydata_migration.sql_batch_receipts (batch_id, sha256) VALUES (${quoteLiteral(id)}, ${quoteLiteral(hash)});`,
    'COMMIT;',
  ].join('\n');
}

/**
 * Execute transaction-wrapped batches using caller-provided CloudBase adapters.
 * lookupReceipt(batchId) must provide an authoritative null or { sha256 };
 * execute(sql, metadata) returns a result with requestId/RequestId. On error,
 * an absent receipt means ROLLED_BACK only when the thrown error explicitly
 * sets transactionRolledBack === true. Neither adapter is retried here.
 */
export async function runBatches({ batches, execute, lookupReceipt, searchPath = DEFAULT_SEARCH_PATH } = {}) {
  if (!Array.isArray(batches)) throw new TypeError('batches must be an array');
  if (typeof execute !== 'function') throw new TypeError('execute must be a function');
  if (typeof lookupReceipt !== 'function') throw new TypeError('lookupReceipt must be a function');
  if (!Array.isArray(searchPath) || searchPath.length === 0) {
    throw new TypeError('searchPath must be a non-empty array of schema names');
  }
  searchPath.map(quoteIdentifier); // Validate even when batches is empty.
  const seenIds = new Set();
  const results = [];
  const startTime = nowMs();
  let lastRequestId = null;

  for (const batch of batches) {
    if (!batch || typeof batch !== 'object') throw new TypeError('Each batch must be an object');
    const { id, sql } = batch;
    if (typeof id !== 'string' || id.trim() === '' || id.includes('\0')) {
      throw new TypeError('Each batch id must be a non-empty string without NUL');
    }
    if (seenIds.has(id)) throw new TypeError(`Duplicate batch id ${id}`);
    seenIds.add(id);
    if (typeof sql !== 'string' || sql.trim() === '' || sql.includes('\0')) {
      throw new TypeError(`Batch ${id} must contain SQL text without NUL`);
    }

    const calculatedHash = sha256(sql);
    if (batch.sha256 !== undefined
      && (typeof batch.sha256 !== 'string' || batch.sha256.toLowerCase() !== calculatedHash)) {
      throw new TypeError(`Batch ${id} SHA-256 does not match its SQL`);
    }
    assertBatchHasNoTransactionControl(sql);

    let lookupResult;
    try { lookupResult = await lookupReceipt(id); } catch(error) {
      throw new BatchExecutionError({batchId:id,outcome:'NOT_STARTED',requestId:readRequestId(error),ms:0,completedBatches:results,reason:error.reason??'receipt-lookup-failed-before-write'});
    }
    const existingReceipt = getReceiptHash(lookupResult);
    if (existingReceipt !== null) {
      if (existingReceipt !== calculatedHash) throw Object.assign(new ReceiptConflictError(id), {requestId:readRequestId(lookupResult),completedBatches:results});
      results.push({ id, sha256: calculatedHash, status: 'skipped', requestId: null, ms: 0 });
      continue;
    }

    const wrappedSql = wrapSqlBatch({ id, sql, sha256: calculatedHash }, { searchPath });
    const batchStart = nowMs();

    let executionResult;
    try {
      executionResult = await execute(wrappedSql, { batchId: id, sha256: calculatedHash });
    } catch (executionError) {
      const ms = nowMs() - batchStart;
      const requestId = readRequestId(executionError);
      let outcome = 'UNKNOWN';
      let reason = 'receipt-lookup-failed';
      try {
        const receiptHash = getReceiptHash(await lookupReceipt(id));
        if (receiptHash === null) {
          if (executionError?.transactionRolledBack === true) {
            outcome = 'ROLLED_BACK';
            reason = 'receipt-absent-transaction-rollback-confirmed';
          } else {
            reason = 'receipt-absent-rollback-unconfirmed';
          }
        } else if (receiptHash === calculatedHash) {
          outcome = 'COMMITTED';
          reason = 'matching-receipt';
        } else {
          reason = 'receipt-hash-mismatch';
        }
      } catch {
        // The state remains UNKNOWN. Never retry a batch after an ambiguous failure.
      }

      if (outcome === 'COMMITTED') {
        if (requestId) lastRequestId = requestId;
        results.push({ id, sha256: calculatedHash, status: 'committed-after-error', requestId, ms });
        continue;
      }

      throw new BatchExecutionError({
        batchId: id,
        outcome,
        requestId,
        ms,
        completedBatches: results,
        reason,
      });
    }

    const requestId = readRequestId(executionResult);
    let receiptHash;
    try {
      receiptHash = getReceiptHash(await lookupReceipt(id));
    } catch {
      throw new BatchExecutionError({
        batchId: id,
        outcome: 'UNKNOWN',
        requestId,
        ms: nowMs() - batchStart,
        completedBatches: results,
        reason: 'receipt-lookup-failed-after-success',
      });
    }
    if (receiptHash !== calculatedHash) {
      throw new BatchExecutionError({
        batchId: id,
        outcome: 'UNKNOWN',
        requestId,
        ms: nowMs() - batchStart,
        completedBatches: results,
        reason: receiptHash === null ? 'receipt-missing-after-success' : 'receipt-hash-mismatch-after-success',
      });
    }
    const ms = nowMs() - batchStart;
    if (requestId) lastRequestId = requestId;
    results.push({ id, sha256: calculatedHash, status: 'executed', requestId, ms });
  }

  return {
    status: 'completed',
    batches: results,
    requestId: lastRequestId,
    ms: nowMs() - startTime,
  };
}

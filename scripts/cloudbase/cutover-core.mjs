import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client as PgClient } from 'pg';
import { copyDumpToStatements } from './copy-data.mjs';
import { buildActualQuery, buildExpectedQueries } from './data-reconciliation.mjs';

export const PRIVATE_MODE = 0o600;
export const PRIVATE_DIR_MODE = 0o700;

export function isAuthorizedSourceIdentity(source) {
  return source?.port === '5432' && source.database === 'postgres' && (
    (source.host === 'db.gcrhhxaopomtposmahsw.supabase.co' && source.user === 'postgres') ||
    (source.host === 'aws-1-ap-southeast-1.pooler.supabase.com' && source.user === 'postgres.gcrhhxaopomtposmahsw')
  );
}

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError('Invalid SQL identifier');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function quoteLiteral(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new TypeError('Invalid SQL literal');
  return `'${value.replaceAll("'", "''")}'`;
}

export function ensurePrivateFile(filePath) {
  const stat = statSync(filePath);
  if (!stat.isFile()) throw new Error('Snapshot input must be a regular file');
  if ((stat.mode & 0o077) !== 0) throw new Error('Snapshot input permissions must be owner-only');
  return stat;
}

export function ensurePrivateOutputDirectory(directoryPath, { repoRoot = process.cwd() } = {}) {
  const resolved = path.resolve(directoryPath);
  const root = path.resolve(repoRoot);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Sensitive cutover output must be outside the repository');
  }
  const parent = path.dirname(resolved);
  const parentStat = statSync(parent);
  if (!parentStat.isDirectory()) throw new Error('Cutover output parent must be a directory');
  const directoryStat = (() => {
    try {
      return statSync(resolved);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return null;
    }
  })();
  if (directoryStat && (!directoryStat.isDirectory() || (directoryStat.mode & 0o077) !== 0)) {
    throw new Error('Existing cutover output directory must be a private directory');
  }
  if (!directoryStat) {
    mkdirSync(resolved, { mode: PRIVATE_DIR_MODE });
    chmodSync(resolved, PRIVATE_DIR_MODE);
  }
  return resolved;
}

export function createPrivateTempDirectory(prefix = 'dydata-cutover-') {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  chmodSync(directory, PRIVATE_DIR_MODE);
  return directory;
}

export function removePrivateTempDirectory(directoryPath) {
  rmSync(directoryPath, { recursive: true, force: true });
}

export function writePrivateFile(filePath, content) {
  writeFileSync(filePath, content, { mode: PRIVATE_MODE, flag: 'wx' });
  chmodSync(filePath, PRIVATE_MODE);
}

export function sha256File(filePath) {
  const digest = createHash('sha256');
  const content = readFileSync(filePath);
  digest.update(content);
  return { sha256: digest.digest('hex'), bytes: content.byteLength };
}

export function parsePostgresUrl(connectionUrl) {
  let url;
  try {
    url = new URL(connectionUrl);
  } catch {
    throw new Error('Database URL must use a PostgreSQL URL format');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Database URL must use a PostgreSQL URL format');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || !url.hostname) throw new Error('Database URL must specify a host and database');
  const env = {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: database,
    PGAPPNAME: 'dydata-cutover-rehearsal',
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) env.PGSSLMODE = sslMode;
  const sslRootCert = url.searchParams.get('sslrootcert');
  if (sslRootCert) env.PGSSLROOTCERT = sslRootCert;
  const connectTimeout = url.searchParams.get('connect_timeout');
  if (connectTimeout) env.PGCONNECT_TIMEOUT = connectTimeout;
  return { host: url.hostname, database, env };
}

export function assertLoopbackRehearsalUrl(connectionUrl, { rehearsal = false } = {}) {
  if (!rehearsal) throw new Error('Database writes require the explicit --rehearsal marker');
  const parsed = parsePostgresUrl(connectionUrl);
  const host = parsed.host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Cutover rehearsal writes are restricted to loopback PostgreSQL');
  }
  if (!parsed.database.startsWith('cutover_rehearsal_')) {
    throw new Error('Rehearsal database name must start with cutover_rehearsal_');
  }
  return parsed;
}

export function findPostgresTool(name) {
  const candidates = [
    `/opt/homebrew/Cellar/libpq/18.3/bin/${name}`,
    `/opt/homebrew/opt/libpq/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    name,
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status === 0) return candidate;
  }
  throw new Error(`Required PostgreSQL tool is unavailable: ${name}`);
}

export function runPsql(connectionUrl, sql, { psql = findPostgresTool('psql'), timeout = 1_200_000 } = {}) {
  const parsed = parsePostgresUrl(connectionUrl);
  const result = spawnSync(psql, ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse'], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, ...parsed.env },
    timeout,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    const privateDiagnostic = process.env.DYDATA_CUTOVER_PRIVATE_DIAGNOSTIC;
    if (privateDiagnostic && result.stderr) {
      appendFileSync(privateDiagnostic, result.stderr, { mode: PRIVATE_MODE });
      chmodSync(privateDiagnostic, PRIVATE_MODE);
    }
    throw new Error(`Local PostgreSQL operation failed (exit ${result.status ?? 'unknown'}); SQL and row values were suppressed`);
  }
  return result.stdout.trim();
}

// Statement-at-a-time stdin transport is unusable for the freeze batch: psql
// waits for each statement's result before sending the next, so a ~1200-statement
// package costs one network round trip per statement (the 2026-11-02 23:17
// source-freeze timeout). This transport sends the exact same SQL bytes as a
// single simple-query protocol message: one round trip, one implicit round of
// server-side execution, and BEGIN/COMMIT inside the string still bound the
// whole batch into one transaction. Keep the SQL text identical so package
// SHA bindings stay valid.
export function pgClientOptions(connectionUrl, { timeoutMs = 65_000 } = {}) {
  let url;
  try {
    url = new URL(connectionUrl);
  } catch {
    throw new Error('Database URL must use a PostgreSQL URL format');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Database URL must use a PostgreSQL URL format');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || !url.hostname) throw new Error('Database URL must specify a host and database');
  const options = {
    host: url.hostname,
    port: url.port || '5432',
    database,
    connectionTimeoutMillis: 10_000,
    query_timeout: timeoutMs,
  };
  if (url.username) options.user = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode === 'require') options.ssl = { rejectUnauthorized: false };
  else if (sslMode && !['disable', 'prefer'].includes(sslMode)) throw new Error('Unsupported sslmode for the single-message transport');
  return options;
}

export async function runPsqlSingleMessage(connectionUrl, sql, { timeoutMs = 65_000, createClient, onNotice } = {}) {
  if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('Single-message transport requires non-empty SQL');
  const client = createClient
    ? createClient(connectionUrl, { timeoutMs })
    : new PgClient(pgClientOptions(connectionUrl, { timeoutMs }));
  if (typeof onNotice === 'function') client.on('notice', onNotice);
  const timing = { connectMs: null, queryMs: null };
  const started = Date.now();
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => {});
    throw new Error('Single-message transport could not connect; connection details were suppressed');
  }
  timing.connectMs = Date.now() - started;
  let failure = null;
  let results = null;
  const queryStarted = Date.now();
  try {
    results = await client.query(sql);
  } catch (error) {
    failure = error;
  }
  timing.queryMs = Date.now() - queryStarted;
  let rolledBack = false;
  if (failure) {
    try {
      await client.query('ROLLBACK;');
      rolledBack = true;
    } catch {
      rolledBack = false;
    }
  }
  await client.end().catch(() => {});
  if (failure) {
    const reason = typeof failure.message === 'string' && failure.message ? ` Last server message: ${failure.message.slice(0, 200)}` : '';
    throw new Error(
      `Single-message batch failed after ${timing.queryMs}ms; `
      + (rolledBack
        ? 'transaction rolled back on the same connection.'
        : 'connection lost mid-batch, the server rolls back on disconnect and an independent readback must confirm it.')
      + reason,
    );
  }
  const list = Array.isArray(results) ? results : [results];
  if (list.length < 1) throw new Error('Single-message transport returned no statement results');
  return {
    statementResults: list.length,
    lastCommand: list[list.length - 1]?.command ?? null,
    rowSets: list.map((result) => (Array.isArray(result?.rows) ? result.rows : [])),
    timing,
    roundTrips: 1,
    totalMs: Date.now() - started,
  };
}

export function runPgRestoreToFile(archivePath, outputPath, args = []) {
  ensurePrivateFile(archivePath);
  const pgRestore = findPostgresTool('pg_restore');
  const result = spawnSync(pgRestore, [
    '--no-owner', '--no-acl', '--exit-on-error', '--file', outputPath, ...args, archivePath,
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], timeout: 1_200_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read the PostgreSQL archive (exit ${result.status ?? 'unknown'}); archive contents were suppressed`);
  }
  chmodSync(outputPath, PRIVATE_MODE);
}

export function loadDataArchive(archivePath, { tempDirectory = createPrivateTempDirectory() } = {}) {
  const dataPath = path.join(tempDirectory, 'public-data-only.sql');
  try {
    runPgRestoreToFile(archivePath, dataPath, ['--data-only', '--schema=public']);
    const parsed = copyDumpToStatements(readFileSync(dataPath, 'utf8'));
    if (parsed.tables.length === 0) throw new Error('Archive contains no public table data entries');
    return { parsed, dataPath, tempDirectory };
  } catch (error) {
    removePrivateTempDirectory(tempDirectory);
    throw error;
  }
}

export function tableMap(parsed) {
  if (!parsed || !Array.isArray(parsed.tables) || !Array.isArray(parsed.statements)) {
    throw new TypeError('Parsed archive must contain tables and statements');
  }
  const byName = new Map();
  for (const table of parsed.tables) {
    if (byName.has(table.name)) throw new Error(`Archive has duplicate COPY metadata for ${table.name}`);
    byName.set(table.name, { ...table, statements: [] });
  }
  for (const statement of parsed.statements) {
    const match = /^INSERT\s+INTO\s+public\."((?:[^"]|"")+)"/i.exec(statement);
    if (!match) throw new Error('Converted COPY row has an unexpected insert target');
    const name = match[1].replaceAll('""', '"');
    const table = byName.get(name);
    if (!table) throw new Error(`Converted COPY row has no table metadata: ${name}`);
    table.statements.push(statement);
  }
  return byName;
}

export function enrichWithTargetColumns(parsed, targetTables) {
  const targetByName = new Map(targetTables.map((table) => [table.name, table]));
  const sourceByName = tableMap(parsed);
  const tables = parsed.tables.map((source) => {
    const target = targetByName.get(source.name);
    if (!target) throw new Error(`Target is missing public table ${source.name}`);
    const generatedColumns = target.columns.filter((column) => column.generated).map((column) => column.name);
    const typeColumns = target.columns.map((column) => column.name);
    const copyColumns = typeColumns.filter((column) => !generatedColumns.includes(column));
    if (copyColumns.length !== source.columns.length
      || copyColumns.some((column, index) => column !== source.columns[index])) {
      throw new Error(`Target public table shape differs from archive for ${source.name}`);
    }
    if (sourceByName.get(source.name).statements.length !== source.rowCount) {
      throw new Error(`Archive row count differs for ${source.name}`);
    }
    return { ...source, typeColumns, generatedColumns };
  });
  return { ...parsed, tables };
}

export function computeSnapshotDelta(baselineParsed, latestParsed) {
  const baseline = tableMap(baselineParsed);
  const latest = tableMap(latestParsed);
  const names = [...baseline.keys()].sort();
  if (names.length !== latest.size || names.some((name) => !latest.has(name))) {
    throw new Error('Baseline and latest archives contain different public table inventories');
  }

  return names.map((name) => {
    const before = baseline.get(name);
    const after = latest.get(name);
    if (before.columns.length !== after.columns.length
      || before.columns.some((column, index) => column !== after.columns[index])) {
      throw new Error(`Baseline and latest COPY columns differ for ${name}`);
    }
    const oldCounts = new Map();
    for (const statement of before.statements) oldCounts.set(statement, (oldCounts.get(statement) ?? 0) + 1);
    const newCounts = new Map();
    for (const statement of after.statements) newCounts.set(statement, (newCounts.get(statement) ?? 0) + 1);
    let addedRows = 0;
    let removedRows = 0;
    for (const [statement, count] of newCounts) addedRows += Math.max(0, count - (oldCounts.get(statement) ?? 0));
    for (const [statement, count] of oldCounts) removedRows += Math.max(0, count - (newCounts.get(statement) ?? 0));
    return { name, baselineRows: before.rowCount, latestRows: after.rowCount, addedRows, removedRows };
  });
}

export function buildExpectedMetricsSql(parsed) {
  const expectedQueries = buildExpectedQueries({ parsed });
  const byName = new Map(parsed.tables.map((table) => [table.name, []]));
  for (const query of expectedQueries) {
    const match = /FROM \(VALUES/.exec(query);
    if (!match) throw new Error('Unexpected archive reconciliation query');
    const tableName = parsed.tables.find((table) => query.includes(`::public.${quoteIdentifier(table.name)}`))?.name;
    if (!tableName) throw new Error('Could not map reconciliation query to a table');
    byName.get(tableName).push(query.replace(/;\s*$/, ''));
  }

  const chunks = [];
  for (const table of parsed.tables) {
    const queries = byName.get(table.name);
    if (queries.length === 0) {
      chunks.push(`SELECT ${quoteLiteral(table.name)}::text AS table_name, 0::numeric AS n, 0::numeric AS h1, 0::numeric AS h2`);
      continue;
    }
    for (const query of queries) {
      chunks.push(`SELECT ${quoteLiteral(table.name)}::text AS table_name, q.n::numeric AS n, q.h1::numeric AS h1, q.h2::numeric AS h2 FROM (${query}) AS q`);
    }
  }

  return `WITH chunks AS (\n${chunks.join('\nUNION ALL\n')}\n), totals AS (\n  SELECT table_name, sum(n) AS n, sum(h1) AS h1, sum(h2) AS h2 FROM chunks GROUP BY table_name\n)\nSELECT coalesce(jsonb_object_agg(table_name, jsonb_build_object('count', n::text, 'h1', h1::text, 'h2', h2::text)), '{}'::jsonb)::text FROM totals;`;
}

export function buildActualMetricsSql(parsed) {
  const rows = parsed.tables.map((table) => {
    const query = buildActualQuery(table).replace(/;\s*$/, '');
    return `SELECT ${quoteLiteral(table.name)}::text AS table_name, n::numeric AS n, h1::numeric AS h1, h2::numeric AS h2 FROM (${query}) AS q`;
  });
  return `WITH actual AS (\n${rows.join('\nUNION ALL\n')}\n)\nSELECT coalesce(jsonb_object_agg(table_name, jsonb_build_object('count', n::text, 'h1', h1::text, 'h2', h2::text)), '{}'::jsonb)::text FROM actual;`;
}

export function parseMetrics(value, context) {
  let metrics;
  try {
    metrics = JSON.parse(value);
  } catch {
    throw new Error(`${context} returned invalid aggregate metadata`);
  }
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error(`${context} returned invalid aggregate metadata`);
  for (const row of Object.values(metrics)) {
    if (!row || !['count', 'h1', 'h2'].every((key) => typeof row[key] === 'string' && /^-?\d+$/.test(row[key]))) {
      throw new Error(`${context} returned invalid aggregate values`);
    }
  }
  return metrics;
}

export function compareMetrics(expected, actual, tableNames) {
  const results = tableNames.map((name) => {
    const source = expected[name];
    const target = actual[name];
    const countMatches = Boolean(source && target && source.count === target.count);
    const hashesMatch = Boolean(source && target && source.h1 === target.h1 && source.h2 === target.h2);
    return { name, expected: source ?? null, actual: target ?? null, countMatches, hashesMatch, matches: countMatches && hashesMatch };
  });
  return { ok: results.every((table) => table.matches) && Object.keys(actual).length === tableNames.length, tables: results };
}

export function buildSnapshotAssertionSql(expected, tables, label) {
  const body = tables.map((table) => {
    const { name } = table;
    const metric = expected[name];
    if (!metric) throw new Error(`Missing ${label} metrics for ${name}`);
    const actual = buildActualQuery(table).replace(/;\s*$/, '');
    // These guards repeat three times per table in the atomic request. Keep the
    // full comparison and diagnostic while avoiding transport-only formatting.
    return `IF (SELECT ROW(n::numeric,h1::numeric,h2::numeric) FROM (${actual}) a) IS DISTINCT FROM ROW(${BigInt(metric.count)}::numeric,${BigInt(metric.h1)}::numeric,${BigInt(metric.h2)}::numeric) THEN RAISE EXCEPTION 'cutover ${label} reconciliation failed for table %',${quoteLiteral(name)}; END IF;`;
  }).join('\n');
  const dollarTag = label.replace(/[^a-z0-9_]/gi, '_');
  return `DO $cutover_${dollarTag}$\nBEGIN\n${body}\nEND;\n$cutover_${dollarTag}$;`;
}

export function buildRefreshSql(parsed, baselineMetrics, latestMetrics, { lock = true } = {}) {
  const names = parsed.tables.map((table) => table.name);
  const tableList = names.map((name) => `public.${quoteIdentifier(name)}`).join(', ');
  const statements = [
    'BEGIN;',
    "SELECT pg_advisory_xact_lock(hashtext('dydata.cloudbase.cutover.rehearsal'));",
  ];
  if (lock) statements.push(`LOCK TABLE ${tableList} IN ACCESS EXCLUSIVE MODE;`);
  statements.push(buildSnapshotAssertionSql(baselineMetrics, parsed.tables, 'baseline'));
  statements.push('SET LOCAL session_replication_role = replica;');
  statements.push(`TRUNCATE TABLE ${tableList};`);
  statements.push(parsed.statements.join('\n'));
  statements.push(buildSnapshotAssertionSql(latestMetrics, parsed.tables, 'latest'));
  statements.push(parsed.sequenceStatements.join('\n'));
  statements.push('COMMIT;');
  return `${statements.join('\n')}\n`;
}

export function buildEmptyTargetAssertion(parsed) {
  const checks = parsed.tables.map((table) => {
    const actual = buildActualQuery(table).replace(/;\s*$/, '');
    return `  IF (SELECT n::numeric FROM (${actual}) AS actual) <> 0 THEN\n    RAISE EXCEPTION 'cutover target is not empty for table %', ${quoteLiteral(table.name)};\n  END IF;`;
  }).join('\n');
  return `DO $cutover_empty$\nBEGIN\n${checks}\nEND;\n$cutover_empty$;`;
}

export function totalRows(parsed) {
  return parsed.tables.reduce((sum, table) => sum + BigInt(table.rowCount), 0n).toString();
}

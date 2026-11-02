#!/usr/bin/env node

import path from 'node:path';
import {
  assertLoopbackRehearsalUrl,
  buildActualMetricsSql,
  buildExpectedMetricsSql,
  buildRefreshSql,
  compareMetrics,
  computeSnapshotDelta,
  ensurePrivateFile,
  ensurePrivateOutputDirectory,
  enrichWithTargetColumns,
  loadDataArchive,
  parseMetrics,
  removePrivateTempDirectory,
  runPsql,
  sha256File,
  tableMap,
  totalRows,
  writePrivateFile,
} from './cutover-core.mjs';

const HELP = `DYData cutover snapshot tools

Usage:
  node scripts/cloudbase/cutover-sync.mjs plan --baseline FILE --latest FILE --output FILE
  node scripts/cloudbase/cutover-sync.mjs apply --baseline FILE --latest FILE --target-url URL --rehearsal --evidence-out FILE

plan summarizes row additions, changes and removals without printing row values.
apply can write only to a loopback database named cutover_rehearsal_* and requires --rehearsal.
It refreshes public table rows and sequence values only. It does not restore schema, functions,
policies, grants, ACLs, auth.users, storage.objects, or other managed schemas.
Snapshot and evidence files must be private (owner-only) and outside the repository.
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = new Map();
  const flags = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith('--')) throw new Error('Unexpected positional argument');
    if (item === '--rehearsal') {
      flags.add(item);
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}`);
    options.set(item, value);
    index += 1;
  }
  return { command, options, flags };
}

function required(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`Missing required option ${name}`);
  return value;
}

function loadArchive(archivePath) {
  ensurePrivateFile(archivePath);
  const { parsed, tempDirectory } = loadDataArchive(archivePath);
  return { path: path.resolve(archivePath), parsed, tempDirectory, file: sha256File(archivePath) };
}

function assertSameArchiveShape(baseline, latest) {
  const before = tableMap(baseline);
  const after = tableMap(latest);
  if (before.size !== after.size) throw new Error('Baseline and latest archives contain different public table inventories');
  for (const [name, table] of before) {
    const candidate = after.get(name);
    if (!candidate || table.columns.length !== candidate.columns.length
      || table.columns.some((column, index) => column !== candidate.columns[index])) {
      throw new Error(`Baseline and latest archive shapes differ for ${name}`);
    }
  }
}

export function buildTargetMetadataQuery(tableNames) {
  if (!Array.isArray(tableNames) || tableNames.length === 0) throw new TypeError('tableNames must be a non-empty array');
  const names = tableNames.map((name) => `'${String(name).replaceAll("'", "''")}'`).join(', ');
  return `SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'columns', columns) ORDER BY name), '[]'::jsonb)::text FROM (SELECT c.relname AS name, jsonb_agg(jsonb_build_object('name', a.attname, 'generated', a.attgenerated <> '') ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped AND c.relname IN (${names}) GROUP BY c.oid) AS target;`;
}

export function parseTargetMetadata(value) {
  let result;
  try {
    result = JSON.parse(value);
  } catch {
    throw new Error('Target schema query returned invalid metadata');
  }
  if (!Array.isArray(result)) throw new Error('Target schema query returned invalid metadata');
  return result.map((table) => {
    if (!table || typeof table.name !== 'string' || !Array.isArray(table.columns)) throw new Error('Target schema query returned invalid table metadata');
    return {
      name: table.name,
      columns: table.columns.map((column) => {
        if (!column || typeof column.name !== 'string' || typeof column.generated !== 'boolean') {
          throw new Error('Target schema query returned invalid column metadata');
        }
        return { name: column.name, generated: column.generated };
      }),
    };
  });
}

async function getMetrics(connectionUrl, parsed) {
  const expectedSql = buildExpectedMetricsSql(parsed);
  const actualSql = buildActualMetricsSql(parsed);
  const expected = parseMetrics(runPsql(connectionUrl, expectedSql), 'Archive reconciliation');
  const actual = parseMetrics(runPsql(connectionUrl, actualSql), 'Target reconciliation');
  const compared = compareMetrics(expected, actual, parsed.tables.map((table) => table.name));
  return { expected, actual, compared };
}

function summarizeDelta(delta) {
  const changed = delta.filter((table) => table.addedRows > 0 || table.removedRows > 0);
  return {
    tableCount: delta.length,
    changedTableCount: changed.length,
    addedRows: delta.reduce((sum, table) => sum + table.addedRows, 0),
    removedRows: delta.reduce((sum, table) => sum + table.removedRows, 0),
    tables: delta,
  };
}

function writeEvidence(evidencePath, evidence) {
  const resolved = path.resolve(evidencePath);
  ensurePrivateOutputDirectory(path.dirname(resolved));
  writePrivateFile(resolved, `${JSON.stringify(evidence, null, 2)}\n`);
}

export async function createCutoverPlan({ baselineArchive, latestArchive }) {
  const baseline = loadArchive(baselineArchive);
  const latest = loadArchive(latestArchive);
  try {
    assertSameArchiveShape(baseline.parsed, latest.parsed);
    const delta = summarizeDelta(computeSnapshotDelta(baseline.parsed, latest.parsed));
    return {
      format: 'dydata-cloudbase-cutover-plan-v1',
      generatedAt: new Date().toISOString(),
      sourceScope: 'public business schema data; auth and storage system schemas excluded',
      targetWriteScope: 'public table rows and sequence values only; no DDL or ACL restore',
      baseline: { sha256: baseline.file.sha256, bytes: baseline.file.bytes, totalRows: totalRows(baseline.parsed) },
      latest: { sha256: latest.file.sha256, bytes: latest.file.bytes, totalRows: totalRows(latest.parsed) },
      delta,
    };
  } finally {
    removePrivateTempDirectory(baseline.tempDirectory);
    removePrivateTempDirectory(latest.tempDirectory);
  }
}

async function readTargetMetadata(targetUrl, tableNames) {
  const output = runPsql(targetUrl, buildTargetMetadataQuery(tableNames));
  const metadata = parseTargetMetadata(output);
  if (metadata.length !== tableNames.length) throw new Error('Target is missing one or more source public tables');
  return metadata;
}

function buildExternalForeignKeyQuery(tableNames) {
  const names = tableNames.map((name) => `'${name.replaceAll("'", "''")}'`).join(', ');
  return `SELECT count(*)::text FROM pg_constraint fk JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace WHERE fk.contype='f' AND parent_ns.nspname='public' AND parent.relname IN (${names}) AND NOT (child_ns.nspname='public' AND child.relname IN (${names}));`;
}

export async function applyCutoverSnapshot({ baselineArchive, latestArchive, targetUrl, rehearsal = false, evidenceOut }) {
  const target = assertLoopbackRehearsalUrl(targetUrl, { rehearsal });
  const baseline = loadArchive(baselineArchive);
  const latest = loadArchive(latestArchive);
  try {
    assertSameArchiveShape(baseline.parsed, latest.parsed);
    const sourceNames = latest.parsed.tables.map((table) => table.name);
    const targetMetadata = await readTargetMetadata(targetUrl, sourceNames);
    const baselineParsed = {
      ...baseline.parsed,
      tables: baseline.parsed.tables.map((table) => ({ ...table })),
    };
    const latestParsed = {
      ...latest.parsed,
      tables: latest.parsed.tables.map((table) => ({ ...table })),
    };
    const baselineTarget = enrichWithTargetColumns(baselineParsed, targetMetadata);
    const latestTarget = enrichWithTargetColumns(latestParsed, targetMetadata);

    const externalFks = runPsql(targetUrl, buildExternalForeignKeyQuery(sourceNames));
    if (!/^\d+$/.test(externalFks) || BigInt(externalFks) !== 0n) {
      throw new Error('Target has foreign keys from non-snapshot objects into source public tables; no rows were changed');
    }

    const before = await getMetrics(targetUrl, baselineTarget);
    const after = await getMetrics(targetUrl, latestTarget);
    const sha = {
      baseline: baseline.file.sha256,
      latest: latest.file.sha256,
    };
    const delta = summarizeDelta(computeSnapshotDelta(baseline.parsed, latest.parsed));
    let status;
    if (after.compared.ok) {
      status = 'already-current';
    } else if (before.compared.ok) {
      const sql = buildRefreshSql(latestTarget, before.expected, after.expected);
      runPsql(targetUrl, sql, { timeout: 1_800_000 });
      const verified = await getMetrics(targetUrl, latestTarget);
      if (!verified.compared.ok) throw new Error('Post-sync verification failed; inspect the private transaction result before retrying');
      status = 'applied';
    } else {
      throw new Error('Target matches neither the baseline nor latest archive; no data was changed');
    }

    const final = status === 'applied' ? await getMetrics(targetUrl, latestTarget) : after;
    if (!final.compared.ok) throw new Error('Final per-table reconciliation failed');
    const evidence = {
      format: 'dydata-cloudbase-cutover-evidence-v1',
      generatedAt: new Date().toISOString(),
      status,
      rehearsal: true,
      targetHost: target.host,
      targetDatabase: target.database,
      sourceScope: 'public business tables from the selected custom-format archives',
      targetWriteScope: 'transactional TRUNCATE and data-only INSERT/sequence values; session_replication_role=replica applies only within this local transaction; no target schema, functions, policies, ACLs, Auth, or Storage writes',
      permissionsModifiedByTool: false,
      snapshots: sha,
      delta,
      tableCount: final.compared.tables.length,
      matchingTables: final.compared.tables.filter((table) => table.matches).length,
      totalExpectedRows: totalRows(latest.parsed),
      reconciliation: final.compared.tables,
    };
    if (evidenceOut) writeEvidence(evidenceOut, evidence);
    return evidence;
  } finally {
    removePrivateTempDirectory(baseline.tempDirectory);
    removePrivateTempDirectory(latest.tempDirectory);
  }
}

async function main() {
  const { command, options, flags } = parseArgs(process.argv.slice(2));
  if (command === '--help' || command === '-h' || !command) {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'plan') {
    const plan = await createCutoverPlan({
      baselineArchive: required(options, '--baseline'),
      latestArchive: required(options, '--latest'),
    });
    const outputPath = path.resolve(required(options, '--output'));
    ensurePrivateOutputDirectory(path.dirname(outputPath));
    writePrivateFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
    process.stdout.write(JSON.stringify({ status: 'prepared', tables: plan.delta.tableCount, changedTables: plan.delta.changedTableCount, addedRows: plan.delta.addedRows, removedRows: plan.delta.removedRows, manifest: path.basename(outputPath) }) + '\n');
    return;
  }
  if (command === 'apply') {
    const evidence = await applyCutoverSnapshot({
      baselineArchive: required(options, '--baseline'),
      latestArchive: required(options, '--latest'),
      targetUrl: required(options, '--target-url'),
      rehearsal: flags.has('--rehearsal'),
      evidenceOut: options.get('--evidence-out'),
    });
    process.stdout.write(JSON.stringify({ status: evidence.status, tables: evidence.tableCount, matched: evidence.matchingTables, rows: evidence.totalExpectedRows, changedTables: evidence.delta.changedTableCount }) + '\n');
    return;
  }
  throw new Error('Unknown command; use --help');
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

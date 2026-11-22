#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, createWriteStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { finished } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';
import {
  assertValidSchemaName,
  AUTH_SKIP_REASONS,
  CATALOG_INVENTORY_SQL,
  createCloudBaseReadOnlyExecutor,
  DEFAULT_AUTH_TABLES,
  DEFAULT_EXPORT_ROOT,
  ensurePrivateDirTree,
  formatShanghaiFolderName,
  parsePgRows,
  qualifiedName,
  quoteIdentifier,
  quoteLiteral,
} from './db-backup-core.mjs';
import { parseSingleJsonResult } from './db-backup-core.mjs';
import { PRIVATE_MODE } from './db-backup-core.mjs';

const DEFAULT_PAGE_SIZE = 500;
const MIN_ADAPTIVE_PAGE_SIZE = 10;
const TARGET_PAGE_BYTES = 1_500_000;

const HELP = `CloudBase 正式库只读一键导出

用法:
  node scripts/cloudbase/db-export.mjs [--schemas s1,s2] [--output-dir DIR] [--page-size N]

默认:
  - 只读导出 public 全表 + auth 核心认证表 (${DEFAULT_AUTH_TABLES.join(', ')})
  - 输出到仓库外 ~/.local/share/dydata/db-export/YYYY-MM-DD-HHMM/ (权限 700/600)
`;

/** Parse CLI arguments for db-export.mjs. */
export function parseExportArgs(argv) {
  const extraSchemas = [];
  let outputDir = null;
  let pageSize = DEFAULT_PAGE_SIZE;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--schemas' || arg.startsWith('--schemas=')) {
      const raw = arg.includes('=') ? arg.slice('--schemas='.length) : argv[++i];
      if (!raw) throw new Error('--schemas 需要至少一个 schema 名称');
      for (const item of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        extraSchemas.push(assertValidSchemaName(item));
      }
      continue;
    }
    if (arg === '--output-dir' || arg.startsWith('--output-dir=')) {
      outputDir = arg.includes('=') ? arg.slice('--output-dir='.length) : argv[++i];
      if (!outputDir) throw new Error('--output-dir 不能为空');
      continue;
    }
    if (arg === '--page-size' || arg.startsWith('--page-size=')) {
      const raw = arg.includes('=') ? arg.slice('--page-size='.length) : argv[++i];
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < MIN_ADAPTIVE_PAGE_SIZE || parsed > 5000) {
        throw new Error(`--page-size 必须是 ${MIN_ADAPTIVE_PAGE_SIZE}..5000 的整数`);
      }
      pageSize = parsed;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { help, extraSchemas: [...new Set(extraSchemas)], outputDir, pageSize };
}

/** Plan which tables to export and which objects/schemas are intentionally skipped. */
export function planExportTargets(inventory, { extraSchemas = [], authTables = DEFAULT_AUTH_TABLES } = {}) {
  const availableSchemas = new Set(inventory.schemas ?? []);
  for (const schema of extraSchemas) {
    if (!availableSchemas.has(schema)) {
      throw new Error(`指定的 schema 不存在: ${schema}`);
    }
  }
  const fullSchemas = new Set(['public', ...extraSchemas]);
  const authSet = new Set(authTables);
  const selected = [];
  const skipped = [];

  for (const rel of inventory.relations ?? []) {
    const isTable = rel.kind === 'r' || rel.kind === 'p';
    if (fullSchemas.has(rel.schema)) {
      if (isTable) {
        selected.push(rel);
      } else {
        skipped.push({ schema: rel.schema, name: rel.table, kind: rel.kind, reason: 'non-table-relation' });
      }
      continue;
    }
    if (rel.schema === 'auth') {
      if (isTable && authSet.has(rel.table)) {
        selected.push(rel);
      } else {
        skipped.push({
          schema: 'auth',
          name: rel.table,
          kind: rel.kind,
          reason: isTable ? (AUTH_SKIP_REASONS[rel.table] ?? 'non-login-auth-table') : 'non-table-relation',
        });
      }
    }
  }

  for (const schema of inventory.schemas ?? []) {
    if (!fullSchemas.has(schema) && schema !== 'auth') {
      const count = (inventory.relations ?? []).filter((r) => r.schema === schema).length;
      skipped.push({ schema, name: '*', kind: 'schema', tableCount: count, reason: 'schema-not-selected' });
    }
  }

  if (!selected.some((t) => t.schema === 'auth' && t.table === 'users')) {
    throw new Error('正式库缺少必需的认证核心表 auth.users');
  }

  return { selected, skipped };
}

/** Build keyset-paginated read-only SELECT query for a table page. */
export function buildKeysetPageQuery(tableMeta, cursor, limit) {
  const target = qualifiedName(tableMeta.schema, tableMeta.table);
  const pk = Array.isArray(tableMeta.primaryKey) && tableMeta.primaryKey.length > 0 ? tableMeta.primaryKey : null;

  if (!pk) {
    if (tableMeta.kind === 'p') {
      throw new Error(`分区表 ${tableMeta.schema}.${tableMeta.table} 缺少主键，无法安全分段拉取`);
    }
    const whereClause = cursor ? ` WHERE t.ctid > ${quoteLiteral(cursor[0])}::tid` : '';
    return {
      pagination: 'ctid',
      sql: `SELECT to_jsonb(t)::text AS row_json, t.ctid::text AS c0 FROM ${target} AS t${whereClause} ORDER BY t.ctid ASC LIMIT ${limit};`,
    };
  }

  const cursorSelects = pk.map((col, idx) => `t.${quoteIdentifier(col.name)}::text AS c${idx}`).join(', ');
  const orderCols = pk.map((col) => `t.${quoteIdentifier(col.name)} ASC`).join(', ');
  let whereClause = '';
  if (cursor) {
    if (pk.length === 1) {
      whereClause = ` WHERE t.${quoteIdentifier(pk[0].name)} > ${quoteLiteral(cursor[0])}::${pk[0].formatType}`;
    } else {
      const lhs = pk.map((col) => `t.${quoteIdentifier(col.name)}`).join(', ');
      const rhs = pk.map((col, idx) => `${quoteLiteral(cursor[idx])}::${col.formatType}`).join(', ');
      whereClause = ` WHERE (${lhs}) > (${rhs})`;
    }
  }

  return {
    pagination: pk.length === 1 ? `pk:${pk[0].name}` : `pk:(${pk.map((c) => c.name).join(',')})`,
    sql: `SELECT to_jsonb(t)::text AS row_json, ${cursorSelects} FROM ${target} AS t${whereClause} ORDER BY ${orderCols} LIMIT ${limit};`,
  };
}

function estimateInitialPageSize(tableMeta, maxPageSize) {
  if (tableMeta.estRows > 0 && tableMeta.bytes > 0) {
    const avgBytes = tableMeta.bytes / tableMeta.estRows;
    const estimated = Math.floor(TARGET_PAGE_BYTES / Math.max(avgBytes, 1));
    return Math.max(MIN_ADAPTIVE_PAGE_SIZE, Math.min(maxPageSize, estimated));
  }
  return maxPageSize;
}

async function openGzipWriter(filePath) {
  const gzip = createGzip({ level: 6 });
  const fileStream = createWriteStream(filePath, { mode: PRIVATE_MODE });
  gzip.pipe(fileStream);
  let rawBytes = 0;

  const writeLine = async (line) => {
    const chunk = `${line}\n`;
    rawBytes += Buffer.byteLength(chunk, 'utf8');
    if (!gzip.write(chunk)) {
      await new Promise((resolve) => gzip.once('drain', resolve));
    }
  };

  const close = async () => {
    gzip.end();
    await finished(fileStream);
    chmodSync(filePath, PRIVATE_MODE);
    const content = readFileSync(filePath);
    return {
      rawBytes,
      compressedBytes: statSync(filePath).size,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  };

  return { writeLine, close };
}

async function exportSingleTable(tableMeta, tablesDir, executeReadOnly, maxPageSize) {
  const relFile = path.join('tables', `${tableMeta.schema}.${tableMeta.table}.jsonl.gz`);
  const absFile = path.join(path.dirname(tablesDir), relFile);
  const countSql = `SELECT count(*)::text AS cnt FROM ${qualifiedName(tableMeta.schema, tableMeta.table)};`;
  const countRows = parsePgRows(await executeReadOnly(countSql));
  const dbCount = Number(countRows[0]?.[0] ?? 0);

  const writer = await openGzipWriter(absFile);
  let cursor = null;
  let pages = 0;
  let rowCount = 0;
  let pagination = 'none';
  let currentLimit = estimateInitialPageSize(tableMeta, maxPageSize);

  try {
    while (true) {
      let query;
      let rows;
      while (true) {
        query = buildKeysetPageQuery(tableMeta, cursor, currentLimit);
        pagination = query.pagination;
        try {
          rows = parsePgRows(await executeReadOnly(query.sql));
          break;
        } catch (err) {
          if (currentLimit <= MIN_ADAPTIVE_PAGE_SIZE) throw err;
          currentLimit = Math.max(MIN_ADAPTIVE_PAGE_SIZE, Math.floor(currentLimit / 2));
        }
      }

      if (rows.length === 0) break;
      pages += 1;
      for (const tuple of rows) {
        await writer.writeLine(tuple[0]);
        rowCount += 1;
      }
      const last = rows[rows.length - 1];
      cursor = last.slice(1);
      if (rows.length < currentLimit) break;
    }

    const fileStats = await writer.close();
    return {
      schema: tableMeta.schema,
      table: tableMeta.table,
      file: relFile,
      rowCount,
      dbCount,
      rawBytes: fileStats.rawBytes,
      compressedBytes: fileStats.compressedBytes,
      sha256: fileStats.sha256,
      pages,
      pagination,
      status: 'succeeded',
      error: null,
    };
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}

/**
 * Run a full read-only database export into outputDir and write manifest.json + schema.json.
 * Marks allSucceeded=false and records failedTable + error in manifest.json on any table failure.
 */
export async function exportDatabase({
  executeReadOnly,
  envId = 'unknown',
  repoRoot = process.cwd(),
  outputDir,
  extraSchemas = [],
  pageSize = DEFAULT_PAGE_SIZE,
  now = () => new Date(),
} = {}) {
  const start = now();
  const startedAt = start.toISOString();
  const targetDir = ensurePrivateDirTree(
    outputDir ?? path.join(DEFAULT_EXPORT_ROOT, formatShanghaiFolderName(start)),
    { repoRoot },
  );
  const tablesDir = ensurePrivateDirTree(path.join(targetDir, 'tables'), { repoRoot });

  const tableResults = [];
  let plan = { selected: [], skipped: [] };
  let failedTable = null;
  let failureError = null;

  try {
    const inventory = parseSingleJsonResult(await executeReadOnly(CATALOG_INVENTORY_SQL));
    plan = planExportTargets(inventory, { extraSchemas });

    const schemaPath = path.join(targetDir, 'schema.json');
    writeFileSync(schemaPath, `${JSON.stringify({ capturedAt: startedAt, tables: plan.selected }, null, 2)}\n`, { mode: PRIVATE_MODE });
    chmodSync(schemaPath, PRIVATE_MODE);

    for (const tableMeta of plan.selected) {
      const fqName = `${tableMeta.schema}.${tableMeta.table}`;
      try {
        const entry = await exportSingleTable(tableMeta, tablesDir, executeReadOnly, pageSize);
        tableResults.push(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failedTable = fqName;
        failureError = message;
        tableResults.push({
          schema: tableMeta.schema,
          table: tableMeta.table,
          file: null,
          rowCount: 0,
          dbCount: null,
          rawBytes: 0,
          compressedBytes: 0,
          sha256: null,
          pages: 0,
          pagination: null,
          status: 'failed',
          error: message,
        });
        throw new Error(`表 ${fqName} 导出失败: ${message}`);
      }
    }
  } catch (err) {
    if (!failureError) {
      failureError = err instanceof Error ? err.message : String(err);
    }
    throw err;
  } finally {
    const end = now();
    const manifest = {
      version: 1,
      envId,
      startedAt,
      finishedAt: end.toISOString(),
      durationMs: Math.max(0, end.getTime() - start.getTime()),
      allSucceeded: failureError === null && tableResults.length === plan.selected.length,
      failedTable,
      error: failureError,
      schemas: {
        base: ['public'],
        authTables: DEFAULT_AUTH_TABLES,
        extraSchemas,
      },
      totalTables: plan.selected.length,
      succeededTables: tableResults.filter((t) => t.status === 'succeeded').length,
      totalRows: tableResults.reduce((sum, t) => sum + t.rowCount, 0),
      totalRawBytes: tableResults.reduce((sum, t) => sum + t.rawBytes, 0),
      totalCompressedBytes: tableResults.reduce((sum, t) => sum + t.compressedBytes, 0),
      tables: tableResults,
      skipped: plan.skipped,
    };
    const manifestPath = path.join(targetDir, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: PRIVATE_MODE });
    chmodSync(manifestPath, PRIVATE_MODE);
  }

  const finalManifest = JSON.parse(readFileSync(path.join(targetDir, 'manifest.json'), 'utf8'));
  return { outputDir: targetDir, manifest: finalManifest };
}

async function main() {
  const args = parseExportArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const { envId, executeReadOnly } = await createCloudBaseReadOnlyExecutor();
  const { outputDir, manifest } = await exportDatabase({
    executeReadOnly,
    envId,
    outputDir: args.outputDir,
    extraSchemas: args.extraSchemas,
    pageSize: args.pageSize,
  });
  console.log(JSON.stringify({
    outputDir,
    allSucceeded: manifest.allSucceeded,
    totalTables: manifest.totalTables,
    succeededTables: manifest.succeededTables,
    totalRows: manifest.totalRows,
    totalCompressedBytes: manifest.totalCompressedBytes,
    durationMs: manifest.durationMs,
  }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(`[db-export] 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

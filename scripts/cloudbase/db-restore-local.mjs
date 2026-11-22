#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';
import { Client as PgClient } from 'pg';
import {
  CATALOG_INVENTORY_SQL,
  createCloudBaseReadOnlyExecutor,
  DEFAULT_EXPORT_ROOT,
  qualifiedName,
  quoteIdentifier,
  quoteLiteral,
} from './db-backup-core.mjs';
import { parseSingleJsonResult } from './cutover-cloudbase-driver.mjs';
import {
  buildBatchInsertSql,
  buildRepairStatements,
  compareLocalAndProdSchema,
  describeSchemaMismatches,
  LOCAL_SCHEMA_QUERY,
  readMigrationPlan,
} from './db-restore-schema.mjs';

const DEFAULT_IMAGES = ['public.ecr.aws/supabase/postgres:17.11.0.006', 'postgres:17'];
const RESTORE_DB = 'dydata_restore';
const INSERT_BATCH_ROWS = 200;

const HELP = `本机临时 Postgres 恢复演练脚本

用法:
  node scripts/cloudbase/db-restore-local.mjs [--backup-dir DIR] [--port PORT] [--image IMAGE] [--from-prod-schema] [--keep]

流程:
  1. 校验备份 manifest.json 与所有 .jsonl.gz 文件 sha256
  2. 本机起临时 Docker Postgres，先按 supabase/migrations 建表
  3. 逐条列出迁移结果与正式库的结构差异（缺表/缺列/类型差异）并修补结构
  4. 灌入全部表数据并重置序列
  5. 逐表对比恢复行数与 manifest.json，任一表不一致即退出码非 0
`;

/** Parse CLI arguments for db-restore-local.mjs. */
export function parseRestoreArgs(argv) {
  let backupDir = null;
  let port = null;
  let image = null;
  let keep = false;
  let fromProdSchema = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (arg === '--keep') { keep = true; continue; }
    if (arg === '--from-prod-schema') { fromProdSchema = true; continue; }
    if (arg === '--backup-dir' || arg.startsWith('--backup-dir=')) {
      backupDir = arg.includes('=') ? arg.slice('--backup-dir='.length) : argv[++i];
      if (!backupDir) throw new Error('--backup-dir 不能为空');
      continue;
    }
    if (arg === '--port' || arg.startsWith('--port=')) {
      const raw = arg.includes('=') ? arg.slice('--port='.length) : argv[++i];
      port = Number(raw);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error('--port 必须是 1024..65535 的整数');
      }
      continue;
    }
    if (arg === '--image' || arg.startsWith('--image=')) {
      image = arg.includes('=') ? arg.slice('--image='.length) : argv[++i];
      if (!image) throw new Error('--image 不能为空');
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return { help, backupDir, port, image, keep, fromProdSchema };
}

/** Find newest backup directory under ~/.local/share/dydata/db-export/. */
export function resolveLatestBackupDir(exportRoot = DEFAULT_EXPORT_ROOT) {
  if (!existsSync(exportRoot)) {
    throw new Error(`找不到导出目录: ${exportRoot}`);
  }
  const dirs = readdirSync(exportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(exportRoot, entry.name, 'manifest.json')))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (dirs.length === 0) {
    throw new Error(`导出目录下没有可用的 manifest.json: ${exportRoot}`);
  }
  return path.join(exportRoot, dirs[0]);
}

/** Verify backup manifest completeness and sha256 integrity of every table archive. */
export function loadAndVerifyBackup(backupDir) {
  const resolved = path.resolve(backupDir);
  const manifestPath = path.join(resolved, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`缺少 manifest.json: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.allSucceeded !== true) {
    throw new Error(`备份未全部成功，拒绝恢复（failedTable=${manifest.failedTable ?? 'unknown'}）`);
  }
  if (!Array.isArray(manifest.tables) || manifest.tables.length === 0) {
    throw new Error('manifest.json 中没有任何可恢复的表');
  }
  for (const entry of manifest.tables) {
    if (entry.status !== 'succeeded' || !entry.file) {
      throw new Error(`表 ${entry.schema}.${entry.table} 在备份中状态异常: ${entry.status}`);
    }
    const filePath = path.join(resolved, entry.file);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`缺少表数据文件: ${filePath}`);
    }
    const sha256 = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    if (sha256 !== entry.sha256) {
      throw new Error(`文件校验失败（SHA256 不匹配）: ${entry.file}`);
    }
  }
  const schemaPath = path.join(resolved, 'schema.json');
  const schemaSnapshot = existsSync(schemaPath) ? JSON.parse(readFileSync(schemaPath, 'utf8')) : null;
  return { backupDir: resolved, manifest, schemaSnapshot };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function chooseDockerImage(explicitImage) {
  if (explicitImage) return explicitImage;
  for (const candidate of DEFAULT_IMAGES) {
    try {
      execFileSync('docker', ['image', 'inspect', candidate], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return 'postgres:17';
}

function dockerExecPsql(containerName, database, sql, label, dbUser = 'postgres') {
  try {
    return execFileSync(
      'docker',
      ['exec', '-i', containerName, 'psql', '-U', dbUser, '-d', database, '-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', '-'],
      { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const detail = error?.stderr ? String(error.stderr).trim() : String(error?.message ?? error);
    throw new Error(`${label}失败: ${detail}`);
  }
}

async function waitForPostgres(port, dbUser = 'postgres', timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const client = new PgClient({ host: '127.0.0.1', port, user: dbUser, password: 'postgres', database: 'postgres' });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`临时 Postgres 在 ${timeoutMs}ms 内未就绪 (port=${port})`);
}

async function bootstrapRestoreDatabase(containerName, port, dbUser = 'postgres') {
  const adminClient = new PgClient({ host: '127.0.0.1', port, user: dbUser, password: 'postgres', database: 'postgres' });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE ${RESTORE_DB};`);
    const hasAuth = await adminClient.query("SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','storage');");
    const hasSupabaseStubs = hasAuth.rowCount >= 2;

    dockerExecPsql(containerName, RESTORE_DB, `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres SUPERUSER LOGIN PASSWORD 'postgres'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA public;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text NOT NULL);
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
`, '扩展与角色初始化', dbUser);

    if (hasSupabaseStubs) {
      const dump = execFileSync(
        'docker',
        ['exec', containerName, 'pg_dump', '-U', dbUser, '-d', 'postgres', '--schema-only', '--no-owner', '--no-privileges', '--schema', 'auth', '--schema', 'storage'],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      );
      dockerExecPsql(containerName, RESTORE_DB, dump, 'auth/storage 迁移前置结构导入', dbUser);
    }
    dockerExecPsql(containerName, RESTORE_DB, `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
  END IF;
  IF to_regprocedure('auth.role()') IS NULL THEN
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $fn$;
  END IF;
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $fn$;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
`, 'auth/storage 最小前置桩补全', dbUser);
  } finally {
    await adminClient.end();
  }
}

async function loadTableRows(client, tableMeta, filePath) {
  const insertSql = buildBatchInsertSql(tableMeta);
  const gunzip = createGunzip();
  const stream = createReadStream(filePath).pipe(gunzip);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let batch = [];
  let loaded = 0;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const payload = `[${batch.join(',')}]`;
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query("SET LOCAL timezone = 'UTC'");
      await client.query(insertSql, [payload]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    }
    loaded += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    batch.push(trimmed);
    if (batch.length >= INSERT_BATCH_ROWS) {
      await flushBatch();
    }
  }
  await flushBatch();
  return loaded;
}

async function resetTableSequences(client, tableMeta) {
  const fullName = `${tableMeta.schema}.${tableMeta.table}`;
  for (const col of tableMeta.columns ?? []) {
    const seqRes = await client.query(
      'SELECT pg_get_serial_sequence($1, $2) AS seq',
      [fullName, col.name],
    );
    const seq = seqRes.rows[0]?.seq;
    if (!seq) continue;
    await client.query(
      `SELECT setval(${quoteLiteral(seq)}, COALESCE(MAX(${quoteIdentifier(col.name)}), 1), MAX(${quoteIdentifier(col.name)}) IS NOT NULL) FROM ${qualifiedName(tableMeta.schema, tableMeta.table)}`,
    );
  }
}

/** Verify every table in manifest exists in restored DB and matches expected rowCount. */
export async function verifyRestoredRowCounts(manifest, queryCount) {
  const results = [];
  let mismatchCount = 0;
  for (const entry of manifest.tables) {
    const actualCount = await queryCount(entry.schema, entry.table);
    const match = actualCount === entry.rowCount;
    if (!match) mismatchCount += 1;
    results.push({
      schema: entry.schema,
      table: entry.table,
      expected: entry.rowCount,
      actual: actualCount,
      match,
    });
  }
  return { results, mismatchCount, allMatched: mismatchCount === 0 };
}

/** Run full Docker Postgres restore rehearsal against a backup directory. */
export async function restoreFromBackup({
  backupDir,
  repoRoot = process.cwd(),
  port,
  image,
  keep = false,
  fromProdSchema = false,
} = {}) {
  const resolvedBackup = backupDir ?? resolveLatestBackupDir();
  const { manifest, schemaSnapshot } = loadAndVerifyBackup(resolvedBackup);
  const targetPort = port ?? (await findFreePort());
  const dockerImage = chooseDockerImage(image);
  const isSupabaseImage = dockerImage.includes('supabase/postgres');
  const dbUser = isSupabaseImage ? 'supabase_admin' : 'postgres';
  const containerName = `dydata-restore-${process.pid}-${Date.now()}`;

  let prodTables = schemaSnapshot?.tables ?? null;
  if (fromProdSchema || !prodTables) {
    const { executeReadOnly } = await createCloudBaseReadOnlyExecutor({ repoRoot });
    const inv = parseSingleJsonResult(await executeReadOnly(CATALOG_INVENTORY_SQL));
    const selectedKeys = new Set(manifest.tables.map((t) => `${t.schema}.${t.table}`));
    prodTables = (inv.relations ?? []).filter((r) => selectedKeys.has(`${r.schema}.${r.table}`));
  }

  const dockerRunArgs = [
    'run', '-d', '--name', containerName,
    '-p', `127.0.0.1:${targetPort}:5432`,
    ...(isSupabaseImage ? [] : ['-e', 'POSTGRES_USER=postgres']),
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-e', 'POSTGRES_DB=postgres',
    dockerImage,
  ];
  execFileSync('docker', dockerRunArgs, { stdio: 'pipe' });

  let client;
  try {
    await waitForPostgres(targetPort, dbUser);
    await bootstrapRestoreDatabase(containerName, targetPort, dbUser);

    const migrations = readMigrationPlan(repoRoot);
    let migrationsApplied = 0;
    for (const mig of migrations) {
      if (mig.skipped) continue;
      dockerExecPsql(containerName, RESTORE_DB, mig.sql, mig.file, dbUser);
      dockerExecPsql(
        containerName,
        RESTORE_DB,
        `INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES (${quoteLiteral(mig.version)}, ${quoteLiteral(mig.name)}) ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;`,
        `${mig.file} 账本登记`,
        dbUser,
      );
      migrationsApplied += 1;
    }

    client = new PgClient({ host: '127.0.0.1', port: targetPort, user: dbUser, password: 'postgres', database: RESTORE_DB });
    await client.connect();

    const localCatalog = JSON.parse((await client.query(LOCAL_SCHEMA_QUERY)).rows[0].catalog);
    const diff = compareLocalAndProdSchema(localCatalog.tables, prodTables);
    const mismatchLines = describeSchemaMismatches(diff);
    for (const line of mismatchLines) console.log(`[结构差异] ${line}`);

    const existingTargets = localCatalog.tables
      .filter((t) => prodTables.some((p) => p.schema === t.schema && p.table === t.table))
      .map((t) => qualifiedName(t.schema, t.table));
    if (existingTargets.length > 0) {
      await client.query(`TRUNCATE TABLE ${existingTargets.join(', ')} RESTART IDENTITY CASCADE;`);
    }

    const repairSql = buildRepairStatements(diff, prodTables, localCatalog.authFks);
    for (const stmt of repairSql) {
      await client.query(stmt);
    }

    const afterCatalog = JSON.parse((await client.query(LOCAL_SCHEMA_QUERY)).rows[0].catalog);
    const afterDiff = compareLocalAndProdSchema(afterCatalog.tables, prodTables);
    if (afterDiff.totalMismatches > 0) {
      throw new Error(`结构修补后仍有 ${afterDiff.totalMismatches} 处差异:\n${describeSchemaMismatches(afterDiff).join('\n')}`);
    }

    const prodByKey = Object.create(null);
    for (const t of prodTables) prodByKey[`${t.schema}.${t.table}`] = t;

    for (const entry of manifest.tables) {
      const tableMeta = prodByKey[`${entry.schema}.${entry.table}`];
      const filePath = path.join(resolvedBackup, entry.file);
      await loadTableRows(client, tableMeta, filePath);
      await resetTableSequences(client, tableMeta);
    }

    const verification = await verifyRestoredRowCounts(manifest, async (schema, table) => {
      const res = await client.query(`SELECT count(*)::bigint AS cnt FROM ${qualifiedName(schema, table)};`);
      return Number(res.rows[0].cnt);
    });

    if (!verification.allMatched) {
      const bad = verification.results.filter((r) => !r.match).map((r) => `${r.schema}.${r.table}(预期=${r.expected},实际=${r.actual})`);
      throw new Error(`行数核对失败，共 ${verification.mismatchCount} 张表不一致: ${bad.join(', ')}`);
    }

    return {
      containerName,
      port: targetPort,
      database: RESTORE_DB,
      backupDir: resolvedBackup,
      migrationsApplied,
      mismatchLines,
      repairedStatements: repairSql.length,
      verification,
      kept: keep,
    };
  } finally {
    if (client) await client.end().catch(() => {});
    if (!keep) {
      try {
        execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

async function main() {
  const args = parseRestoreArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const summary = await restoreFromBackup(args);
  for (const row of summary.verification.results) {
    console.log(`[行数核对] ${row.schema}.${row.table}: 导出=${row.expected} 恢复=${row.actual} ${row.match ? 'MATCH' : 'MISMATCH'}`);
  }
  console.log(JSON.stringify({
    status: 'PASS',
    backupDir: summary.backupDir,
    migrationsApplied: summary.migrationsApplied,
    schemaMismatchesDetected: summary.mismatchLines.length,
    repairedStatements: summary.repairedStatements,
    tablesVerified: summary.verification.results.length,
    mismatchCount: summary.verification.mismatchCount,
    keptContainer: summary.kept ? summary.containerName : null,
    port: summary.kept ? summary.port : null,
  }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(`[db-restore-local] 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

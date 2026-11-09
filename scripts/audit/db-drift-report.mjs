#!/usr/bin/env node
/**
 * 线上/本地数据库漂移对账（只读）。
 *
 * 用法：
 *   DYDATA_LOCAL_DB_URL=postgresql://... SUPABASE_DB_URL=postgresql://... \
 *     node scripts/audit/db-drift-report.mjs --json /tmp/drift.json --md /tmp/drift.md
 *
 * 选项：
 *   --env-file <path>     读取 .env 文件（默认不读；值不会打印）
 *   --prod-url-env <名>   生产连接串的环境变量名（默认 SUPABASE_DB_URL）
 *   --local-url-env <名>  本地连接串的环境变量名（默认 DYDATA_LOCAL_DB_URL）
 *   --local-url <url>     直接给本地连接串（不推荐，会留在 shell 历史里）
 *   --json <path|->       JSON 输出位置；不传则不输出 JSON
 *   --md <path|->         Markdown 输出位置；不传则打印到 stdout
 *   --require-tz <名,...> 必须带 Asia/Shanghai 时区配置的函数名，逗号分隔（默认内置清单）
 *
 * 安全约束：
 *   - 连接后第一条语句是 `set default_transaction_read_only = on`；
 *   - 每条连接都开只读事务并校验 `transaction_read_only = on`，校验不过直接退出；
 *   - 输出中的连接主机会被打码，不打印、不落盘任何凭据；
 *   - 本脚本不执行任何写入、DDL、迁移或修复。
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DEFAULT_REQUIRED_TZ_FUNCTIONS = [
  'get_fulfillment_range',
  'get_fulfillment_calendar',
  'get_today_submission_status',
  'set_permanent_exemption_owner_atomically',
  'clear_permanent_exemption_owner_atomically',
];

const BUSINESS_KEYWORD_RE = /fulfillment|leaderboard|exemption|appeal|cockpit|report|permission|is_admin|stats|summary/i;

function parseArgs(argv) {
  const args = { prodUrlEnv: 'SUPABASE_DB_URL', localUrlEnv: 'DYDATA_LOCAL_DB_URL' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`${a} 需要一个值`);
      i += 1;
      return v;
    };
    if (a === '--env-file') args.envFile = next();
    else if (a === '--prod-url-env') args.prodUrlEnv = next();
    else if (a === '--local-url-env') args.localUrlEnv = next();
    else if (a === '--local-url') args.localUrl = next();
    else if (a === '--json') args.json = next();
    else if (a === '--md') args.md = next();
    else if (a === '--require-tz') args.requireTz = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数: ${a}`);
  }
  return args;
}

/** 极简 .env 读取，只取值不打印。 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) throw new Error(`env 文件不存在: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

function maskHost(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === '127.0.0.1' || host === 'localhost') return `${host}:${u.port || 5432}`;
    // 报告可能入库，远程主机一律整体打码，不留可反推的片段
    return '<主机已打码>';
  } catch {
    return '<主机已打码>';
  }
}

function sanitize(text, urls) {
  let out = String(text ?? '');
  for (const url of urls) {
    if (!url) continue;
    try {
      const u = new URL(url);
      out = out.split(u.hostname).join('<masked-host>');
      if (u.password) out = out.split(u.password).join('***');
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function connectReadOnly({ url, label, allUrls }) {
  if (!url) throw new Error(`${label} 连接串缺失`);
  const isLocal = /(127\.0\.0\.1|localhost)/.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    application_name: 'dydata-db-drift-report-readonly',
  });
  await client.connect();
  // 第一条语句：会话级只读
  await client.query('set default_transaction_read_only = on');
  await client.query('begin');
  await client.query('set transaction read only');
  const t = await client.query('show transaction_read_only');
  const d = await client.query('show default_transaction_read_only');
  if (t.rows[0]?.transaction_read_only !== 'on' || d.rows[0]?.default_transaction_read_only !== 'on') {
    await client.end().catch(() => {});
    throw new Error(`${label} 未能进入只读事务，拒绝继续（写入可能污染生产库）`);
  }
  await client.query('set statement_timeout = 60000');
  return {
    label,
    host: maskHost(url),
    async query(sql) {
      try {
        return await client.query(sql);
      } catch (err) {
        const e = new Error(sanitize(err.message, allUrls));
        e.code = err.code;
        throw e;
      }
    },
    async close() {
      await client.query('rollback').catch(() => {});
      await client.end().catch(() => {});
    },
  };
}

/** 某段 schema 不存在时静默返回空集（如本地没有 supabase_migrations / 没装 pg_cron）。
 *  单条语句失败会中止整个事务，因此用 savepoint 隔离。 */
async function optionalQuery(conn, sql) {
  await conn.query('savepoint optional_query');
  try {
    const r = await conn.query(sql);
    await conn.query('release savepoint optional_query');
    return { ok: true, rows: r.rows };
  } catch (err) {
    await conn.query('rollback to savepoint optional_query');
    return { ok: false, rows: [], error: err.message };
  }
}

const SQL = {
  dbInfo: `select current_database() as database, current_setting('server_version') as server_version,
                  (select extname from pg_extension where extname='pg_cron') as cron_extension`,
  migrations: `select version, name from supabase_migrations.schema_migrations order by version`,
  tables: `select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and c.relkind in ('r','p') order by 1`,
  columns: `select table_name, column_name, data_type, is_nullable
            from information_schema.columns
            where table_schema='public' order by table_name, ordinal_position`,
  functions: `select p.proname,
                     pg_get_function_identity_arguments(p.oid) as args,
                     p.prokind::text as kind,
                     p.prosecdef as security_definer,
                     coalesce(array_to_string(p.proconfig,';'),'') as config,
                     coalesce(p.proacl::text,'') as acl,
                     has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
                     has_function_privilege('authenticated', p.oid, 'EXECUTE') as authn_exec,
                     md5(pg_get_functiondef(p.oid)) as def_md5,
                     pg_get_functiondef(p.oid) as def
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname='public' and p.prokind in ('f','p') order by 1,2`,
  constraints: `select cl.relname as table_name, con.conname, con.contype,
                       con.convalidated, pg_get_constraintdef(con.oid) as def
                from pg_constraint con
                join pg_class cl on cl.oid = con.conrelid
                join pg_namespace n on n.oid = cl.relnamespace
                where n.nspname='public' and con.contype in ('p','f','u','c')
                  and cl.relkind in ('r','p') order by 1,2`,
  indexes: `select tablename as table_name, indexname, indexdef from pg_indexes
            where schemaname='public' order by 1,2`,
  policies: `select tablename, policyname, permissive, roles::text as roles, cmd,
                    coalesce(qual,'') as qual, coalesce(with_check,'') as with_check
             from pg_policies where schemaname='public' order by 1,2`,
  tablePrivileges: `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
                    from information_schema.table_privileges
                    where table_schema='public' and grantee in ('anon','authenticated')
                    group by 1,2 order by 1,2`,
  triggers: `select cl.relname as table_name, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
             from pg_trigger t
             join pg_class cl on cl.oid = t.tgrelid
             join pg_namespace n on n.oid = cl.relnamespace
             where n.nspname='public' and not t.tgisinternal order by 1,2`,
  cronJobs: `select jobid, jobname, schedule, command, active, database, username
             from cron.job order by jobid`,
};

// 函数体内出现下列任一迹象，视为「有权限判据」。`_v2(` 表示这是一个转发到 v2 实现的薄壳，
// 权限校验在 v2 内部（对生产三个豁免包装函数已人工核对：v2 体内有 auth.uid/权限校验）。
const PERMISSION_CHECK_RE = /auth\.uid\(\)|auth\.jwt|is_admin|has_permission|require_admin|permission|data_scope|visible_user|can_manage|role|_v2\(/i;
const LOCAL_DATE_RE = /current_date|now\(\)\s*::\s*date|current_timestamp\s*::\s*date|localtimestamp/i;

function fnKey(row) {
  return `${row.proname}(${row.args})`;
}

function splitLines(def) {
  return String(def ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd());
}

function multisetDiff(linesA, linesB) {
  const countB = new Map();
  for (const l of linesB) countB.set(l, (countB.get(l) ?? 0) + 1);
  const removed = [];
  for (const l of linesA) {
    const n = countB.get(l) ?? 0;
    if (n > 0) countB.set(l, n - 1);
    else removed.push(l);
  }
  const countA = new Map();
  for (const l of linesA) countA.set(l, (countA.get(l) ?? 0) + 1);
  const added = [];
  for (const l of linesB) {
    const n = countA.get(l) ?? 0;
    if (n > 0) countA.set(l, n - 1);
    else added.push(l);
  }
  return { removed, added };
}

function summarizeDiff(defA, defB, limit = 10) {
  const { removed, added } = multisetDiff(splitLines(defA), splitLines(defB));
  return {
    removed_lines: removed.length,
    added_lines: added.length,
    removed_sample: removed.slice(0, limit),
    added_sample: added.slice(0, limit),
  };
}

function migrationVersionFromFile(file) {
  // 兼容两种命名：14 位时间戳（20261003020000_xxx.sql）与历史序号（001_init.sql）
  const m = file.match(/^(\d{3,})_/);
  return m ? m[1] : null;
}

function migrationNameFromFile(file) {
  return file.replace(/^\d+_/, '').replace(/\.sql$/, '');
}

function listMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: f, version: migrationVersionFromFile(f), name: migrationNameFromFile(f) }));
}

function buildMigrationsSection({ prod, local, repoDir, deferredDir }) {
  const allRepoFiles = listMigrationFiles(repoDir);
  const unparsed = allRepoFiles.filter((f) => !f.version);
  const repoFiles = allRepoFiles.filter((f) => f.version);
  const deferredFiles = listMigrationFiles(deferredDir).map((d) => ({ ...d, deferred: true }));
  const allFiles = [...repoFiles, ...deferredFiles];
  const fileByVersion = new Map(allFiles.map((f) => [f.version, f]));
  const prodVersions = new Array(...new Set(prod.rows.map((r) => r.version))).sort();
  const localVersions = new Array(...new Set(local.rows.map((r) => r.version))).sort();
  const localSet = new Set(localVersions);
  const prodSet = new Set(prodVersions);
  const repoSet = new Set(repoFiles.map((f) => f.version));

  const appliedWithoutFile = prodVersions.filter((v) => !fileByVersion.has(v))
    .map((v) => ({ version: v, name: prod.rows.find((r) => r.version === v)?.name ?? null }));

  // 生产曾被 apply-single-migration.mjs 之类的手工执行器写入，版本号是“执行时间戳”而非文件名版本，
  // 因此按版本号对不上的条目要再用文件名（name）复核一次，避免把同一支迁移误报成两处缺失。
  const prodByName = new Map(prod.rows.map((r) => [r.name, r.version]));
  const repoByName = new Map(repoFiles.map((f) => [f.name, f]));
  const versionMismatch = repoFiles
    .filter((f) => !prodSet.has(f.version) && prodByName.has(f.name))
    .map((f) => ({ file: f.file, repo_version: f.version, prod_version: prodByName.get(f.name) }));

  const repoNotInProd = repoFiles.filter((f) => !prodSet.has(f.version) && !prodByName.has(f.name));
  const prodOnlyReal = appliedWithoutFile.filter((a) => !repoByName.has(a.name));
  const repoNotInLocal = repoFiles.filter((f) => !localSet.has(f.version));
  const localByName = new Map(local.rows.map((r) => [r.name, r.version]));
  const localVersionMismatch = repoFiles
    .filter((f) => !localSet.has(f.version) && localByName.has(f.name))
    .map((f) => ({ file: f.file, repo_version: f.version, local_version: localByName.get(f.name) }));
  const prodNotInLocal = prodVersions.filter((v) => !localSet.has(v));
  const localNotInProd = localVersions.filter((v) => !prodSet.has(v));

  return {
    repo_count: repoFiles.length,
    deferred_count: deferredFiles.length,
    prod_applied_count: prodVersions.length,
    local_applied_count: localVersions.length,
    prod_latest: prodVersions.at(-1) ?? null,
    local_latest: localVersions.at(-1) ?? null,
    repo_latest: repoFiles.at(-1)?.version ?? null,
    prod_rows: prod.rows,
    local_rows: local.rows,
    repo_has_no_prod_record: repoNotInProd,
    repo_not_applied_locally: repoNotInLocal,
    local_version_mismatch_name_matched: localVersionMismatch,
    prod_applied_without_repo_file: prodOnlyReal,
    version_mismatch_name_matched: versionMismatch,
    prod_not_applied_locally: prodNotInLocal,
    local_applied_not_in_prod: localNotInProd,
    deferred: deferredFiles.map((f) => ({
      file: f.file,
      version: f.version,
      applied_in_prod: prodSet.has(f.version),
      applied_locally: localSet.has(f.version),
      in_repo_migrations: repoSet.has(f.version),
    })),
    local_migrations_schema_missing: local.ok === false,
    unparsed_repo_files: unparsed.map((f) => f.file),
  };
}

function buildFunctionsSection({ prod, local }) {
  const prodMap = new Map(prod.rows.map((r) => [fnKey(r), r]));
  const localMap = new Map(local.rows.map((r) => [fnKey(r), r]));
  const keys = [...new Set([...prodMap.keys(), ...localMap.keys()])].sort();

  const onlyProd = [];
  const onlyLocal = [];
  const differing = [];
  const configDrift = [];

  for (const key of keys) {
    const p = prodMap.get(key);
    const l = localMap.get(key);
    if (p && !l) {
      onlyProd.push({ key, security_definer: p.security_definer, config: p.config, anon_exec: p.anon_exec, authn_exec: p.authn_exec, def_md5: p.def_md5, def_len: p.def.length });
      continue;
    }
    if (l && !p) {
      onlyLocal.push({ key, security_definer: l.security_definer, config: l.config, anon_exec: l.anon_exec, authn_exec: l.authn_exec, def_md5: l.def_md5, def_len: l.def.length });
      continue;
    }
    const bodySame = p.def_md5 === l.def_md5;
    const configSame = p.config === l.config;
    const aclSame = p.acl === l.acl;
    const flagSame = p.security_definer === l.security_definer && p.anon_exec === l.anon_exec && p.authn_exec === l.authn_exec;
    if (bodySame && configSame && aclSame && flagSame) continue;

    const entry = {
      key,
      body_same: bodySame,
      config_prod: p.config,
      config_local: l.config,
      acl_prod: p.acl,
      acl_local: l.acl,
      security_definer_prod: p.security_definer,
      security_definer_local: l.security_definer,
      anon_exec_prod: p.anon_exec,
      anon_exec_local: l.anon_exec,
      authn_exec_prod: p.authn_exec,
      authn_exec_local: l.authn_exec,
    };
    if (!bodySame) entry.body_diff = summarizeDiff(l.def, p.def); // local → prod
    differing.push(entry);
    if (bodySame && !configSame) configDrift.push(entry);
  }

  return {
    prod_function_count: prod.rows.length,
    local_function_count: local.rows.length,
    only_prod: onlyProd,
    only_local: onlyLocal,
    differing,
    body_differences: differing.filter((d) => !d.body_same),
    config_only_drift: configDrift,
  };
}

function buildTimezoneSection({ prod, local, requiredNames }) {
  const pick = (rows) => rows.filter((r) => requiredNames.includes(r.proname) || /exemption|fulfillment|calendar|today_submission/.test(r.proname))
    .map((r) => ({
      name: fnKey(r),
      config: r.config,
      has_shanghai: /Asia\/Shanghai/i.test(r.config),
      body_uses_local_date: LOCAL_DATE_RE.test(r.def),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const prodNamed = pick(prod.rows);
  const localNamed = pick(local.rows);

  const bodyDateNoTz = (rows) => rows
    .filter((r) => LOCAL_DATE_RE.test(r.def) && !/Asia\/Shanghai/i.test(r.config))
    .map((r) => ({ name: fnKey(r), config: r.config })
    ).sort((a, b) => a.name.localeCompare(b.name));

  const requiredPresent = (rows) => requiredNames.map((n) => ({
    name: n,
    present: rows.some((r) => r.name.startsWith(`${n}(`)),
    has_shanghai: rows.some((r) => r.name.startsWith(`${n}(`) && r.has_shanghai),
  }));

  return {
    required_names: requiredNames,
    prod_required: requiredPresent(prodNamed),
    local_required: requiredPresent(localNamed),
    prod_named_functions: prodNamed,
    local_named_functions: localNamed,
    prod_body_uses_local_date_without_tz: bodyDateNoTz(prod.rows),
    local_body_uses_local_date_without_tz: bodyDateNoTz(local.rows),
  };
}

function buildColumnsSection({ prod, local }) {
  const group = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.table_name)) m.set(r.table_name, new Map());
      m.get(r.table_name).set(r.column_name, `${r.data_type}${r.is_nullable === 'NO' ? ' not null' : ''}`);
    }
    return m;
  };
  const prodM = group(prod.rows);
  const localM = group(local.rows);
  const differing = [];
  for (const [table, cols] of prodM) {
    if (!localM.has(table)) continue;
    const lcols = localM.get(table);
    const missingLocally = [...cols.keys()].filter((c) => !lcols.has(c));
    const missingOnProd = [...lcols.keys()].filter((c) => !cols.has(c));
    const typeChanged = [...cols.keys()].filter((c) => lcols.has(c) && cols.get(c) !== lcols.get(c));
    if (missingLocally.length || missingOnProd.length || typeChanged.length) {
      differing.push({
        table,
        columns_only_prod: missingLocally,
        columns_only_local: missingOnProd,
        columns_type_or_nullable_changed: typeChanged.map((c) => ({ column: c, prod: cols.get(c), local: lcols.get(c) })),
      });
    }
  }
  return { shared_tables_with_column_drift: differing.sort((a, b) => a.table.localeCompare(b.table)), count: differing.length };
}

function buildConstraintsSection({ prod, local, prodIndexes, localIndexes, sharedTables }) {
  const key = (r) => `${r.table_name}|${r.conname}`;
  const prodMap = new Map(prod.rows.map((r) => [key(r), r]));
  const localMap = new Map(local.rows.map((r) => [key(r), r]));
  const keys = [...new Set([...prodMap.keys(), ...localMap.keys()])].sort();
  const onlyProdShared = [];
  const onlyProdOnProdOnlyTable = [];
  const onlyLocalShared = [];
  const onlyLocalOnLocalOnlyTable = [];
  const differing = [];
  for (const k of keys) {
    const p = prodMap.get(k);
    const l = localMap.get(k);
    if (p && !l) {
      const entry = { key: k, type: p.contype, def: p.def, validated: p.convalidated };
      if (sharedTables.has(p.table_name)) onlyProdShared.push(entry);
      else onlyProdOnProdOnlyTable.push(entry);
    } else if (l && !p) {
      if (sharedTables.has(l.table_name)) onlyLocalShared.push({ key: k, type: l.contype, def: l.def, validated: l.convalidated });
      else onlyLocalOnLocalOnlyTable.push({ key: k, type: l.contype, def: l.def });
    } else if (p.def !== l.def || p.convalidated !== l.convalidated) {
      differing.push({ key: k, type: p.contype, prod_def: p.def, local_def: l.def, prod_validated: p.convalidated, local_validated: l.convalidated });
    }
  }

  const required = 'report_date_must_match_published_at';
  const prodRequired = prod.rows.filter((r) => r.conname === required)
    .map((r) => ({ table: r.table_name, type: r.contype, validated: r.convalidated, def: r.def }));
  const localRequired = local.rows.filter((r) => r.conname === required)
    .map((r) => ({ table: r.table_name, type: r.contype, validated: r.convalidated, def: r.def }));

  const parseIndexColumns = (indexdef) => {
    const m = indexdef.match(/\((.*)\)\s*(?:where.*)?$/i);
    if (!m) return [];
    return m[1].split(',').map((s) => s.trim().replace(/^"/, '').replace(/".*$/, '').replace(/\s+DESC|\s+ASC/i, ''));
  };
  const findFkWithoutIndex = (constraints, indexes) => {
    const byTable = new Map();
    for (const idx of indexes) {
      if (!byTable.has(idx.table_name)) byTable.set(idx.table_name, []);
      byTable.get(idx.table_name).push(parseIndexColumns(idx.indexdef));
    }
    const out = [];
    for (const c of constraints) {
      if (c.contype !== 'f') continue;
      const m = c.def.match(/FOREIGN KEY\s*\((.+?)\)/i);
      if (!m) continue;
      const cols = m[1].split(',').map((s) => s.trim().replace(/"/g, ''));
      const idxList = byTable.get(c.table_name) ?? [];
      const covered = idxList.some((idxCols) => cols.every((col, i) => idxCols[i] === col));
      if (!covered) out.push({ table: c.table_name, constraint: c.conname, columns: cols, def: c.def });
    }
    return out.sort((a, b) => `${a.table}|${a.constraint}`.localeCompare(`${b.table}|${b.constraint}`));
  };

  return {
    prod_required_constraint: prodRequired,
    local_required_constraint: localRequired,
    only_prod_on_shared_table: onlyProdShared,
    only_prod_on_prod_only_table: onlyProdOnProdOnlyTable,
    only_local_on_shared_table: onlyLocalShared,
    only_local_on_local_only_table: onlyLocalOnLocalOnlyTable,
    differing,
    prod_fk_without_index: findFkWithoutIndex(prod.rows, prodIndexes.rows),
    local_fk_without_index: findFkWithoutIndex(local.rows, localIndexes.rows),
  };
}

function buildRlsSection({ prod, local, prodTables, localTables, prodPrivs, localPrivs }) {
  const tKey = (r) => r.table_name;
  const prodT = new Map(prodTables.rows.map((r) => [tKey(r), r]));
  const localT = new Map(localTables.rows.map((r) => [tKey(r), r]));
  const tablesOnlyProd = [...prodT.keys()].filter((t) => !localT.has(t)).sort();
  const tablesOnlyLocal = [...localT.keys()].filter((t) => !prodT.has(t)).sort();
  const sharedTables = new Set([...prodT.keys()].filter((t) => localT.has(t)));

  const polKey = (r) => `${r.tablename}|${r.policyname}`;
  const prodMap = new Map(prod.rows.map((r) => [polKey(r), r]));
  const localMap = new Map(local.rows.map((r) => [polKey(r), r]));
  const keys = [...new Set([...prodMap.keys(), ...localMap.keys()])].sort();
  const policiesOnlyProd = [];
  const policiesOnlyProdOnProdOnlyTable = [];
  const policiesOnlyLocal = [];
  const policiesOnlyLocalOnLocalOnlyTable = [];
  const policiesDiffering = [];
  for (const k of keys) {
    const p = prodMap.get(k);
    const l = localMap.get(k);
    if (p && !l) {
      const entry = { key: k, cmd: p.cmd, roles: p.roles, qual: p.qual, with_check: p.with_check };
      if (sharedTables.has(p.tablename)) policiesOnlyProd.push(entry);
      else policiesOnlyProdOnProdOnlyTable.push(entry);
    } else if (l && !p) {
      const entry = { key: k, cmd: l.cmd, roles: l.roles, qual: l.qual, with_check: l.with_check };
      if (sharedTables.has(l.tablename)) policiesOnlyLocal.push(entry);
      else policiesOnlyLocalOnLocalOnlyTable.push(entry);
    } else if (p.cmd !== l.cmd || p.qual !== l.qual || p.with_check !== l.with_check || p.roles !== l.roles) {
      policiesDiffering.push({ key: k, prod: p, local: l });
    }
  }

  const rlsDiffering = [...prodT.keys()]
    .filter((t) => localT.has(t) && prodT.get(t).rls_enabled !== localT.get(t).rls_enabled)
    .map((t) => ({ table: t, prod_rls: prodT.get(t).rls_enabled, local_rls: localT.get(t).rls_enabled }));

  const privMap = new Map(prodPrivs.rows.map((r) => [`${r.table_name}|${r.grantee}`, r.privileges]));
  const writePriv = (p) => /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALL\b|\bTRUNCATE\b/.test(String(p ?? ''));
  const prodTablesWithoutRls = new Set(prodTables.rows.filter((r) => !r.rls_enabled).map((r) => r.table_name));
  const prodNoRlsButWritable = prodPrivs.rows
    .filter((r) => prodTablesWithoutRls.has(r.table_name) && writePriv(r.privileges))
    .map((r) => ({ table: r.table_name, grantee: r.grantee, privileges: r.privileges }))
    .sort((a, b) => `${a.table}|${a.grantee}`.localeCompare(`${b.table}|${b.grantee}`));

  const privDiffering = [];
  for (const r of prodPrivs.rows) {
    const k = `${r.table_name}|${r.grantee}`;
    if (privMap.has(k) && !localPrivs.rows.some((l) => `${l.table_name}|${l.grantee}` === k)) privDiffering.push({ key: k, side: 'only_prod', privileges: r.privileges });
  }
  for (const r of localPrivs.rows) {
    const k = `${r.table_name}|${r.grantee}`;
    if (!privMap.has(k)) privDiffering.push({ key: k, side: 'only_local', privileges: r.privileges });
    else if (privMap.get(k) !== r.privileges) privDiffering.push({ key: k, side: 'both', prod: privMap.get(k), local: r.privileges });
  }

  return {
    prod_table_count: prodTables.rows.length,
    local_table_count: localTables.rows.length,
    tables_only_prod: tablesOnlyProd,
    tables_only_local: tablesOnlyLocal,
    rls_differing: rlsDiffering,
    policies_only_prod: policiesOnlyProd,
    policies_only_prod_on_prod_only_table: policiesOnlyProdOnProdOnlyTable,
    policies_only_local: policiesOnlyLocal,
    policies_only_local_on_local_only_table: policiesOnlyLocalOnLocalOnlyTable,
    policies_differing: policiesDiffering,
    prod_no_rls_but_anon_authn_write: prodNoRlsButWritable,
    privileges_differing: privDiffering.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function buildFunctionPermissionSection({ prod, local }) {
  const describe = (rows, side) => rows.map((r) => ({
    side,
    name: fnKey(r),
    security_definer: r.security_definer,
    anon_exec: r.anon_exec,
    authn_exec: r.authn_exec,
    acl: r.acl,
    has_permission_check: PERMISSION_CHECK_RE.test(r.def),
  }));
  const prodSec = describe(prod.rows.filter((r) => r.security_definer), 'prod');
  const localSec = describe(local.rows.filter((r) => r.security_definer), 'local');
  const exposedWithoutCheck = prodSec.filter((r) => (r.anon_exec || r.authn_exec) && !r.has_permission_check);
  const localExposedWithoutCheck = localSec.filter((r) => (r.anon_exec || r.authn_exec) && !r.has_permission_check);
  const prodAnonExec = prod.rows.filter((r) => r.anon_exec).map((r) => fnKey(r)).sort();
  const localAnonExec = local.rows.filter((r) => r.anon_exec).map((r) => fnKey(r)).sort();
  return {
    prod_security_definer: prodSec,
    local_security_definer: localSec,
    prod_anon_executable: prodAnonExec,
    local_anon_executable: localAnonExec,
    prod_secdef_exposed_without_permission_check: exposedWithoutCheck.sort((a, b) => a.name.localeCompare(b.name)),
    local_secdef_exposed_without_permission_check: localExposedWithoutCheck.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function buildTriggersSection({ prod, local, prodCron, localCron }) {
  const key = (r) => `${r.table_name}|${r.tgname}`;
  const prodMap = new Map(prod.rows.map((r) => [key(r), r]));
  const localMap = new Map(local.rows.map((r) => [key(r), r]));
  const keys = [...new Set([...prodMap.keys(), ...localMap.keys()])].sort();
  const onlyProd = [];
  const onlyLocal = [];
  const differing = [];
  for (const k of keys) {
    const p = prodMap.get(k);
    const l = localMap.get(k);
    if (p && !l) onlyProd.push({ key: k, enabled: p.tgenabled, def: p.def });
    else if (l && !p) onlyLocal.push({ key: k, enabled: l.tgenabled, def: l.def });
    else if (p.def !== l.def || p.tgenabled !== l.tgenabled) differing.push({ key: k, prod_enabled: p.tgenabled, local_enabled: l.tgenabled, prod_def: p.def, local_def: l.def });
  }
  return {
    prod_trigger_count: prod.rows.length,
    local_trigger_count: local.rows.length,
    only_prod: onlyProd,
    only_local: onlyLocal,
    differing,
    cron_available_prod: prodCron.ok,
    cron_available_local: localCron.ok,
    prod_cron_jobs: prodCron.rows,
    local_cron_jobs: localCron.rows,
  };
}

function buildFindings(sections) {
  const findings = [];
  const add = (severity, area, title, detail) => findings.push({ severity, area, title, detail });

  const mig = sections.migrations;
  for (const f of mig.prod_applied_without_repo_file) {
    add('高', '迁移账本', `生产已执行但仓库没有对应文件：${f.version}`, `生产版本 ${f.version}（name=${f.name ?? '?'}）在 supabase/migrations 与 deferred-migrations 中均无文件，属于「无源码的状态」`);
  }
  for (const f of mig.repo_has_no_prod_record) {
    add('中', '迁移账本', `仓库有、生产未执行：${f.file}（待判断是否为未发布）`, '可能是尚未上线的迁移，也可能生产被手工改过而没记文件');
  }
  for (const f of mig.version_mismatch_name_matched) {
    add('中', '迁移账本', `生产迁移版本号与文件名不一致：${f.file}`, `仓库文件名版本 ${f.repo_version}，生产账本记的是 ${f.prod_version}；说明这条是在生产上手工执行并登记了执行时间，按版本号做对账会误判`);
  }
  for (const f of mig.local_version_mismatch_name_matched) {
    add('低', '迁移账本', `本地迁移版本号与文件名不一致：${f.file}`, `仓库 ${f.repo_version}，本地账本 ${f.local_version}`);
  }
  for (const f of mig.repo_not_applied_locally) {
    add('中', '迁移账本', `仓库有、本地未执行：${f.file}`, '本地库未按文件重建，本地测试结果不能代表文件最终形态');
  }
  if (mig.local_migrations_schema_missing) add('低', '迁移账本', '本地库没有 supabase_migrations.schema_migrations', '本地库不是由 CLI 迁移构建，账本对比只能依赖生产侧');

  for (const f of sections.functions.only_prod) {
    add(BUSINESS_KEYWORD_RE.test(f.key) ? '高' : '中', '函数定义', `只在生产存在：${f.key}`, `security_definer=${f.security_definer}，anon_exec=${f.anon_exec}，启动配置=${f.config || '无'}`);
  }
  for (const f of sections.functions.only_local) {
    add(BUSINESS_KEYWORD_RE.test(f.key) ? '高' : '中', '函数定义', `只在本地存在：${f.key}`, `security_definer=${f.security_definer}，anon_exec=${f.anon_exec}，启动配置=${f.config || '无'}`);
  }
  for (const f of sections.functions.body_differences) {
    add(BUSINESS_KEYWORD_RE.test(f.key) ? '高' : '中', '函数定义', `两侧定义不同：${f.key}`, `本地→生产 删除 ${f.body_diff.removed_lines} 行 / 新增 ${f.body_diff.added_lines} 行；配置差异：${f.config_prod || '无'} vs ${f.config_local || '无'}`);
  }
  for (const f of sections.functions.config_only_drift) {
    add('中', '函数定义', `函数体相同但启动配置不同：${f.key}`, `生产=${f.config_prod || '无'}；本地=${f.config_local || '无'}`);
  }

  const tz = sections.timezone;
  for (const r of tz.prod_required.filter((x) => !x.has_shanghai)) {
    add('高', '业务日时区', `生产缺少 Asia/Shanghai 时区配置：${r.name}`, r.present ? '函数存在但没有时区配置，业务日会按数据库默认时区（UTC）切分' : '生产没有这个函数');
  }
  for (const r of tz.local_required.filter((x) => !x.has_shanghai)) {
    add('中', '业务日时区', `本地缺少 Asia/Shanghai 时区配置：${r.name}`, '本地为准的判断会与实际业务日不一致');
  }

  const cons = sections.constraints;
  if (sections.columns) {
    for (const t of sections.columns.shared_tables_with_column_drift) {
      add('中', '同名表结构', `两侧列不一致：${t.table}`, `仅生产有 [${t.columns_only_prod.join(',') || '无'}]；仅本地有 [${t.columns_only_local.join(',') || '无'}]；类型不同 ${t.columns_type_or_nullable_changed.length} 列`);
    }
  }
  for (const c of cons.only_prod_on_shared_table) add(c.type === 'f' || c.type === 'u' ? '高' : '中', '数据完整性约束', `只在生产存在的约束：${c.key}`, `${c.def}；validated=${c.validated}`);
  for (const c of cons.only_local_on_shared_table) add(c.type === 'f' || c.type === 'u' ? '中' : '低', '数据完整性约束', `只在本地存在的约束：${c.key}`, `${c.def}；validated=${c.validated}`);
  for (const c of cons.differing) add('中', '数据完整性约束', `约束定义不同：${c.key}`, `${c.prod_def} vs ${c.local_def}`);
  const prodReqOk = cons.prod_required_constraint.some((c) => c.validated);
  add(prodReqOk ? '中' : '高', '数据完整性约束', `report_date_must_match_published_at 在生产${prodReqOk ? '存在且生效' : '缺失或未生效'}`, JSON.stringify(cons.prod_required_constraint));
  if (cons.prod_fk_without_index.length) {
    add('低', '数据完整性约束', `生产有 ${cons.prod_fk_without_index.length} 个外键没有可用索引`, cons.prod_fk_without_index.map((f) => `${f.table}.${f.constraint}(${f.columns.join(',')})`).join('；'));
  }

  const rls = sections.rls;
  for (const t of rls.rls_differing) add('高', '行级权限', `表 RLS 开关不一致：${t.table}`, `生产=${t.prod_rls}，本地=${t.local_rls}`);
  for (const t of rls.prod_no_rls_but_anon_authn_write) add('高', '行级权限', `生产表未开 RLS 但 ${t.grantee} 可写：${t.table}`, `权限=${t.privileges}`);
  for (const p of rls.policies_only_prod) add('中', '行级权限', `只在生产存在的策略：${p.key}`, `cmd=${p.cmd}，roles=${p.roles}`);
  for (const p of rls.policies_only_local) add('低', '行级权限', `只在本地存在的策略：${p.key}`, `cmd=${p.cmd}，roles=${p.roles}`);
  for (const p of rls.policies_differing) add('中', '行级权限', `策略条件不同：${p.key}`, `生产 qual=${p.prod.qual} / 本地 qual=${p.local.qual}`);

  const fp = sections.functionPermissions;
  for (const f of fp.prod_secdef_exposed_without_permission_check) {
    add('高', '函数执行权限', `生产 SECURITY DEFINER 函数可被 ${f.anon_exec ? 'anon' : 'authenticated'} 直接调用且未见权限判断：${f.name}`, '启发式扫描（函数体内未出现 auth.uid()/is_admin/permission/role 等字样），需人工复核');
  }

  const tg = sections.triggers;
  for (const t of tg.only_prod) add('中', '触发器与定时任务', `只在生产存在的触发器：${t.key}`, `enabled=${t.enabled}`);
  for (const t of tg.only_local) add('低', '触发器与定时任务', `只在本地存在的触发器：${t.key}`, `enabled=${t.enabled}`);
  for (const t of tg.differing) add('中', '触发器与定时任务', `触发器定义不同：${t.key}`, '生产/本地定义或启用状态不一致');
  const prodCron = tg.prod_cron_jobs.length;
  const localCron = tg.local_cron_jobs.length;
  if (prodCron || localCron) add('低', '触发器与定时任务', `定时任务数量：生产 ${prodCron} / 本地 ${localCron}`, '任务清单见 JSON 的 triggers.prod_cron_jobs / local_cron_jobs');

  const rank = { 高: 3, 中: 2, 低: 1 };
  return findings.sort((a, b) => rank[b.severity] - rank[a.severity] || a.area.localeCompare(b.area) || a.title.localeCompare(b.title));
}

function buildMarkdown(report) {
  const s = report.sections;
  const lines = [];
  const p = (x = '') => lines.push(x);

  p(`# 数据库漂移对账（只读）`);
  p();
  p(`- 生成时间：${report.generatedAt}`);
  p(`- 生产：${report.sources.prod.host}（库 ${report.sources.prod.database}，PostgreSQL ${report.sources.prod.server_version}）`);
  p(`- 本地：${report.sources.local.host}（库 ${report.sources.local.database}，PostgreSQL ${report.sources.local.server_version}）`);
  p(`- 连接均为只读事务（transaction_read_only=on），脚本未执行任何写入。`);
  p();
  p(`## 概览`);
  p();
  p(`| 区域 | 生产 | 本地 | 差异条数 |`);
  p(`|---|---:|---:|---:|`);
  p(`| 迁移账本 | ${s.migrations.prod_applied_count} | ${s.migrations.local_applied_count} | ${s.migrations.prod_applied_without_repo_file.length} 生产无文件 / ${s.migrations.repo_has_no_prod_record.length} 仓库未执行 |`);
  p(`| 函数 | ${s.functions.prod_function_count} | ${s.functions.local_function_count} | ${s.functions.only_prod.length} 只生产 / ${s.functions.only_local.length} 只本地 / ${s.functions.differing.length} 定义或配置不同 |`);
  p(`| 表 | ${s.rls.prod_table_count} | ${s.rls.local_table_count} | ${s.rls.tables_only_prod.length} 只生产 / ${s.rls.tables_only_local.length} 只本地 / ${s.rls.rls_differing.length} RLS 开关不同 |`);
  p(`| 同名表结构 | - | - | ${s.columns.count} 个表列不一致 |`);
  p(`| 触发器 | ${s.triggers.prod_trigger_count} | ${s.triggers.local_trigger_count} | ${s.triggers.only_prod.length} 只生产 / ${s.triggers.only_local.length} 只本地 |`);
  p();

  p(`## 1. 迁移账本`);
  p();
  p(`- 仓库文件：${s.migrations.repo_count} 个，deferred：${s.migrations.deferred_count} 个`);
  p(`- 生产已执行 ${s.migrations.prod_applied_count} 个，最新 ${s.migrations.prod_latest ?? '无'}`);
  p(`- 本地已执行 ${s.migrations.local_applied_count} 个，最新 ${s.migrations.local_latest ?? '无'}`);
  p();
  const listBlock = (title, items, fmt) => {
    p(`### ${title}（${items.length}）`);
    p();
    if (!items.length) { p('无'); p(); return; }
    for (const it of items) p(`- ${fmt(it)}`);
    p();
  };
  listBlock('生产已执行、仓库无文件', s.migrations.prod_applied_without_repo_file, (x) => `${x.version}（${x.name ?? '?'}）`);
  listBlock('同名但版本号不同（生产）', s.migrations.version_mismatch_name_matched,
    (x) => `${x.file}：仓库版本 ${x.repo_version} / 生产记录 ${x.prod_version}`);
  listBlock('同名但版本号不同（本地）', s.migrations.local_version_mismatch_name_matched,
    (x) => `${x.file}：仓库版本 ${x.repo_version} / 本地记录 ${x.local_version}`);
  listBlock('仓库有、生产未执行', s.migrations.repo_has_no_prod_record, (x) => `${x.file}`);
  listBlock('仓库有、本地未执行', s.migrations.repo_not_applied_locally, (x) => `${x.file}`);
  listBlock('生产执行了、本地未执行', s.migrations.prod_not_applied_locally, (x) => `${x}`);
  listBlock('本地执行了、生产未执行', s.migrations.local_applied_not_in_prod, (x) => `${x}`);
  listBlock('deferred-migrations 状态', s.migrations.deferred,
    (x) => `${x.file} → 生产${x.applied_in_prod ? '已执行' : '未执行'} / 本地${x.applied_locally ? '已执行' : '未执行'}`);

  p(`## 2. 函数定义`);
  p();
  listBlock('只在生产存在', s.functions.only_prod, (x) => `${x.key}（security_definer=${x.security_definer}，anon_exec=${x.anon_exec}，config=${x.config || '无'}）`);
  listBlock('只在本地存在', s.functions.only_local, (x) => `${x.key}（security_definer=${x.security_definer}，anon_exec=${x.anon_exec}，config=${x.config || '无'}）`);
  p(`### 定义或配置不同（${s.functions.differing.length}）`);
  p();
  if (!s.functions.differing.length) p('无');
  for (const d of s.functions.differing) {
    p(`- **${d.key}**：函数体${d.body_same ? '相同' : '不同'}；config 生产=${d.config_prod || '无'} / 本地=${d.config_local || '无'}`);
    if (d.body_diff) {
      p(`  - 本地→生产：删除 ${d.body_diff.removed_lines} 行，新增 ${d.body_diff.added_lines} 行`);
      for (const l of d.body_diff.removed_sample) p(`  - \`- ${l.replace(/\|/g, '\\|').slice(0, 220)}\``);
      for (const l of d.body_diff.added_sample) p(`  - \`+ ${l.replace(/\|/g, '\\|').slice(0, 220)}\``);
    }
  }
  p();

  p(`## 3. 业务日时区（Asia/Shanghai）`);
  p();
  p('| 函数 | 生产存在 | 生产时区 | 本地存在 | 本地时区 |');
  p('|---|---|---|---|---|');
  for (const r of s.timezone.prod_required) {
    const l = s.timezone.local_required.find((x) => x.name === r.name);
    p(`| ${r.name} | ${r.present ? '是' : '否'} | ${r.has_shanghai ? '有' : '无'} | ${l?.present ? '是' : '否'} | ${l?.has_shanghai ? '有' : '无'} |`);
  }
  p();
  listBlock('生产：函数体用 current_date / now()::date 但没有时区配置', s.timezone.prod_body_uses_local_date_without_tz, (x) => `${x.name}（config=${x.config || '无'}）`);
  listBlock('本地：函数体用 current_date / now()::date 但没有时区配置', s.timezone.local_body_uses_local_date_without_tz, (x) => `${x.name}（config=${x.config || '无'}）`);

  p(`## 4. 数据完整性约束`);
  p();
  p(`- 生产 report_date_must_match_published_at：${s.constraints.prod_required_constraint.length ? JSON.stringify(s.constraints.prod_required_constraint) : '缺失'}`);
  p(`- 本地 report_date_must_match_published_at：${s.constraints.local_required_constraint.length ? JSON.stringify(s.constraints.local_required_constraint) : '缺失'}`);
  p();
  listBlock('只在生产存在的约束（两侧都有的表）', s.constraints.only_prod_on_shared_table, (x) => `${x.key}（${x.type}，validated=${x.validated}）：${x.def}`);
  listBlock('只在生产存在的约束（生产独有表，随表漂移）', s.constraints.only_prod_on_prod_only_table, (x) => `${x.key}（${x.type}）：${x.def}`);
  listBlock('只在本地存在的约束（两侧都有的表）', s.constraints.only_local_on_shared_table, (x) => `${x.key}（${x.type}，validated=${x.validated}）：${x.def}`);
  listBlock('只在本地存在的约束（本地独有表，随表漂移）', s.constraints.only_local_on_local_only_table, (x) => `${x.key}（${x.type}）`);
  listBlock('约束定义不同', s.constraints.differing, (x) => `${x.key}：生产 ${x.prod_def} / 本地 ${x.local_def}`);
  listBlock('生产有外键但没有可用索引', s.constraints.prod_fk_without_index, (x) => `${x.table}.${x.constraint}（${x.columns.join(',')}）`);

  p(`## 4.1 同名表结构差异（补充核对：列的增删与类型）`);
  p();
  p(`- 两侧都有、但列不一致的表：${s.columns.count} 个`);
  p();
  for (const t of s.columns.shared_tables_with_column_drift) {
    p(`- **${t.table}**`);
    if (t.columns_only_prod.length) p(`  - 仅生产有：${t.columns_only_prod.join(', ')}`);
    if (t.columns_only_local.length) p(`  - 仅本地有：${t.columns_only_local.join(', ')}`);
    if (t.columns_type_or_nullable_changed.length) {
      p(`  - 类型/可空性不同：${t.columns_type_or_nullable_changed.map((c) => `${c.column}（生产 ${c.prod} / 本地 ${c.local}）`).join('；')}`);
    }
  }
  p();

  p(`## 5. 行级权限（RLS）`);
  p();
  listBlock('表只在生产存在', s.rls.tables_only_prod, (x) => x);
  listBlock('表只在本地存在', s.rls.tables_only_local, (x) => x);
  listBlock('RLS 开关不一致', s.rls.rls_differing, (x) => `${x.table}：生产=${x.prod_rls} / 本地=${x.local_rls}`);
  listBlock('生产未开 RLS 但 anon/authenticated 有写权限', s.rls.prod_no_rls_but_anon_authn_write, (x) => `${x.table}（${x.grantee}：${x.privileges}）`);
  listBlock('策略只在生产存在（两侧都有的表）', s.rls.policies_only_prod, (x) => `${x.key}（${x.cmd}，roles=${x.roles}，qual=${x.qual}）`);
  listBlock('策略只在生产存在（生产独有表，随表漂移）', s.rls.policies_only_prod_on_prod_only_table, (x) => `${x.key}（${x.cmd}，roles=${x.roles}）`);
  listBlock('策略只在本地存在（两侧都有的表）', s.rls.policies_only_local, (x) => `${x.key}（${x.cmd}，roles=${x.roles}，qual=${x.qual}）`);
  listBlock('策略只在本地存在（本地独有表，随表漂移）', s.rls.policies_only_local_on_local_only_table, (x) => `${x.key}（${x.cmd}，roles=${x.roles}）`);
  p(`### 策略条件不同（${s.rls.policies_differing.length}）`);
  p();
  if (!s.rls.policies_differing.length) p('无');
  for (const d of s.rls.policies_differing) {
    p(`- **${d.key}**：生产 cmd=${d.prod.cmd} roles=${d.prod.roles} qual=${d.prod.qual} / 本地 cmd=${d.local.cmd} roles=${d.local.roles} qual=${d.local.qual}`);
  }
  p();
  listBlock('表权限差异', s.rls.privileges_differing, (x) => (x.side === 'both' ? `${x.key}：生产=${x.prod} / 本地=${x.local}` : `${x.key}：仅${x.side === 'only_prod' ? '生产' : '本地'}有 ${x.privileges}`));

  p(`## 6. 函数执行权限`);
  p();
  p(`- 生产 SECURITY DEFINER 函数 ${s.functionPermissions.prod_security_definer.length} 个，本地 ${s.functionPermissions.local_security_definer.length} 个`);
  p(`- 生产 anon 可执行 ${s.functionPermissions.prod_anon_executable.length} 个，本地 ${s.functionPermissions.local_anon_executable.length} 个`);
  p(`- 启发式规则：函数体内出现 auth.uid()/is_admin/permission/role 等字样视为「有权限判断」，其余视为「未见权限判断」；转发到 _v2 的薄壳按「有判断」计（v2 内已核对有校验）`);
  p();
  listBlock('生产：SECURITY DEFINER 且 anon/authenticated 可执行、未见权限判断', s.functionPermissions.prod_secdef_exposed_without_permission_check, (x) => `${x.name}（anon=${x.anon_exec}，authenticated=${x.authn_exec}）`);
  listBlock('本地：SECURITY DEFINER 且 anon/authenticated 可执行、未见权限判断', s.functionPermissions.local_secdef_exposed_without_permission_check, (x) => `${x.name}（anon=${x.anon_exec}，authenticated=${x.authn_exec}）`);

  p(`## 7. 触发器与定时任务`);
  p();
  p(`- 生产触发器 ${s.triggers.prod_trigger_count} 个，本地 ${s.triggers.local_trigger_count} 个`);
  p(`- pg_cron：生产${s.triggers.cron_available_prod ? '可用' : '未安装'}，本地${s.triggers.cron_available_local ? '可用' : '未安装'}`);
  p();
  listBlock('触发器只在生产存在', s.triggers.only_prod, (x) => `${x.key}（enabled=${x.enabled}）`);
  listBlock('触发器只在本地存在', s.triggers.only_local, (x) => `${x.key}（enabled=${x.enabled}）`);
  listBlock('触发器定义不同', s.triggers.differing, (x) => `${x.key}（生产 enabled=${x.prod_enabled} / 本地 enabled=${x.local_enabled}）`);
  listBlock('生产定时任务', s.triggers.prod_cron_jobs, (x) => `#${x.jobid} ${x.jobname ?? ''} schedule=${x.schedule} active=${x.active} command=${String(x.command).slice(0, 160)}`);
  listBlock('本地定时任务', s.triggers.local_cron_jobs, (x) => `#${x.jobid} ${x.jobname ?? ''} schedule=${x.schedule} active=${x.active} command=${String(x.command).slice(0, 160)}`);

  p(`## 8. 风险排序`);
  p();
  p(`共 ${report.findings.length} 条：高 ${report.findings.filter((f) => f.severity === '高').length} / 中 ${report.findings.filter((f) => f.severity === '中').length} / 低 ${report.findings.filter((f) => f.severity === '低').length}`);
  p();
  for (const f of report.findings) {
    p(`- **[${f.severity}] ${f.area}**：${f.title} — ${f.detail}`);
  }
  p();
  p(`## 附录 A. 生产 SECURITY DEFINER 函数全量（anon/authenticated 可执行性）`);
  p();
  p(`| 函数 | anon 可执行 | authenticated 可执行 | 体内见权限判据 |`);
  p(`|---|---|---|---|`);
  for (const f of s.functionPermissions.prod_security_definer) {
    p(`| ${f.name} | ${f.anon_exec ? '是' : '否'} | ${f.authn_exec ? '是' : '否'} | ${f.has_permission_check ? '是' : '否'} |`);
  }
  p();
  p(`## 附录 B. 本地 SECURITY DEFINER 函数全量（anon/authenticated 可执行性）`);
  p();
  p(`| 函数 | anon 可执行 | authenticated 可执行 | 体内见权限判据 |`);
  p(`|---|---|---|---|`);
  for (const f of s.functionPermissions.local_security_definer) {
    p(`| ${f.name} | ${f.anon_exec ? '是' : '否'} | ${f.authn_exec ? '是' : '否'} | ${f.has_permission_check ? '是' : '否'} |`);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 30).join('\n'));
    return;
  }
  if (args.envFile) loadEnvFile(path.resolve(args.envFile));

  const prodUrl = process.env[args.prodUrlEnv];
  const localUrl = args.localUrl || process.env[args.localUrlEnv];
  if (!prodUrl) throw new Error(`缺少生产连接串：请设置环境变量 ${args.prodUrlEnv} 或用 --env-file 指定文件`);
  if (!localUrl) throw new Error(`缺少本地连接串：请设置环境变量 ${args.localUrlEnv}`);

  const allUrls = [prodUrl, localUrl];
  const prod = await connectReadOnly({ url: prodUrl, label: '生产', allUrls });
  const local = await connectReadOnly({ url: localUrl, label: '本地', allUrls });

  try {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    // pg 的 Client 不支持同连接并发 query（会乱序/告警），逐条顺序执行
    const collect = async (conn) => {
      const rub = async (sql) => (await conn.query(sql)).rows;
      return {
        info: await rub(SQL.dbInfo),
        migrations: await optionalQuery(conn, SQL.migrations),
        functions: await rub(SQL.functions),
        constraints: await rub(SQL.constraints),
        indexes: await rub(SQL.indexes),
        policies: await rub(SQL.policies),
        privileges: await rub(SQL.tablePrivileges),
        triggers: await rub(SQL.triggers),
        cron: await optionalQuery(conn, SQL.cronJobs),
        tables: await rub(SQL.tables),
        columns: await rub(SQL.columns),
      };
    };
    const prodData = await collect(prod);
    const localData = await collect(local);
    const prodTables = { rows: prodData.tables };
    const localTables = { rows: localData.tables };
    const prodFn = { rows: prodData.functions };
    const localFn = { rows: localData.functions };
    const prodMig = prodData.migrations;
    const localMig = localData.migrations;
    const prodCons = { rows: prodData.constraints };
    const localCons = { rows: localData.constraints };
    const prodIdx = { rows: prodData.indexes };
    const localIdx = { rows: localData.indexes };
    const prodPol = { rows: prodData.policies };
    const localPol = { rows: localData.policies };
    const prodPriv = { rows: prodData.privileges };
    const localPriv = { rows: localData.privileges };
    const prodTrig = { rows: prodData.triggers };
    const localTrig = { rows: localData.triggers };
    const prodCron = prodData.cron;
    const localCron = localData.cron;
    const prodInfo = { rows: prodData.info };
    const localInfo = { rows: localData.info };

    const requiredNames = args.requireTz ?? DEFAULT_REQUIRED_TZ_FUNCTIONS;
    const sections = {
      migrations: buildMigrationsSection({
        prod: prodMig, local: localMig,
        repoDir: path.join(repoRoot, 'supabase', 'migrations'),
        deferredDir: path.join(repoRoot, 'supabase', 'deferred-migrations'),
      }),
      functions: buildFunctionsSection({ prod: prodFn, local: localFn }),
      timezone: buildTimezoneSection({ prod: prodFn, local: localFn, requiredNames }),
      constraints: buildConstraintsSection({
        prod: prodCons, local: localCons, prodIndexes: prodIdx, localIndexes: localIdx,
        sharedTables: new Set(prodData.tables.map((t) => t.table_name).filter((t) => localData.tables.some((l) => l.table_name === t))),
      }),
      rls: buildRlsSection({
        prod: prodPol, local: localPol, prodTables, localTables,
        prodPrivs: prodPriv, localPrivs: localPriv,
      }),
      columns: buildColumnsSection({ prod: { rows: prodData.columns }, local: { rows: localData.columns } }),
      functionPermissions: buildFunctionPermissionSection({ prod: prodFn, local: localFn }),
      triggers: buildTriggersSection({ prod: prodTrig, local: localTrig, prodCron, localCron }),
    };

    const report = {
      generatedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
      sources: {
        prod: { host: prod.host, database: prodInfo.rows[0].database, server_version: prodInfo.rows[0].server_version, cron_extension: prodInfo.rows[0].cron_extension },
        local: { host: local.host, database: localInfo.rows[0].database, server_version: localInfo.rows[0].server_version, cron_extension: localInfo.rows[0].cron_extension },
      },
      sections,
      findings: [],
    };
    report.findings = buildFindings(sections);

    const md = buildMarkdown(report);
    const json = JSON.stringify(report, null, 2);

    if (args.json) {
      if (args.json === '-') console.log(json);
      else { fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true }); fs.writeFileSync(path.resolve(args.json), `${json}\n`); }
    }
    if (args.md) {
      fs.mkdirSync(path.dirname(path.resolve(args.md)), { recursive: true });
      fs.writeFileSync(path.resolve(args.md), `${md}\n`);
      console.log(`已写入：${path.resolve(args.md)}`);
    } else {
      console.log(md);
    }
  } finally {
    await prod.close();
    await local.close();
  }
}

main().catch((err) => {
  console.error(`对账失败：${err?.message ?? err}`);
  if (process.env.DBD_SIFT_DEBUG === '1') console.error(err?.stack);
  process.exit(1);
});

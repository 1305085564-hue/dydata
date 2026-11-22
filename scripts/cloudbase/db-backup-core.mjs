import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudBaseManager } from './cutover-cloudbase-driver.mjs';
import { PRIVATE_DIR_MODE, quoteIdentifier, quoteLiteral } from './cutover-core.mjs';

export const DEFAULT_EXPORT_ROOT = path.join(os.homedir(), '.local', 'share', 'dydata', 'db-export');
export const DEFAULT_KEY_PATH = path.join(os.homedir(), '.local', 'share', 'dydata', 'keys', '腾讯云CloudBase.txt');

/**
 * Login-account and identity tables in CloudBase `auth` schema needed to restore
 * who each user is and whether/how they can log in.
 */
export const DEFAULT_AUTH_TABLES = [
  'users',
  'identity',
  'mfa_factors',
  'org',
  'user_org',
  'client',
  'config',
  'provider',
];

export const AUTH_SKIP_REASONS = Object.freeze({
  token: 'ephemeral-session-token',
  provider_token: 'ephemeral-provider-token',
  apikey_token: 'ephemeral-api-key-token',
  authorized: 'ephemeral-oauth-grant',
  counter: 'runtime-rate-counter',
  audit_log_entries: 'auth-audit-log',
  user_visit_events: 'auth-visit-telemetry',
  user_visit_mau: 'auth-visit-aggregate',
  users_history: 'auth-history-log',
  custom_key: 'platform-signing-key-metadata',
  config_tpl: 'platform-template-config',
});

export const CATALOG_INVENTORY_SQL = `SELECT jsonb_build_object(
  'schemas', coalesce((
    SELECT jsonb_agg(n.nspname ORDER BY n.nspname)
    FROM pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
  ), '[]'::jsonb),
  'relations', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'kind', c.relkind,
      'bytes', pg_total_relation_size(c.oid),
      'estRows', c.reltuples::bigint,
      'columns', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'attnum', a.attnum,
          'formatType', format_type(a.atttypid, a.atttypmod),
          'udtSchema', tn.nspname,
          'udtName', t.typname,
          'notNull', a.attnotnull,
          'defaultExpr', pg_get_expr(ad.adbin, ad.adrelid),
          'identityGeneration', a.attidentity,
          'generatedKind', a.attgenerated,
          'generationExpr', CASE WHEN a.attgenerated <> '' THEN pg_get_expr(ad.adbin, ad.adrelid) ELSE NULL END
        ) ORDER BY a.attnum), '[]'::jsonb)
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_namespace tn ON tn.oid = t.typnamespace
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ),
      'primaryKey', (
        SELECT jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'formatType', format_type(a.atttypid, a.atttypmod)
        ) ORDER BY k.ord)
        FROM pg_constraint con
        CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
        WHERE con.conrelid = c.oid AND con.contype = 'p'
      ),
      'checkConstraints', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', con.conname,
          'definition', pg_get_constraintdef(con.oid, true)
        ) ORDER BY con.conname)
        FROM pg_constraint con
        WHERE con.conrelid = c.oid AND con.contype = 'c'
      ), '[]'::jsonb)
    ) ORDER BY n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  ), '[]'::jsonb)
)::text AS catalog;`;

/** Format YYYY-MM-DD-HHMM in Asia/Shanghai time for backup directory naming. */
export function formatShanghaiFolderName(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}-${byType.hour}${byType.minute}`;
}

/** Validate a PostgreSQL schema identifier passed from CLI flags. */
export function assertValidSchemaName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid schema name: ${String(name)}`);
  }
  if (name.startsWith('pg_') || name === 'information_schema') {
    throw new Error(`System schema cannot be exported: ${name}`);
  }
  return name;
}

/**
 * Ensure directory path is strictly outside repoRoot and created with 0700 permissions.
 */
export function ensurePrivateDirTree(directoryPath, { repoRoot = process.cwd() } = {}) {
  const resolved = path.resolve(directoryPath);
  const root = path.resolve(repoRoot);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Export directory must stay outside the repository: ${resolved}`);
  }
  const existing = statIfExists(resolved);
  if (existing) {
    if (!existing.isDirectory()) throw new Error(`Path exists and is not a directory: ${resolved}`);
    if ((existing.mode & 0o077) !== 0) {
      throw new Error(`Directory permissions must be owner-only (700): ${resolved}`);
    }
    return resolved;
  }
  const missingAncestors = [];
  let cursor = resolved;
  while (!existsSync(cursor)) {
    missingAncestors.unshift(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const dir of missingAncestors) {
    mkdirSync(dir, { mode: PRIVATE_DIR_MODE });
    chmodSync(dir, PRIVATE_DIR_MODE);
  }
  return resolved;
}

function statIfExists(targetPath) {
  try {
    return statSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** Locate installed @cloudbase/cloudbase-mcp module under $HOME/.npm/_npx if not set via env. */
export function findCloudBaseMcpModule(explicitPath = process.env.CLOUDBASE_MCP_MODULE) {
  if (explicitPath) {
    if (!existsSync(explicitPath)) throw new Error(`CLOUDBASE_MCP_MODULE not found: ${explicitPath}`);
    return explicitPath;
  }
  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  if (!existsSync(npxRoot)) {
    throw new Error('Cannot locate @cloudbase/cloudbase-mcp; set CLOUDBASE_MCP_MODULE');
  }
  for (const entry of readdirSync(npxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(npxRoot, entry.name, 'node_modules', '@cloudbase', 'cloudbase-mcp', 'dist', 'index.cjs');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot locate @cloudbase/cloudbase-mcp; set CLOUDBASE_MCP_MODULE');
}

/**
 * Create a strictly read-only CloudBase PG executor wrapped in BEGIN READ ONLY; ... COMMIT;.
 * Never prints or returns credentials.
 */
export async function createCloudBaseReadOnlyExecutor({
  repoRoot = process.cwd(),
  modulePath,
  keyPath = DEFAULT_KEY_PATH,
} = {}) {
  const { envId } = JSON.parse(readFileSync(path.join(repoRoot, 'cloudbaserc.json'), 'utf8'));
  const keyStat = statSync(keyPath);
  if ((keyStat.mode & 0o077) !== 0) {
    throw new Error(`Credential file permissions must be 600: ${keyPath}`);
  }
  const apiKey = readFileSync(keyPath, 'utf8').trim();
  if (!apiKey) throw new Error('CloudBase credential file is empty');
  process.env.CLOUDBASE_API_KEY = apiKey;
  process.env.CLOUDBASE_ENV_ID = envId;

  const resolvedModule = findCloudBaseMcpModule(modulePath);
  const manager = await loadCloudBaseManager(resolvedModule);

  const executeReadOnly = async (sql) => {
    const wrapped = `BEGIN READ ONLY; SET LOCAL timezone = 'UTC'; ${sql} COMMIT;`;
    const result = await manager.database.executePGSql({ Sql: wrapped });
    if (
      !result || typeof result !== 'object' || result.Error != null || result.error != null ||
      result.ok === false || result.success === false || result.isError === true
    ) {
      const detail = result?.Error ?? result?.error ?? result?.Message ?? 'Unknown executePGSql error';
      throw new Error(`executePGSql failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    return result;
  };

  return { envId, executeReadOnly };
}

/** Parse Rows array returned by CloudBase executePGSql into tuple arrays. */
export function parsePgRows(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('executePGSql returned invalid response');
  }
  if (result.Rows == null) return [];
  if (!Array.isArray(result.Rows)) {
    throw new Error('executePGSql returned invalid Rows payload');
  }
  return result.Rows.map((rowText) => {
    if (typeof rowText !== 'string') {
      throw new Error('executePGSql row entry is not a string');
    }
    const parsed = JSON.parse(rowText);
    if (!Array.isArray(parsed)) {
      throw new Error('executePGSql row tuple is not an array');
    }
    return parsed;
  });
}

/** Build a qualified "schema"."table" SQL identifier. */
export function qualifiedName(schema, table) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

export { quoteIdentifier, quoteLiteral };

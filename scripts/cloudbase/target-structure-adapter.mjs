#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { loadCloudBaseManager, parseReceiptLookup } from './cutover-cloudbase-driver.mjs';
import { runBatches } from './sql-batches.mjs';
import { isAuthorizedSourceIdentity } from './cutover-core.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const MANAGER_MODULE = '/Users/mac/.npm/_npx/88d9f76c32260533/node_modules/@cloudbase/cloudbase-mcp/dist/index.cjs';
export const FUNCTION_NAMES = [
  'admin_content_list_page', 'assign_ai_channel_sort_order', 'canonical_ai_model_id', 'cleanup_ai_call_attempts',
  'content_overall_grade_rank', 'create_ai_config_channel', 'enable_ai_config_supply', 'get_ai_call_stats',
  'get_fulfillment_range', 'get_leaderboard_rows', 'get_published_date_for_stats', 'is_admin', 'is_admin_or_owner',
  'is_owner', 'manage_ai_feature_lifecycle', 'record_ai_supply_failure', 'set_ai_channel_model_selection',
  'set_ai_feature_binding_canonical_model', 'set_ai_provider_key_model_canonical', 'swap_provider_key_model_order',
  'sync_ai_config_models', 'update_ai_config_model',
];

const FUNCTION_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),'definition'),'[]'::jsonb)::text AS result FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (${FUNCTION_NAMES.map((name) => `'${name}'`).join(',')});`;

export function ensureSqlStatement(statement) {
  const sql = String(statement).trimEnd();
  return sql.endsWith(';') ? `${sql}\n` : `${sql};\n`;
}

export function adaptFunctionDefinition(definition) {
  const adapted = String(definition).replaceAll('auth.uid()', '(auth.uid())::uuid').trimEnd();
  return ensureSqlStatement(adapted);
}

function phase(statement) {
  const upper = statement.trimStart().toUpperCase();
  if (/^(CREATE EXTENSION|CREATE SCHEMA|CREATE TABLE|ALTER TABLE .* ADD COLUMN)/s.test(upper)) return 'tables-columns';
  if (/^(CREATE OR REPLACE FUNCTION|CREATE FUNCTION)/s.test(upper)) return 'functions';
  if (/^(ALTER TABLE .* DROP CONSTRAINT|DROP TRIGGER)/s.test(upper)) return 'drop-dependencies';
  if (/^DROP INDEX/s.test(upper)) return 'drop-indexes';
  if (/^(ALTER TABLE .* ADD CONSTRAINT|DO \$\$)/s.test(upper)) return 'constraints';
  if (/^CREATE (UNIQUE )?INDEX/s.test(upper)) return 'indexes';
  if (/^CREATE TRIGGER/s.test(upper)) return 'triggers';
  throw new Error(`未登记的结构语句类型：${upper.slice(0, 80)}`);
}

export function orderStructureStatements(statements) {
  const phases = ['tables-columns', 'functions', 'drop-dependencies', 'drop-indexes', 'constraints', 'indexes', 'triggers'];
  const grouped = new Map(phases.map((name) => [name, []]));
  for (const statement of statements) grouped.get(phase(statement)).push(ensureSqlStatement(statement));
  return phases.flatMap((name) => grouped.get(name));
}

function sourceFunctionMap(functions) {
  return new Map(functions.map((fn) => [`${fn.name}|${fn.args}`, fn]));
}
function functionsFor(functions, name) {
  return [...functions.values()].filter((fn) => fn.name === name).map((fn) => adaptFunctionDefinition(fn.definition));
}

export function buildStructurePlan(sourceFunctions) {
  const functions = sourceFunctionMap(sourceFunctions);
  const raw = [
    `CREATE TABLE IF NOT EXISTS public.ai_provider_key_model_merge_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key_id uuid NOT NULL REFERENCES public.ai_provider_keys(id) ON DELETE CASCADE, canonical_model_id text NOT NULL, survivor_id uuid NOT NULL, discarded_ids uuid[] NOT NULL, survivor_model_id text NOT NULL, discarded_model_ids text[] NOT NULL, original_rows jsonb NOT NULL, decision text NOT NULL, transferred_references jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS public.ai_call_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), request_id uuid NOT NULL, attempt_no integer NOT NULL CHECK (attempt_no > 0), feature_key text, model_id text NOT NULL, key_model_id uuid, key_id uuid, is_success boolean NOT NULL, error_kind text, error_message text, duration_ms integer NOT NULL CHECK (duration_ms >= 0), is_probe boolean NOT NULL DEFAULT false)`,
    `ALTER TABLE public.ai_provider_key_models ADD COLUMN IF NOT EXISTS canonical_model_id text`,
    ...FUNCTION_NAMES.flatMap((name) => functionsFor(functions, name)),
    `ALTER TABLE public.ai_provider_key_models DROP CONSTRAINT IF EXISTS ai_provider_key_models_model_order_unique`,
    `ALTER TABLE public.ai_provider_key_models DROP CONSTRAINT IF EXISTS ai_provider_key_models_key_id_model_id_key`,
    `DROP TRIGGER IF EXISTS set_ai_provider_key_model_canonical ON public.ai_provider_key_models`,
    `DROP TRIGGER IF EXISTS set_ai_feature_binding_canonical_model ON public.ai_feature_bindings`,
    `DROP INDEX IF EXISTS public.idx_ai_provider_key_models_health`,
    `DROP INDEX IF EXISTS public.idx_ai_provider_key_models_global_state`,
    `DROP INDEX IF EXISTS public.idx_ai_provider_keys_provider_enabled`,
    `DROP INDEX IF EXISTS public.idx_ai_providers_enabled_priority`,
    `DROP INDEX IF EXISTS public.exemption_grant_request_date_unique`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_key_models_key_canonical_unique') THEN ALTER TABLE public.ai_provider_key_models ADD CONSTRAINT ai_provider_key_models_key_canonical_unique UNIQUE (key_id, canonical_model_id); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_key_models_canonical_order_unique') THEN ALTER TABLE public.ai_provider_key_models ADD CONSTRAINT ai_provider_key_models_canonical_order_unique UNIQUE (canonical_model_id, sort_order) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_provider_enabled_v2 ON public.ai_provider_keys (provider_id, is_enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled_v2 ON public.ai_providers (is_enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_provider_key_models_health ON public.ai_provider_key_models (canonical_model_id, is_enabled, consecutive_failures, unhealthy_until, last_failure_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS exemption_grant_active_request_date_unique ON public.exemption_grant (request_id, start_date) WHERE request_id IS NOT NULL AND status = 'active'`,
    `CREATE INDEX IF NOT EXISTS idx_ai_call_attempts_key_model_created_at ON public.ai_call_attempts (key_model_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_call_attempts_feature_created_at ON public.ai_call_attempts (feature_key, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_call_attempts_created_at ON public.ai_call_attempts (created_at DESC)`,
    `CREATE TRIGGER set_ai_provider_key_model_canonical BEFORE INSERT OR UPDATE OF model_id ON public.ai_provider_key_models FOR EACH ROW EXECUTE FUNCTION public.set_ai_provider_key_model_canonical()`,
    `CREATE TRIGGER set_ai_feature_binding_canonical_model BEFORE INSERT OR UPDATE OF model_id ON public.ai_feature_bindings FOR EACH ROW EXECUTE FUNCTION public.set_ai_feature_binding_canonical_model()`,
  ];
  const statements = orderStructureStatements(raw);
  return { statements, sql: statements.join('') };
}

export function buildRehearsalSql(plan) {
  return ['BEGIN;', 'SET LOCAL check_function_bodies = false;', 'SET LOCAL search_path = "pg_catalog", "public";', ...plan.statements, 'ROLLBACK;'].join('\n');
}

export function buildReceiptBatch(plan, batchId = 's2-structure-20261120') {
  return { id: batchId, sql: plan.sql };
}

export function objectSnapshotSql() {
  return `SELECT jsonb_build_object('receipts',(SELECT count(*) FROM dydata_migration.sql_batch_receipts WHERE batch_id LIKE 's2-structure-%'),'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')),'columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),'constraints',(SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'),'indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public'),'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')))::text AS result;`;
}

async function readSourceFunctions(sourceUrl) {
  const url = new URL(sourceUrl);
  const identity = { host: url.hostname, port: url.port || '5432', database: url.pathname.slice(1), user: decodeURIComponent(url.username) };
  if (!isAuthorizedSourceIdentity(identity)) throw new Error('来源身份不在授权范围');
  const client = new Client({ host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), ssl: { rejectUnauthorized: false }, application_name: 'dydata-target-structure-adapter-readonly' });
  await client.connect();
  try { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const result = await client.query(FUNCTION_SQL); await client.query('COMMIT'); return JSON.parse(result.rows[0].result); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
}
function parseCloudRows(result) { const tuple = JSON.parse(result.Rows[0]); return typeof tuple[0] === 'string' ? JSON.parse(tuple[0]) : tuple[0]; }
async function targetSql(manager, sql) { return manager.database.executePGSql({ Sql: `BEGIN READ ONLY; ${sql} COMMIT;` }); }
async function targetSnapshot(manager) { const result = await targetSql(manager, objectSnapshotSql()); return parseCloudRows(result); }
async function targetReceipt(manager, id) { const result = await manager.database.executePGSql({ Sql: `BEGIN READ ONLY; SELECT sha256 FROM dydata_migration.sql_batch_receipts WHERE batch_id='${id}'; COMMIT;` }); return parseReceiptLookup(result); }
function privateWrite(file, value) { mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); chmodSync(file, 0o600); }

async function main() {
  const sourceUrl = process.env.DYDATA_CUTOVER_SOURCE_URL;
  const beforePath = process.argv[process.argv.indexOf('--before') + 1];
  const mode = process.argv.includes('--rehearse') ? 'rehearse' : process.argv.includes('--execute-once') ? 'execute-once' : null;
  if (!sourceUrl || !beforePath || !mode) throw new Error('需要来源环境、--before 和 --rehearse 或 --execute-once');
  const sourceFunctions = await readSourceFunctions(sourceUrl);
  const plan = buildStructurePlan(sourceFunctions);
  const manager = await loadCloudBaseManager(MANAGER_MODULE);
  const before = await targetSnapshot(manager);
  const batch = buildReceiptBatch(plan);
  const planDigest = createHash('sha256').update(plan.sql).digest('hex');
  privateWrite(beforePath, { capturedAt: new Date().toISOString(), planDigest, before, statementCount: plan.statements.length });
  if (mode === 'rehearse') {
    await manager.database.executePGSql({ Sql: buildRehearsalSql(plan) });
    const after = await targetSnapshot(manager);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('演练回滚前后对象数量或回执数量变化');
    console.log(JSON.stringify({ mode, status: 'passed', planDigest, statementCount: plan.statements.length, before, after }));
    return;
  }
  if (await targetReceipt(manager, batch.id)) throw new Error('真实结构提交回执已存在，不允许再次执行');
  const execute = async (sql) => {
    const result = await manager.database.executePGSql({ Sql: sql });
    if (!result?.RequestId || result.Error || result.error || result.ok === false || result.success === false || result.isError === true) throw new Error('CloudBase 结构提交未确认');
    return result;
  };
  const lookupReceipt = async (id) => targetReceipt(manager, id);
  const result = await runBatches({ batches: [batch], execute, lookupReceipt, searchPath: ['pg_catalog', 'public'], stopOnExecutionError: true });
  console.log(JSON.stringify({ mode, status: result.status, planDigest, statementCount: plan.statements.length, batches: result.batches.map(({ id, status, requestId, ms }) => ({ id, status, requestId, ms: Math.round(ms) })) }));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) main().catch((error) => { console.error(`结构适配停止：${error.message}`); process.exitCode = 1; });

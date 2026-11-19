#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REPLAY_DATABASE = "dydata_replay";
const REPLAY_URL = `postgresql://postgres:postgres@127.0.0.1:54322/${REPLAY_DATABASE}`;
const root = process.cwd();
// 重放结果供后续 db:drift 和 real-db 测试继续使用，默认保留演练库。
// 需要清理时显式传 --drop，保留 --keep 作为兼容参数。
const keep = !process.argv.includes("--drop") || process.argv.includes("--keep");
const exceptionsPath = path.join(root, "supabase/migration-ledger-exceptions.json");
const migrationDir = path.join(root, "supabase/migrations");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const pgDump = existsSync(path.join(pgBin, "pg_dump")) ? path.join(pgBin, "pg_dump") : "pg_dump";
const psql = existsSync(path.join(pgBin, "psql")) ? path.join(pgBin, "psql") : "psql";
const createdb = existsSync(path.join(pgBin, "createdb")) ? path.join(pgBin, "createdb") : "createdb";
const dropdb = existsSync(path.join(pgBin, "dropdb")) ? path.join(pgBin, "dropdb") : "dropdb";
const commandEnv = { ...process.env, PGPASSWORD: "postgres" };
const startedAt = Date.now();

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    env: commandEnv,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    stdio: options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function psqlFile(databaseUrl, sql, label) {
  try {
    run(psql, ["--dbname", databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", "-"], { input: sql });
  } catch (error) {
    const detail = error?.stderr ? String(error.stderr).trim() : String(error?.message ?? error);
    throw new Error(`${label}失败：${detail}`);
  }
}

function readExceptions() {
  const raw = JSON.parse(readFileSync(exceptionsPath, "utf8"));
  const skip = new Set((raw.replay_skip ?? []).map((item) => item.version));
  const notApplied = new Set((raw.not_applied ?? []).map((item) => item.version));
  return { skip: new Set([...skip, ...notApplied]), preSql: new Set((raw.replay_pre_sql ?? []).map((item) => item.version)) };
}

function migrationFiles() {
  return readdirSync(migrationDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
}

function migrationVersion(file) {
  return file.match(/^(\d+)_/)?.[1] ?? file;
}

function migrationName(file) {
  return file.replace(/^\d+_/, '').replace(/\.sql$/, '');
}

function preSql(version) {
  if (version !== "20261005024700") return "";
  return `
do $$
begin
  if to_regclass('public.script_document') is not null
    and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'script_document' and policyname = 'script_document_public_read'
    ) then
    create policy script_document_public_read on public.script_document for select to public using (true);
  end if;
  if to_regclass('public.tag_definition') is not null
    and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tag_definition' and policyname = 'tag_definition_read'
    ) then
    create policy tag_definition_read on public.tag_definition for select to public using (true);
  end if;
end $$;
`;
}

function dropReplay() {
  run(dropdb, ["--if-exists", "--host", "127.0.0.1", "--port", "54322", "--username", "postgres", REPLAY_DATABASE]);
}

function createReplay() {
  run(createdb, ["--host", "127.0.0.1", "--port", "54322", "--username", "postgres", REPLAY_DATABASE]);
}

function assertLocal() {
  const url = new URL(LOCAL_URL);
  if (url.hostname !== "127.0.0.1" || url.port !== "54322") {
    throw new Error("db:replay 只允许连接 127.0.0.1:54322");
  }
}

function bootstrap() {
  const dump = run(pgDump, ["--dbname", LOCAL_URL, "--schema-only", "--no-owner", "--no-privileges", "--schema", "auth", "--schema", "storage"], { encoding: "buffer" });
  psqlFile(REPLAY_URL, `
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist schema public;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text not null
);
alter default privileges for role postgres in schema public revoke execute on functions from public;
revoke execute on all functions in schema public from public;
`, "扩展与迁移账本初始化");
  psqlFile(REPLAY_URL, dump, "auth/storage 结构导入");
}

function main() {
  assertLocal();
  const exceptions = readExceptions();
  const files = migrationFiles();
  dropReplay();
  createReplay();
  try {
    bootstrap();
    let passed = 0;
    const skipped = [];
    for (const file of files) {
      const version = migrationVersion(file);
      if (exceptions.skip.has(version)) {
        skipped.push(file);
        continue;
      }
      const sql = `${exceptions.preSql.has(version) ? preSql(version) : ""}\n${readFileSync(path.join(migrationDir, file), "utf8")}`;
      psqlFile(REPLAY_URL, sql, file);
      psqlFile(REPLAY_URL, `insert into supabase_migrations.schema_migrations(version, name)
values ('${version}', '${migrationName(file).replaceAll("'", "''")}')
on conflict (version) do update set name = excluded.name;`, `${file} 迁移记账`);
      passed += 1;
    }
    psqlFile(REPLAY_URL, `
revoke execute on all functions in schema public from public;
grant execute on function public.assign_ai_channel_sort_order() to public, anon, authenticated, service_role;
grant execute on function public.canonical_ai_model_id(text) to public, anon, authenticated, service_role;
grant execute on function public.get_leaderboard_rows(date, date) to anon;
grant execute on function public.get_published_date_for_stats(timestamptz, date) to anon;
grant execute on function public.preserve_daily_report_manual_source() to public, anon, authenticated, service_role;
grant execute on function public.publish_drafts_set_updated_at() to public, anon, authenticated, service_role;
grant execute on function public.reset_ai_channel_failure_window_on_success() to public, anon, authenticated, service_role;
grant execute on function public.set_ai_feature_binding_canonical_model() to public, anon, authenticated, service_role;
grant execute on function public.set_ai_feature_config_updated_at() to public, anon, authenticated, service_role;
grant execute on function public.set_ai_provider_key_model_canonical() to public, anon, authenticated, service_role;
grant execute on function public.set_rewrite_updated_at() to public, anon, authenticated, service_role;
grant execute on function public.set_violation_case_script_hash() to public, anon, authenticated, service_role;
grant execute on function public.touch_updated_at() to public, anon, authenticated, service_role;
grant execute on function public.clear_fulfillment_absent_after_daily_report() to service_role;
grant execute on function public.content_overall_grade_rank(numeric, numeric, numeric, jsonb) to service_role;
grant execute on function public.exemption_target_in_active_scope(uuid, uuid, text) to authenticated;
grant execute on function public.guard_profile_exemption_projection() to service_role;
grant execute on function public.guard_profile_membership_lifecycle() to service_role;
`, "函数默认授权收口");
    console.log(JSON.stringify({ status: "PASS", passed, skipped: skipped.length, skippedFiles: skipped, failed: 0, elapsedMs: Date.now() - startedAt, database: REPLAY_DATABASE }, null, 2));
  } finally {
    if (!keep) dropReplay();
  }
}

try {
  main();
} catch (error) {
  console.error(`db:replay 失败：${error instanceof Error ? error.message : error}`);
  if (!keep) {
    try { dropReplay(); } catch { /* keep the original failure */ }
  }
  process.exit(1);
}


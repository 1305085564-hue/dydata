import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260903153000_fix_fulfillment_appeal_drop_group_refs.sql",
);

function migrationSql() {
  assert.equal(existsSync(migrationPath), true, "必须新增 migration 修复 handle_fulfillment_appeal");
  return readFileSync(migrationPath, "utf8");
}

test("handle_fulfillment_appeal migration removes deleted profiles.group_id dependency", () => {
  const sql = migrationSql();
  const functionSql = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_fulfillment_appeal"));

  assert.match(functionSql, /CREATE OR REPLACE FUNCTION public\.handle_fulfillment_appeal/i);
  assert.match(functionSql, /SELECT\s+team_id\s+INTO\s+member_team_id\s+FROM\s+public\.profiles/i);
  assert.doesNotMatch(functionSql, /profiles[\s\S]{0,120}group_id/i);
  assert.doesNotMatch(functionSql, /member_group_id/i);
  assert.match(functionSql, /group_id\s*\)\s*VALUES[\s\S]*member_team_id,\s*NULL/i);
  assert.match(functionSql, /group_id\s*=\s*NULL/i);
});

test("handle_fulfillment_appeal migration keeps appeal closeout and audit semantics", () => {
  const sql = migrationSql();

  assert.match(sql, /WHERE\s+id\s*=\s*p_appeal_id[\s\S]*FOR UPDATE/i);
  assert.match(sql, /appeal_record\.status\s*<>\s*'pending'/i);
  assert.match(sql, /UPDATE public\.fulfillment_appeals[\s\S]*status = resolved_status/i);
  assert.match(sql, /'handle_fulfillment_appeal'/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.handle_fulfillment_appeal\(uuid, text, uuid\) FROM PUBLIC, anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.handle_fulfillment_appeal\(uuid, text, uuid\) TO authenticated, service_role/i);
});

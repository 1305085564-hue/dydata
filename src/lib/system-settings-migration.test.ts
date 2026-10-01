import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261001040618_system_settings_service_role_only.sql",
);

function migrationSql() {
  assert.equal(existsSync(migrationPath), true, "system_settings 权限收口 migration 必须存在");
  return readFileSync(migrationPath, "utf8");
}

test("system_settings 撤掉浏览器角色权限，只保留 service_role 数据库访问", () => {
  const sql = migrationSql();

  assert.match(sql, /^(?:\s*--[^\n]*\n)*\s*begin;[\s\S]*commit;\s*$/i);
  assert.match(sql, /drop policy if exists ["']Admins manage system settings["']/i);
  assert.match(sql, /revoke all on table public\.system_settings from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.system_settings to service_role/i);
  assert.match(
    sql,
    /create policy ["']Service role full access on system_settings["'][\s\S]*?to service_role[\s\S]*?using \(true\)[\s\S]*?with check \(true\)/i,
  );
  assert.doesNotMatch(sql, /create policy [\s\S]*?to authenticated/i);
});

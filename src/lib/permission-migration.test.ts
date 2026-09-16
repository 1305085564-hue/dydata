import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { PERMISSION_CONTRACT } from "./permission-contract";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((name) => name.endsWith("_unify_permission_functions.sql"))
  .sort()
  .at(-1);

assert.ok(migrationName, "统一权限 migration 必须存在");

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

const inactiveFallbackMigrationName = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .filter((name) => name.endsWith("_fix_has_permission_inactive_false.sql"))
  .sort()
  .at(-1);

function permissionsFrom(fragment: string) {
  return [...fragment.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
}

function branch(pattern: RegExp, message: string) {
  const value = sql.match(pattern)?.[1];
  assert.ok(value, message);
  return value;
}

test("SQL 角色权限数组与 TypeScript 契约一致", () => {
  const groupMode = branch(/if p_group_mode then\s+return array\[([\s\S]*?)\];/i, "缺少集团权限分支");
  const member = branch(/when 'member' then\s+return array\[([\s\S]*?)\];/i, "缺少 member 权限分支");
  const admin = branch(/when 'admin' then\s+return array\[([\s\S]*?)\];/i, "缺少 admin 权限分支");
  const owner = branch(/when '(?:company_owner|owner)' then\s+return array\[([\s\S]*?)\];/i, "缺少 owner 权限分支");

  assert.deepEqual(permissionsFrom(groupMode), [...PERMISSION_CONTRACT.groupMode.permissions].sort());
  assert.deepEqual(permissionsFrom(member), [...PERMISSION_CONTRACT.roles.member].sort());
  assert.deepEqual(permissionsFrom(admin), [...PERMISSION_CONTRACT.roles.admin].sort());
  assert.deepEqual(permissionsFrom(owner), [...PERMISSION_CONTRACT.roles.company_owner].sort());
});

test("has_permission 不在缺少集团令牌时隐式放大全局权限", () => {
  const hasPermission = branch(
    /create or replace function public\.has_permission\(perm text\)([\s\S]*?)\$\$;/i,
    "缺少 has_permission",
  );

  assert.match(hasPermission, /get_role_permissions\([\s\S]*?,\s*false\s*\)/i);
  assert.doesNotMatch(hasPermission, /group_mode_sessions|is_group_mode_active/i);
  assert.match(hasPermission, /membership_status[\s\S]*?=\s*'active'/i);
  assert.match(hasPermission, /set search_path\s*=\s*''/i);
});

test("旧数据库角色入口统一拒绝归档账号并收紧函数执行权", () => {
  assert.match(sql, /create or replace function public\.is_admin\(\)[\s\S]*?membership_status[\s\S]*?=\s*'active'/i);
  assert.match(sql, /create or replace function public\.is_owner\(\)[\s\S]*?membership_status[\s\S]*?=\s*'active'/i);
  assert.match(sql, /create or replace function public\.is_admin_or_owner\(\)[\s\S]*?membership_status[\s\S]*?=\s*'active'/i);
  assert.match(sql, /revoke all on function public\.has_permission\(text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.has_permission\(text\) to authenticated, service_role/i);
});

test("has_permission 对归档或缺失身份明确返回 false", () => {
  assert.ok(inactiveFallbackMigrationName, "缺少 has_permission inactive fallback migration");
  const fallbackSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations", inactiveFallbackMigrationName),
    "utf8",
  );

  assert.match(fallbackSql, /coalesce\s*\(\s*\(\s*select[\s\S]*?\)\s*,\s*false\s*\)/i);
  assert.match(fallbackSql, /membership_status[\s\S]*?=\s*'active'/i);
  assert.match(fallbackSql, /revoke all on function public\.has_permission\(text\) from public, anon/i);
});

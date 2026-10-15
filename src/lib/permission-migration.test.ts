import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { PERMISSION_CONTRACT } from "./permission-contract";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016090000_remove_group_mode.sql"),
  "utf8",
);

function permissionsFrom(fragment: string) {
  return [...fragment.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
}

function branch(pattern: RegExp, message: string) {
  const value = sql.match(pattern)?.[1];
  assert.ok(value, message);
  return value;
}

test("SQL 角色权限数组与 TypeScript 契约一致，且只有公司范围角色", () => {
  const member = branch(/when 'member' then return array\[([\s\S]*?)\];/i, "缺少 member 权限分支");
  const admin = branch(/when 'admin' then return array\[([\s\S]*?)\];/i, "缺少 admin 权限分支");
  const owner = branch(/when 'company_owner' then return array\[([\s\S]*?)\];/i, "缺少 owner 权限分支");

  assert.deepEqual(permissionsFrom(member), [...PERMISSION_CONTRACT.roles.member].sort());
  assert.deepEqual(permissionsFrom(admin), [...PERMISSION_CONTRACT.roles.admin].sort());
  assert.deepEqual(permissionsFrom(owner), [...PERMISSION_CONTRACT.roles.company_owner].sort());
  assert.doesNotMatch(sql.match(/create or replace function public\.get_role_permissions[\s\S]*?\$\$;/i)?.[0] ?? "", /p_group_mode|is_group_mode_active/i);
});

test("has_permission 只读取在职账号的固定公司角色权限", () => {
  const hasPermission = branch(
    /create or replace function public\.has_permission\(perm text\)([\s\S]*?)\$\$;/i,
    "缺少 has_permission",
  );

  assert.match(hasPermission, /get_role_permissions\(public\.company_role_for_user\(p\.id\)\)/i);
  assert.match(hasPermission, /membership_status[\s\S]*?=\s*'active'/i);
  assert.match(hasPermission, /set search_path\s*=\s*''/i);
});

test("集团会话、资格表和旧令牌函数全部移除", () => {
  assert.match(sql, /drop table if exists public\.group_mode_sessions cascade/i);
  assert.match(sql, /drop table if exists public\.group_permission_qualifications cascade/i);
  assert.match(sql, /drop function if exists public\.is_group_mode_active\(text\)/i);
  assert.match(sql, /drop function if exists public\.has_group_owner_qualification\(uuid\)/i);
  assert.match(sql, /drop function if exists public\.visible_user_ids_v2\(uuid, text\)/i);
  assert.match(sql, /drop function if exists public\.exemption_target_in_active_scope\(uuid, uuid, text\)/i);
  assert.match(sql, /update public\.profiles set data_scope = 'team' where data_scope = 'all'/i);
  assert.match(sql, /check \(data_scope in \('self', 'team'\)\)/i);
});

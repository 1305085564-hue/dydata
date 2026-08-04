import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260805100000_member_lifecycle_write_protection.sql", import.meta.url),
  "utf8",
);
const lifecycleSql = readFileSync(
  new URL("../../supabase/migrations/20260805113000_member_lifecycle_production_compat.sql", import.meta.url),
  "utf8",
);

test("生命周期安全迁移幂等地重申 profiles 的 authenticated 写权限边界", () => {
  assert.match(sql, /revoke update, insert on table public\.profiles from authenticated/i);
  assert.match(sql, /grant update \(name\) on table public\.profiles to authenticated/i);
  assert.match(sql, /revoke update \(\s*membership_status,\s*archived_at,\s*archived_by,\s*archive_reason,\s*archive_snapshot\s*\) on table public\.profiles from authenticated/i);
  assert.match(sql, /create or replace function public\.guard_profile_membership_lifecycle/i);
  assert.match(sql, /drop trigger if exists guard_profile_membership_lifecycle on public\.profiles/i);
  assert.match(sql, /auth\.role\(\)[\s\S]*service_role/i);
});

test("生命周期写保护只允许 service_role 绕过，不能改变 profiles.status", () => {
  assert.match(sql, /before update of membership_status, archived_at, archived_by, archive_reason, archive_snapshot/i);
  assert.doesNotMatch(sql, /profiles\.status\s+is distinct from/i);
  assert.doesNotMatch(sql, /update public\.profiles[\s\S]*set[\s\S]*status\s*=/i);
});

test("生命周期日志索引匹配生产 member_change_log 的真实字段", () => {
  assert.match(lifecycleSql, /member_change_log\(profile_id, changed_at desc\)/i);
  assert.match(lifecycleSql, /drop index if exists public\.idx_member_change_log_user_effective_at/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260718113000_atomic_exemption_approval.sql", import.meta.url),
  "utf8",
);

test("豁免 RPC 只信任 auth.uid 并在数据库内校验 manage_members 与团队范围", () => {
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /has_permission\('manage_members'\)/i);
  assert.match(sql, /team_id\s+is\s+distinct\s+from/i);
  assert.match(sql, /errcode\s*=\s*'42501'/i);
  assert.doesNotMatch(sql, /p_actor_user_id|p_reviewer_id|p_team_id|p_profile_status|p_profile_exempt_type/i);
});

test("豁免审批锁定申请并一次完成授予、profile 投影和审核状态", () => {
  assert.match(sql, /from public\.exemption_request[\s\S]*for update/i);
  assert.match(sql, /insert into public\.exemption_grant/i);
  assert.match(sql, /update public\.profiles/i);
  assert.match(sql, /request_status\s*=\s*p_decision/i);
});

test("豁免 RPC 移除旧 14 参数签名且只授权 authenticated", () => {
  assert.match(sql, /drop function if exists public\.approve_exemption_request_atomically/i);
  assert.match(sql, /revoke all on function[\s\S]*from public/i);
  assert.match(sql, /revoke all on function[\s\S]*from anon/i);
  assert.match(sql, /grant execute on function[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /to service_role/i);
});

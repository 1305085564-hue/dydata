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
  assert.match(sql, /groups managed_group[\s\S]*leader_user_id = v_actor\.id/i);
  assert.match(sql, /team_id\s+is\s+distinct\s+from/i);
  assert.match(sql, /errcode\s*=\s*'42501'/i);
  assert.doesNotMatch(sql, /p_actor_user_id|p_reviewer_id|p_team_id|p_profile_status|p_profile_exempt_type/i);
});

test("永久豁免日期与申请授权保持数据库级不变量", () => {
  assert.match(sql, /exemption_grant_request_id_unique[\s\S]*where request_id is not null/i);
  assert.match(
    sql,
    /p_grant_type = 'permanent'[\s\S]*p_grant_start_date is null or p_grant_end_date is not null[\s\S]*豁免日期不正确/i,
  );
  assert.match(
    sql,
    /v_request\.exemption_type = 'permanent'[\s\S]*v_request\.start_date is null or v_request\.end_date is not null[\s\S]*豁免日期不正确/i,
  );
});

test("豁免审批锁定申请并一次完成授予、profile 投影和审核状态", () => {
  assert.match(sql, /from public\.exemption_request[\s\S]*for update/i);
  assert.match(sql, /insert into public\.exemption_grant/i);
  assert.match(sql, /update public\.profiles/i);
  assert.match(sql, /request_status\s*=\s*p_decision/i);
});

test("authenticated 不能绕过 RPC 直接审核、写 grant 或改 profile 豁免投影", () => {
  assert.doesNotMatch(sql, /on public\.exemption_request[\s\S]{0,80}for update[\s\S]{0,80}to authenticated/i);
  assert.doesNotMatch(sql, /on public\.exemption_grant[\s\S]{0,80}for (insert|update|delete)[\s\S]{0,80}to authenticated/i);
  assert.match(sql, /guard_profile_exemption_projection/i);
  assert.match(sql, /dydata\.exemption_write_authorized/i);
  assert.match(sql, /auth\.role\(\)[\s\S]*service_role/i);
  assert.match(sql, /revoke update, insert on table public\.profiles from authenticated/i);
  assert.match(sql, /grant update \(name\) on table public\.profiles to authenticated/i);
});

test("豁免参数显式拒绝 NULL，拒绝申请不被过期团队快照卡死", () => {
  assert.match(sql, /p_grant_type is null[\s\S]*p_grant_type not in/i);
  assert.match(sql, /p_exemption_category is null[\s\S]*p_exemption_category not in/i);
  assert.match(sql, /p_decision is null[\s\S]*p_decision not in/i);
  assert.match(sql, /if p_decision = 'approved' then[\s\S]*v_request\.team_id is distinct from v_target\.team_id/i);
});

test("豁免 RPC 移除旧 14 参数签名且只授权 authenticated", () => {
  assert.match(sql, /drop function if exists public\.approve_exemption_request_atomically/i);
  assert.match(sql, /revoke all on function[\s\S]*from public/i);
  assert.match(sql, /revoke all on function[\s\S]*from anon/i);
  assert.match(sql, /grant execute on function[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /to service_role/i);
});

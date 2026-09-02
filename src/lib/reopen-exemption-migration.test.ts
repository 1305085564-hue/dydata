import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reopenSql = readFileSync(
  new URL("../../supabase/migrations/20260902210000_exemption_reopen_to_pending.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/exemptions/reopen/route.ts", import.meta.url),
  "utf8",
);
const wrapper = readFileSync(
  new URL("./exemption-review.ts", import.meta.url),
  "utf8",
);

test("打回 migration 删除旧改判 RPC 并新建安全定义函数", () => {
  assert.match(reopenSql, /drop function if exists public\.re_review_exemption_request_atomically/i);
  assert.match(reopenSql, /create or replace function public\.reopen_exemption_request_atomically/i);
  assert.match(reopenSql, /security definer/i);
  assert.match(reopenSql, /revoke all on function public\.reopen_exemption_request_atomically[\s\S]*from public, anon, service_role/i);
  assert.match(reopenSql, /grant execute on function public\.reopen_exemption_request_atomically[\s\S]*to authenticated/i);
});

test("打回 RPC 校验登录会话、权限与管理范围，禁止自审", () => {
  assert.match(reopenSql, /auth\.uid\(\) is null[\s\S]*42501/i);
  assert.match(reopenSql, /has_permission\('manage_fulfillment'\)[\s\S]*has_permission\('review_violations'\)[\s\S]*is_group_mode_active/i);
  assert.match(reopenSql, /v_request\.applicant_user_id = auth\.uid\(\)[\s\S]*exemption_target_in_active_scope\(auth\.uid\(\), v_request\.applicant_user_id/i);
  assert.match(reopenSql, /membership_status[\s\S]*archived/i);
});

test("打回 RPC 只允许已审批申请，且先做重叠 pending 校验", () => {
  assert.match(reopenSql, /v_request\.request_status not in \('approved', 'rejected'\)[\s\S]*仅支持打回已审批的申请/i);
  assert.match(reopenSql, /other\.request_status = 'pending'[\s\S]*daterange\(v_request\.start_date[\s\S]*&&[\s\S]*无法打回/i);
});

test("打回 RPC 整单重置：明细回 pending、grant 全停用、申请单回 pending", () => {
  assert.match(reopenSql, /insert into public\.exemption_request_date[\s\S]*'pending'[\s\S]*on conflict \(request_id, request_date\) do nothing/i);
  assert.match(reopenSql, /update public\.exemption_request_date[\s\S]*set status = 'pending', feedback = null, reviewed_by = null, reviewed_at = null/i);
  assert.match(reopenSql, /update public\.exemption_grant[\s\S]*set status = 'inactive'[\s\S]*where request_id = p_request_id and status = 'active'/i);
  assert.match(reopenSql, /update public\.exemption_request[\s\S]*set request_status = 'pending', reviewed_by = null, reviewed_at = null/i);
});

test("打回 RPC 依据剩余 active grant 重算 Profile 投影", () => {
  assert.match(reopenSql, /order by \(grant_row\.grant_type = 'permanent'\) desc, grant_row\.created_at desc/i);
  assert.match(reopenSql, /v_remaining_grant\.id is null then[\s\S]*status = 'active'[\s\S]*exempt_type = null/i);
  assert.match(reopenSql, /v_remaining_grant\.grant_type = 'permanent' then[\s\S]*status = 'exempt'[\s\S]*exempt_type = 'permanent'/i);
  assert.match(reopenSql, /set_config\('dydata\.exemption_write_authorized', '1', true\)/i);
});

test("打回路由复用登录会话调用受限 RPC，不把 service-role 当普通用户会话", () => {
  assert.match(route, /supabase: auth\.supabase/i);
  assert.match(route, /reopenExemptionRequestAtomically/i);
  assert.match(route, /groupModeTokenHash: auth\.actor\?\.groupModeTokenHash/i);
  assert.doesNotMatch(route, /adminSupabase[\s\S]*reopenExemptionRequestAtomically/i);
});

test("exemption-review 包装暴露打回 RPC 且带安全错误映射", () => {
  assert.match(wrapper, /export async function reopenExemptionRequestAtomically/i);
  assert.match(wrapper, /rpc\("reopen_exemption_request_atomically",/i);
  assert.match(wrapper, /仅支持打回已审批的申请/i);
  assert.match(wrapper, /该成员已有重叠的待审批申请，无法打回/i);
  assert.doesNotMatch(wrapper, /re_review_exemption_request_atomically/i);
});

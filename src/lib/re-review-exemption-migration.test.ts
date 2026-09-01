import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260901120000_re_review_exemption_atomically.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/exemptions/re-review/route.ts", import.meta.url),
  "utf8",
);
const wrapper = readFileSync(
  new URL("./exemption-review.ts", import.meta.url),
  "utf8",
);

type ProjectionGrant = {
  requestId: string | null;
  category: "waive" | "leave";
};

type ProjectionRequest = {
  id: string;
  category: "waive" | "leave";
  reason: string | null;
};

/** Mirrors the migration's one-row grant LEFT JOIN contract for regression data. */
function projectRemainingGrant(
  grant: ProjectionGrant,
  requests: readonly ProjectionRequest[],
) {
  const request = grant.requestId === null
    ? undefined
    : requests.find((candidate) => candidate.id === grant.requestId);

  return {
    reason: request?.reason ?? null,
    category: request?.category ?? grant.category,
  };
}

test("改判 RPC 是安全定义函数且拒绝匿名/服务角色直接执行", () => {
  assert.match(sql, /create or replace function public\.re_review_exemption_request_atomically/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.re_review_exemption_request_atomically[\s\S]*from public, anon, service_role/i);
  assert.match(sql, /grant execute on function public\.re_review_exemption_request_atomically[\s\S]*to authenticated/i);
});

test("改判 RPC 通过 auth.uid 校验登录会话并复用权限与范围检查", () => {
  assert.match(sql, /auth\.uid\(\) is null[\s\S]*42501/i);
  assert.match(sql, /is_group_mode_active[\s\S]*has_permission\('manage_fulfillment'\)[\s\S]*has_permission\('review_violations'\)/i);
  assert.match(sql, /exemption_target_in_active_scope\(auth\.uid\(\), auth\.uid\(\)/i);
  assert.match(sql, /exemption_target_in_active_scope\(auth\.uid\(\), request_row\.applicant_user_id/i);
});

test("改判 RPC 锁定申请行并禁止自审、归档成员与跨团队", () => {
  assert.match(sql, /from public\.exemption_request request_row[\s\S]*applicant_user_id <> auth\.uid\(\)[\s\S]*for update of request_row/i);
  assert.match(sql, /membership_status[\s\S]*archived/i);
  assert.match(sql, /not found then[\s\S]*raise exception using errcode = 'P0002', message = '申请不存在'/i);
});

test("改判 RPC 只允许 approved/rejected 状态且必须改为相反决策", () => {
  assert.match(sql, /v_request\.request_status not in \('approved', 'rejected'\)[\s\S]*仅支持改判已审批的申请/i);
  assert.match(sql, /v_request\.request_status = p_decision[\s\S]*该申请已处理/i);
});

test("拒绝改判只停用当前 request 对应的 grant，不误伤其他日期", () => {
  assert.match(sql, /where grant_row\.request_id = p_request_id[\s\S]*for update of grant_row/i);
  assert.match(sql, /v_grant\.status = 'active' then[\s\S]*set status = 'inactive'[\s\S]*where id = v_grant\.id/i);
});

test("通过改判恢复当前 request 的 grant（UPDATE 既有行避开部分唯一索引）或补插", () => {
  assert.match(sql, /set[\s\S]*user_id = v_target\.id[\s\S]*status = 'active'[\s\S]*where id = v_grant\.id/i);
  assert.match(sql, /insert into public\.exemption_grant \([\s\S]*v_request\.id, v_target\.id[\s\S]*'active'[\s\S]*returning id into v_grant_id/i);
});

test("改判 RPC 依据剩余 active grant 重算 Profile 投影", () => {
  assert.match(sql, /order by \(grant_row\.grant_type = 'permanent'\) desc, grant_row\.created_at desc/i);
  assert.match(sql, /v_remaining_grant\.grant_type = 'permanent' then[\s\S]*status = 'exempt'[\s\S]*exempt_type = 'permanent'/i);
  assert.match(sql, /v_remaining_grant\.id is null then[\s\S]*exempt_type = null[\s\S]*exemption_category = null/i);
  assert.match(sql, /set_config\('dydata\.exemption_write_authorized', '1', true\)/i);
});

test("剩余手工 Grant 与断链 Grant 保留自身分类，关联申请才补充分类和原因", () => {
  const manual = projectRemainingGrant(
    { requestId: null, category: "leave" },
    [],
  );
  assert.deepEqual(manual, { reason: null, category: "leave" });

  const brokenLink = projectRemainingGrant(
    { requestId: "missing-request", category: "waive" },
    [],
  );
  assert.deepEqual(brokenLink, { reason: null, category: "waive" });

  const requestBacked = projectRemainingGrant(
    { requestId: "request-1", category: "waive" },
    [{ id: "request-1", category: "leave", reason: "病假" }],
  );
  assert.deepEqual(requestBacked, { reason: "病假", category: "leave" });
  assert.match(sql, /when request_row\.id is null then grant_row\.exemption_category/i);
  assert.match(
    sql,
    /from public\.exemption_grant grant_row\s+left join public\.exemption_request request_row/i,
  );
});

test("改判路由复用登录会话调用受限 RPC，不把 service-role 当普通用户会话", () => {
  assert.match(route, /supabase: auth\.supabase/i);
  assert.match(route, /reReviewExemptionRequestAtomically/i);
  assert.match(route, /groupModeTokenHash: auth\.actor\?\.groupModeTokenHash/i);
  // service-role 只用于直接表查询，不能出现在改判调用里
  assert.doesNotMatch(route, /adminSupabase[\s\S]*reReviewExemptionRequestAtomically/i);
});

test("exemption-review 包装暴露改判 RPC 且带安全错误映射", () => {
  assert.match(wrapper, /export async function reReviewExemptionRequestAtomically/i);
  assert.match(wrapper, /rpc\("re_review_exemption_request_atomically",/i);
  assert.match(wrapper, /仅支持改判已审批的申请/i);
});

test("迁移同时加跨实例防重范围约束（btree_gist 排除约束）", () => {
  assert.match(sql, /create extension if not exists btree_gist/i);
  assert.match(sql, /add constraint exemption_request_no_overlap_pending/i);
  assert.match(sql, /exclude using gist[\s\S]*applicant_user_id with =[\s\S]*daterange\(start_date, coalesce\(end_date, start_date\), '\[\]'\) with &&/i);
  assert.match(sql, /where \(request_status = 'pending'\)/i);
  assert.ok(
    sql.indexOf("do $$") < sql.indexOf("drop constraint if exists exemption_request_no_overlap_pending"),
    "既有 pending 重叠必须在约束变更前中止 migration",
  );
});

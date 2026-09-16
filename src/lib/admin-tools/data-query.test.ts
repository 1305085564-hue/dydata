import test from "node:test";
import assert from "node:assert/strict";

import { getAnomalousData, getTaskStatus, getUserInfo } from "./data-query";

function createFakeQueryClient(results: Record<string, { data: unknown; error: { message: string } | null }>) {
  return {
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        ilike() { return query; },
        order() { return query; },
        limit() { return query; },
        gte() { return query; },
        lte() { return query; },
        then(resolve: (value: { data: unknown; error: { message: string } | null }) => void, reject?: (reason: unknown) => void) {
          return Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("请求上下文外的数据查询明确失败", async () => {
  await assert.rejects(() => getUserInfo({}), /outside a request scope|request scope|cookies/i);
  await assert.rejects(() => getAnomalousData({ type: "" }), /outside a request scope|request scope|cookies/i);
});

test("任务状态先按可信成员范围查库，再次过滤返回行", async () => {
  const filters: Array<{ column: string; ids: string[] }> = [];
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    limit() { return query; },
    in(column: string, ids: string[]) { filters.push({ column, ids }); return query; },
    then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve({
        data: [
          { id: "own-task", result_status: "failed", created_at: "2026-09-16", rendered_text: "本人异常", result_json: { user_id: "own" } },
          { id: "other-task", result_status: "failed", created_at: "2026-09-16", rendered_text: "他人异常", result_json: { user_id: "other" } },
        ],
        error: null,
      }).then(resolve, reject);
    },
  };
  const result = await getTaskStatus(
    { taskType: "daily_review" },
    { from: () => query } as never,
    { actorId: "owner", actorRole: "admin", actorCompanyRole: "company_owner", actorPermissions: { use_ai_assist: true }, activeVisibleUserIds: ["own"] },
  );

  assert.deepEqual(filters, [{ column: "result_json->>user_id", ids: ["own"] }]);
  assert.deepEqual(result.data?.tasks, [{ id: "own-task", status: "failed", createdAt: "2026-09-16", error: "本人异常" }]);
});

test("用户信息按可信范围拒绝跨团队结果", async () => {
  const result = await getUserInfo(
    { userId: "other" },
    createFakeQueryClient({ profiles: { data: [], error: null } }) as never,
    { actorId: "owner", actorRole: "admin", actorCompanyRole: "company_owner", actorPermissions: { use_ai_assist: true }, activeVisibleUserIds: ["own"] },
  );
  assert.deepEqual(result, { success: false, error: "不能查看当前管理范围外的成员" });
});

test("异常查询即使收到跨团队行也只返回当前范围", async () => {
  const result = await getAnomalousData(
    { type: "consecutive_exemption" },
    createFakeQueryClient({ exemption_grant: { data: [
      { user_id: "own", start_date: "2026-09-16", end_date: "2026-09-16" },
      { user_id: "other", start_date: "2026-09-16", end_date: "2026-09-16" },
    ], error: null } }) as never,
    { actorId: "owner", actorRole: "admin", actorCompanyRole: "company_owner", actorPermissions: { use_ai_assist: true }, activeVisibleUserIds: ["own"] },
  );
  assert.deepEqual((result.data?.anomalies as Array<{ userId: string }>).map((row) => row.userId), ["own"]);
});

test("任务状态查询在缺服务端配置时明确失败", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { await assert.rejects(() => getTaskStatus({ taskType: "" }), /Missing/); }
  finally { process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl; process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; }
});

test("异常数据查询失败时返回 success:false，不伪装成没有异常", async () => {
  const result = await getAnomalousData(
    { type: "no_submission", dateRange: { end: "2026-05-01" } },
    createFakeQueryClient({
      profiles: { data: [{ id: "user-1", name: "阿禅", status: "active", membership_status: "active" }], error: null },
      daily_reports: { data: null, error: { message: "daily_reports unavailable" } },
    }) as never,
    { actorId: "owner", actorRole: "admin", actorCompanyRole: "company_owner", actorPermissions: { use_ai_assist: true }, activeVisibleUserIds: ["user-1"] },
  );

  assert.equal(result.success, false);
  assert.match(String(result.error), /读取日报失败|daily_reports unavailable/);
});

test("用户信息附属查询失败时返回 success:false，不返回空日报冒充成功", async () => {
  const result = await getUserInfo(
    { userId: "user-1" },
    createFakeQueryClient({
      profiles: { data: [{ id: "user-1", name: "阿禅", role: "member", status: "active", permissions: {} }], error: null },
      daily_reports: { data: null, error: { message: "metrics unavailable" } },
      exemption_grant: { data: [], error: null },
    }) as never,
    { actorId: "owner", actorRole: "admin", actorCompanyRole: "company_owner", actorPermissions: { use_ai_assist: true }, activeVisibleUserIds: ["user-1"] },
  );

  assert.equal(result.success, false);
  assert.match(String(result.error), /读取近期日报失败|metrics unavailable/);
});

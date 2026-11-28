import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { resolvePermissionIdentity } from "@/lib/current-permission-context";
import { requireOwnerOrAdminRole, requireActiveVisibleUsers } from "../_shared";
import { buildFulfillmentAppealsGetResponse, buildFulfillmentAppealsPostResponse } from "./route";
import { buildReopenFulfillmentAppealResponse } from "../appeal/reopen/route";

const appealId = "123e4567-e89b-42d3-a456-426614174000";
const userId = "123e4567-e89b-42d3-a456-426614174001";
const appeal = { id: appealId, user_id: userId, account_id: "acc", record_date: "2026-11-28", reason: "补交", status: "rejected", created_at: "2026-11-27T16:30:00Z" };
const candidates = [
  { id: "admin", role: "admin", company_role: "admin", permissions: {}, team_id: "team", membership_status: "active" },
  { id: "owner", role: "owner", company_role: "company_owner", permissions: {}, team_id: "team", membership_status: "active" },
  { id: "member", role: "member", company_role: "member", permissions: { manage_members: true }, team_id: "team", membership_status: "active" },
  { id: "other", role: "admin", company_role: "admin", permissions: {}, team_id: "other", membership_status: "active" },
  { id: "archived", role: "admin", company_role: "admin", permissions: {}, team_id: "team", membership_status: "archived" },
  { id: "conflict", role: "admin", company_role: "company_owner", permissions: {}, team_id: "team", membership_status: "active" },
];
const observation = { requestId: "fixed-permission-test", mark() {}, setDetail() {} };
const layers = () => ({ businessSucceeded: false, auditStatus: "skipped" as const, employeeNotificationStatus: "skipped" as const, todoStatus: "skipped" as const });

function database(mode: "create" | "read") {
  return {
    from(table: string) {
      let rows: Record<string, unknown>[] = table === "profiles" ? [...candidates, { id: userId, name: "申请人", team_id: "team" }]
        : table === "fulfillment_appeals" ? (mode === "read" ? [appeal] : [])
        : table === "accounts" ? [{ id: "acc", profile_id: userId, name: "账号" }] : [];
      const query = {
        select() { return query; }, order() { return query; }, range() { return query; }, limit() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        gte() { return query; }, lt() { return query; }, or() { return query; },
        update() { return query; },
        insert(value: Record<string, unknown>) { rows = [{ ...appeal, ...value }]; return query; },
        single: async () => ({ data: rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return pagedQueryDouble(query);
    },
  };
}

function auth(role: "admin" | "member") {
  const identity = resolvePermissionIdentity({ role, company_role: role, membership_status: "active", permissions: {} } as never);
  assert.ok(identity);
  return {
    supabase: database("read"),
    userSupabase: { rpc: async () => ({ data: {}, error: null }) },
    actor: { userId: "admin", ...identity },
    scope: { kind: "team", visibleUserIds: [userId], activeVisibleUserIds: [userId] },
  } as never;
}

for (const role of ["admin", "member"] as const) {
  test(`申诉列表：${role} 旧权限为空仍按固定角色允许或拒绝`, async () => {
    const response = await buildFulfillmentAppealsGetResponse(new NextRequest("http://localhost/api/admin/fulfillment/appeals?status=handled"), {
      requireAdminServiceClient: async () => auth(role), requireOwnerOrAdminRole,
    });
    assert.equal(response.status, role === "admin" ? 200 : 403);
    if (role === "admin") assert.equal((await response.json()).appeals[0].id, appealId);
  });
  test(`申诉重开：${role} 旧权限为空仍按固定角色允许或拒绝，待办仅送本团队在职管理层`, async () => {
    let recipients: string[] = [];
    const response = await buildReopenFulfillmentAppealResponse(new Request("http://localhost/reopen", {
      method: "POST", body: JSON.stringify({ appealId }),
    }), observation, layers(), {
      requireAdminServiceClient: async () => auth(role), requireOwnerOrAdminRole, requireActiveVisibleUsers,
      emit: async (input) => { recipients = input.recipients; return { ok: true, inserted: recipients.length }; },
    });
    assert.equal(response.status, role === "admin" ? 200 : 403);
    assert.deepEqual(recipients, role === "admin" ? ["admin", "owner"] : []);
  });
}

test("提交补交申请后，空旧权限的管理员收到待办，普通组员、归档与跨团队管理者不收到", async () => {
  let recipients: string[] = [];
  const response = await buildFulfillmentAppealsPostResponse(new Request("http://localhost/appeals", {
    method: "POST", body: JSON.stringify({ accountId: "acc", recordDate: "2026-11-28", reason: "补交", submissionPayload: {
      account_id: "acc", biz_date: "2026-11-28", video_title: "标题", content: "文案", anomaly_status: "normal", topic_tag: "复盘",
      assets: ["screenshot_1", "screenshot_2"].map((role) => ({ role, url: `https://dydata.cc/api/submission-screenshots/file?path=${userId}%2Facc%2F${role}%2Fshot.png`, confirmed: true, confidence_score: 1, screenshot_type: role === "screenshot_1" ? "data" : "retention" })),
      metrics: { play_count: 100, likes: 10, comments: 2, shares: 1, favorites: 3, follower_gain: 4, follower_loss: 0, follower_convert: 0, avg_play_duration: 12, bounce_rate_2s: 20, completion_rate_5s: 30, completion_rate: 40 },
    } }),
  }), observation, layers(), {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) as never,
    createAdminClient: () => database("create") as never,
    emit: async (input) => { recipients = input.recipients; return { ok: true, inserted: recipients.length }; },
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.deepEqual(recipients, ["admin", "owner"]);
});

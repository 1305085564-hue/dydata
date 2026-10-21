import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildDispatchReviewTicketResponse } from "./route";
import { buildDeleteReviewTicketResponse } from "./[ticketId]/route";
import { buildWithdrawReviewTicketResponse } from "./[ticketId]/withdraw/route";
import { buildResolveReviewTicketResponse } from "./[ticketId]/resolve/route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";
const REPORTER_ID = "223e4567-e89b-42d3-a456-426614174000";
const ASSIGNEE_ID = "323e4567-e89b-42d3-a456-426614174000";
const OTHER_ID = "423e4567-e89b-42d3-a456-426614174000";
const TICKET_ID = "523e4567-e89b-42d3-a456-426614174000";

function request(method: string, body?: unknown) {
  return new NextRequest("https://dydata.cc/api/admin/pulse/review-tickets", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

function actor(userId = REPORTER_ID) {
  return {
    supabase: {} as never,
    actor: {
      userId,
      role: "admin" as const,
      companyRole: "admin" as const,
      permissions: { review_content: true, manage_videos: true },
      name: "派发人",
      dataScope: "team" as const,
      teamId: "team-1",
    },
    context: {
      permissionInfo: {} as never,
      scope: {
        userId,
        role: "admin" as const,
        companyRole: "admin" as const,
        permissions: { review_content: true, manage_videos: true },
        teamId: "team-1",
        kind: "team" as const,
        visibleUserIds: [REPORTER_ID, ASSIGNEE_ID],
        activeVisibleUserIds: [REPORTER_ID, ASSIGNEE_ID],
      },
    },
  };
}

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    in() { return query; },
    async maybeSingle() { return { data, error }; },
  };
  return query;
}

type AdminClientOptions = { existing?: unknown; rpcResult?: { data: unknown; error: unknown }; ticket?: unknown }

function adminClient({ existing = null, rpcResult = { data: { id: TICKET_ID }, error: null }, ticket = null }: AdminClientOptions = {}) {
  return {
    from(table: string) {
      if (table === "videos") return queryResult({ id: VIDEO_ID, user_id: ASSIGNEE_ID, lifecycle_state: "active", accounts: { profile_id: ASSIGNEE_ID } });
      if (table === "profiles") return queryResult({ id: ASSIGNEE_ID, membership_status: "active" });
      if (table === "video_review_tickets") return queryResult(ticket ?? existing);
      throw new Error(`unexpected table ${table}`);
    },
    rpc() { return Promise.resolve(rpcResult); },
  };
}

const baseDeps = (client: unknown, userId = REPORTER_ID) => ({
  requireAdminActor: async () => actor(userId),
  buildPermissionContextForActor: async () => actor(userId).context,
  createAdminClient: () => client as never,
});

test("派发成功创建待复盘工单", async () => {
  const response = await buildDispatchReviewTicketResponse(
    request("POST", { videoId: VIDEO_ID, assigneeId: ASSIGNEE_ID, issueTag: "前2秒流失高" }),
    baseDeps(adminClient()),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ok, true);
});

test("应用层检测到重复派发时返回既有时间和明确错误码", async () => {
  const createdAt = "2026-10-22T01:02:03.000Z";
  const response = await buildDispatchReviewTicketResponse(
    request("POST", { videoId: VIDEO_ID, assigneeId: ASSIGNEE_ID, issueTag: "前2秒流失高" }),
    baseDeps(adminClient({ existing: { id: TICKET_ID, created_at: createdAt } })),
  );
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "TICKET_ALREADY_PENDING");
  assert.match(body.error, /已于/);
});

test("唯一索引冲突返回重复派发错误", async () => {
  const response = await buildDispatchReviewTicketResponse(
    request("POST", { videoId: VIDEO_ID, assigneeId: ASSIGNEE_ID, issueTag: "前2秒流失高" }),
    baseDeps(adminClient({ rpcResult: { data: null, error: { code: "23505" } } })),
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "TICKET_ALREADY_PENDING");
});

test("组长派发给范围外成员被拒绝", async () => {
  const response = await buildDispatchReviewTicketResponse(
    request("POST", { videoId: VIDEO_ID, assigneeId: OTHER_ID, issueTag: "前2秒流失高" }),
    baseDeps(adminClient()),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ASSIGNEE_OUT_OF_SCOPE");
});

test("非派发人撤回被拒绝", async () => {
  const response = await buildDeleteReviewTicketResponse(
    request("DELETE"),
    TICKET_ID,
    baseDeps(adminClient({ ticket: { id: TICKET_ID, reporter_id: REPORTER_ID, assignee_id: ASSIGNEE_ID, status: "pending", created_at: new Date().toISOString() } }), OTHER_ID),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "REPORTER_ONLY");
});

test("确认闭环只允许被派人并使用内置标签", async () => {
  const response = await buildResolveReviewTicketResponse(
    request("POST", { issueTag: "开头缺乏悬念" }),
    TICKET_ID,
    baseDeps(adminClient({ ticket: { id: TICKET_ID, reporter_id: REPORTER_ID, assignee_id: ASSIGNEE_ID, status: "pending", created_at: new Date().toISOString() }, rpcResult: { data: { id: TICKET_ID, status: "resolved" }, error: null } }), ASSIGNEE_ID),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ticket.status, "resolved");
});

test("超时后撤回进入 withdrawn", async () => {
  const response = await buildWithdrawReviewTicketResponse(
    request("POST"),
    TICKET_ID,
    baseDeps(adminClient({ ticket: { id: TICKET_ID, reporter_id: REPORTER_ID, assignee_id: ASSIGNEE_ID, status: "pending", created_at: new Date(Date.now() - 10000).toISOString() }, rpcResult: { data: { id: TICKET_ID, status: "withdrawn" }, error: null } })),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ticket.status, "withdrawn");
});

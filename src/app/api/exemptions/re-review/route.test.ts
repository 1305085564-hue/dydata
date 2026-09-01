import assert from "node:assert/strict";
import test from "node:test";

import { buildReReviewExemptionResponse } from "./route";

const REQUEST_ID = "f130ee78-9d07-477e-a918-c7bbd43ff759";

function mockAuth(overrides: Record<string, unknown> = {}) {
  return {
    supabase: { marker: "session" },
    adminSupabase: { marker: "admin" },
    actor: {
      userId: "reviewer-1",
      role: "admin",
      permissions: { manage_fulfillment: true },
      name: "审核员",
      dataScope: "team" as const,
      teamId: "team-a",
      groupModeTokenHash: undefined,
    },
    scope: {
      kind: "team" as const,
      visibleUserIds: ["applicant-1"],
      activeVisibleUserIds: ["applicant-1"],
    },
    ...overrides,
  };
}

test("改判请求用登录会话调用受限 RPC（不传 adminSupabase）", async () => {
  const response = await buildReReviewExemptionResponse(
    { request_id: REQUEST_ID, action: "rejected" },
    {
      requireExemptionManagerActor: async () =>
        ({
          supabase: { rpc: async () => ({ data: {}, error: null }) },
          actor: mockAuth().actor,
          scope: mockAuth().scope,
        }) as never,
      reReviewExemptionRequestAtomically: async (input: { supabase: unknown }) => {
        // 契约：route 必须传会话客户端（带 rpc 的才是会话），而不是 adminSupabase
        assert.ok(input.supabase && typeof (input.supabase as { rpc?: unknown }).rpc === "function");
        return { ok: true as const, data: { request_id: REQUEST_ID, decision: "rejected" } };
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, { request_id: REQUEST_ID, decision: "rejected" });
});

test("改判 RPC 失败按状态码透出安全文案", async () => {
  const response = await buildReReviewExemptionResponse(
    { request_id: REQUEST_ID, action: "approved" },
    {
      requireExemptionManagerActor: async () => mockAuth() as never,
      reReviewExemptionRequestAtomically: async () => ({
        ok: false as const,
        status: 409,
        message: "该申请已处理",
      }),
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "该申请已处理" });
});

test("改判请求体校验：缺失字段/非法 uuid/非法 action 被 400 拒绝", async () => {
  for (const payload of [
    { action: "rejected" },
    { request_id: "not-a-uuid", action: "rejected" },
    { request_id: REQUEST_ID, action: "pending" },
    "not-an-object",
  ]) {
    const response = await buildReReviewExemptionResponse(payload, {
      requireExemptionManagerActor: async () => {
        throw new Error("不应走到鉴权");
      },
      reReviewExemptionRequestAtomically: async () => {
        throw new Error("不应走到 RPC");
      },
    });
    assert.equal(response.status, 400);
  }
});

test("无权限时返回 403 且不调用 RPC", async () => {
  let rpcCalled = false;
  const response = await buildReReviewExemptionResponse(
    { request_id: REQUEST_ID, action: "rejected" },
    {
      requireExemptionManagerActor: async () => ({
        response: new Response(JSON.stringify({ error: "无权限" }), { status: 403 }),
      }) as never,
      reReviewExemptionRequestAtomically: async () => {
        rpcCalled = true;
        return { ok: true as const, data: {} };
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(rpcCalled, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildReopenExemptionResponse } from "./route";

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

test("打回请求用登录会话调用受限 RPC（不传 adminSupabase）", async () => {
  const response = await buildReopenExemptionResponse(
    { request_id: REQUEST_ID },
    {
      requireExemptionManagerActor: async () =>
        ({
          supabase: { rpc: async () => ({ data: {}, error: null }) },
          actor: mockAuth().actor,
          scope: mockAuth().scope,
        }) as never,
      reopenExemptionRequestAtomically: async (input: { supabase: unknown }) => {
        // 契约：route 必须传会话客户端（带 rpc 的才是会话），而不是 adminSupabase
        assert.ok(input.supabase && typeof (input.supabase as { rpc?: unknown }).rpc === "function");
        return { ok: true as const, data: { request_id: REQUEST_ID, reopened: true } };
      },
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, { request_id: REQUEST_ID, reopened: true });
});

test("打回 RPC 失败按状态码透出安全文案", async () => {
  const response = await buildReopenExemptionResponse(
    { request_id: REQUEST_ID },
    {
      requireExemptionManagerActor: async () => mockAuth() as never,
      reopenExemptionRequestAtomically: async () => ({
        ok: false as const,
        status: 409,
        message: "该成员已有重叠的待审批申请，无法打回",
      }),
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "该成员已有重叠的待审批申请，无法打回" });
});

test("打回请求体校验：缺失字段/非法 uuid 被 400 拒绝", async () => {
  for (const payload of [
    {},
    { request_id: "not-a-uuid" },
    "not-an-object",
  ]) {
    const response = await buildReopenExemptionResponse(payload, {
      requireExemptionManagerActor: async () => {
        throw new Error("不应走到鉴权");
      },
      reopenExemptionRequestAtomically: async () => {
        throw new Error("不应走到 RPC");
      },
    });
    assert.equal(response.status, 400);
  }
});

test("无权限时返回 403 且不调用 RPC", async () => {
  let rpcCalled = false;
  const response = await buildReopenExemptionResponse(
    { request_id: REQUEST_ID },
    {
      requireExemptionManagerActor: async () => ({
        response: new Response(JSON.stringify({ error: "无权限" }), { status: 403 }),
      }) as never,
      reopenExemptionRequestAtomically: async () => {
        rpcCalled = true;
        return { ok: true as const, data: {} };
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(rpcCalled, false);
});

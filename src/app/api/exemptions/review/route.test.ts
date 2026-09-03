import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewExemptionResponse } from "./route";
import type { AdminActor } from "@/app/api/admin/auth-helper";

function mockAdminActor(overrides: Partial<AdminActor> = {}): AdminActor {
  return {
    userId: "reviewer-1",
    role: "admin",
    permissions: {},
    name: "审核员",
    dataScope: "all" as const,
    ...overrides,
  };
}

test("豁免审核 API 使用用户会话客户端调用 RPC", async () => {
  const sessionClient = { marker: "user-session-client" };
  let receivedClient: unknown = null;
  const response = await buildReviewExemptionResponse(
    { request_id: "123e4567-e89b-42d3-a456-426614174000", action: "approved" },
    {
      requireExemptionManagerActor: async () =>
        ({
          supabase: sessionClient,
          adminSupabase: { marker: "admin-client" },
          actor: mockAdminActor(),
          scope: { kind: "team", visibleUserIds: ["member-1"], activeVisibleUserIds: ["member-1"] },
        }) as never,
      reviewExemptionRequestAtomically: async (input) => {
        receivedClient = input.supabase;
        return { ok: true as const, data: { request_id: input.requestId } };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedClient, sessionClient);
});

test("豁免审核 API 把数据库越权固定映射为 403", async () => {
  const response = await buildReviewExemptionResponse(
    { request_id: "123e4567-e89b-42d3-a456-426614174000", action: "approved" },
    {
      requireExemptionManagerActor: async () => ({ supabase: {}, user: { id: "reviewer-1" } }) as never,
      reviewExemptionRequestAtomically: async () => ({
        ok: false as const,
        status: 403,
        message: "不能操作当前管理范围外的成员",
        cause: { message: "cross-team secret" },
      }),
    },
  );

  assert.equal(response.status, 403);
  const body = JSON.stringify(await response.json());
  assert.match(body, /不能操作当前管理范围外的成员/);
  assert.doesNotMatch(body, /cross-team secret/);
});

test("豁免审核 feedback 超长时拒绝，不能静默截断", async () => {
  const response = await buildReviewExemptionResponse(
    {
      request_id: "123e4567-e89b-42d3-a456-426614174000",
      action: "rejected",
      feedback: "反馈".repeat(1001),
    },
    {
      requireExemptionManagerActor: async () => {
        throw new Error("不应在请求体非法时进入鉴权");
      },
      reviewExemptionRequestAtomically: async () => {
        throw new Error("不应在请求体非法时进入审批写入");
      },
    },
  );

  assert.equal(response.status, 400);
  const body = JSON.stringify(await response.json());
  assert.match(body, /feedback不能超过 2000 个字符/);
});

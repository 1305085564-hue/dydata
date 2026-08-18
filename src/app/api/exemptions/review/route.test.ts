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

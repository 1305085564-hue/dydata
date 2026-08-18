import assert from "node:assert/strict";
import test from "node:test";

import type { NextRequest } from "next/server";
import { buildPendingExemptionResponse } from "./route";
import type { AdminActor } from "@/app/api/admin/auth-helper";

function mockAdminActor(overrides: Partial<AdminActor> = {}): AdminActor {
  return {
    userId: "reviewer-1",
    role: "admin",
    permissions: { manage_fulfillment: true },
    name: "审核员",
    dataScope: "team" as const,
    teamId: "team-a",
    ...overrides,
  };
}

test("豁免待审列表使用 activeVisibleUserIds 过滤当前操作范围", async () => {
  const request = {
    nextUrl: new URL("https://dydata.cc/api/exemptions/pending?limit=10"),
  } as NextRequest;
  const response = await buildPendingExemptionResponse(
    request,
    {
      requireExemptionManagerActor: async () => ({
        supabase: { marker: "session" },
        adminSupabase: { marker: "admin" },
        actor: mockAdminActor(),
        scope: {
          kind: "team",
          visibleUserIds: ["active-1", "archived-1"],
          activeVisibleUserIds: ["active-1"],
        },
      }) as never,
      loadAdminExemptionList: async (input) => {
        assert.deepEqual(input.visibleUserIds, ["active-1"]);
        return { data: [{ id: "req-1" }] } as never;
      },
    },
  ) as Response;

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, [{ id: "req-1" }]);
});

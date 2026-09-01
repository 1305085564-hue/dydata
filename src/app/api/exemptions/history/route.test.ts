import assert from "node:assert/strict";
import test from "node:test";

import type { NextRequest } from "next/server";
import { buildHistoryExemptionResponse } from "./route";
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

test("豁免历史列表请求 approved 与 rejected 状态且使用 visibleUserIds 保留归档成员历史", async () => {
  const request = {
    nextUrl: new URL("https://dydata.cc/api/exemptions/history?limit=10"),
  } as NextRequest;
  const response = await buildHistoryExemptionResponse(
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
        assert.deepEqual(input.statuses, ["approved", "rejected"]);
        assert.deepEqual(input.visibleUserIds, ["active-1", "archived-1"]);
        return { data: [{ id: "req-history-1", request_status: "approved" }] } as never;
      },
    },
  ) as Response;

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, [{ id: "req-history-1", request_status: "approved" }]);
});

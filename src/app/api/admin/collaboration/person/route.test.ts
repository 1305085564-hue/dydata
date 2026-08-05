import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildPersonResponse } from "../handlers";

test("access_level=1 的成员不能查看他人的个人卡", async () => {
  let loadCalled = false;
  const response = await buildPersonResponse(
    new NextRequest(
      "https://dydata.cc/api/admin/collaboration/person?userId=123e4567-e89b-42d3-a456-426614174002&year=2026&month=7",
    ),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "123e4567-e89b-42d3-a456-426614174001",
          role: "member",
          permissions: { view_analytics: true },
          name: "成员甲",
          dataScope: "all" as const,
        },
      }),
      buildPermissionContextForActor: async () => ({
        permissionInfo: {} as never,
        scope: {
          visibleUserIds: ["123e4567-e89b-42d3-a456-426614174001"],
        } as never,
      }),
      createAdminClient: () => ({}) as never,
      loadPersonData: async () => {
        loadCalled = true;
        return {} as never;
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(loadCalled, false);
});

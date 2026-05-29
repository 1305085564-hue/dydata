import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildAdminContentListResponse } from "./route";

function buildRequest(url: string) {
  return new NextRequest(url);
}

function buildContentPayload() {
  return {
    videos: [],
    snapshots: [],
    profiles: [],
    accounts: [],
    reviewedVideoIds: [],
    feedbackCards: {},
    reviewReadiness: {},
    summary: {
      totalVideos: 0,
      reviewedCount: 0,
      snapshotCount: 0,
      pendingReviewCount: 0,
    },
    workflowSummary: {
      notStarted: 0,
      draft: 0,
      confirmed: 0,
      sent: 0,
      viewed: 0,
      pendingDelivery: 0,
    },
  };
}

test("content list route 显式走 full 取数并回传 Server-Timing", async () => {
  const adminClient = { kind: "admin-content-client" } as never;
  const permissionInfo = {
    userId: "owner-1",
    name: "阿禅",
    role: "owner" as const,
    businessRole: "owner" as const,
    permissions: { view_content_review: true },
    accessLevel: 4,
    teamId: null,
    groupId: null,
    ledGroupIds: [],
  };
  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    businessRole: "owner" as const,
    permissions: { view_content_review: true },
    accessLevel: 3 as const,
    teamId: "team-1",
    groupId: null,
    kind: "team" as const,
    visibleUserIds: ["user-1"],
  };
  let receivedArgs: unknown = null;

  const response = await buildAdminContentListResponse(
    buildRequest("https://dydata.cc/api/admin/content/list?view=all&scope=team&teamId=team-1&mode=full"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "owner-1",
          role: "owner" as const,
          businessRole: "owner" as const,
          permissions: { view_content_review: true },
          name: "阿禅",
          accessLevel: 4,
          teamId: null,
          groupId: null,
          ledGroupIds: [],
        },
      }),
      getTeamOptions: async () => [{ id: "team-1", name: "团队一" }],
      getCurrentPermissionContext: async () => ({ permissionInfo, scope }),
      createAdminClient: () => adminClient,
      loadAdminContentFullData: async (args) => {
        receivedArgs = args;
        return buildContentPayload();
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), buildContentPayload());
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "all",
    perspective: "team",
    teamId: "team-1",
    permissionInfo,
    scope,
  });
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /context;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /data;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /total;dur=/);
});

test("content list route 拒绝 initial mode 误用", async () => {
  const response = await buildAdminContentListResponse(
    buildRequest("https://dydata.cc/api/admin/content/list?mode=initial"),
    {
      requireAdminActor: async () => {
        throw new Error("should not reach auth");
      },
      getTeamOptions: async () => [],
      getCurrentPermissionContext: async () => null,
      createAdminClient: () => ({}) as never,
      loadAdminContentFullData: async () => buildContentPayload(),
    },
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /mode/);
});

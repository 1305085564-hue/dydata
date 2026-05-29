import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildAdminVideosListResponse } from "./route";

function buildRequest(url: string) {
  return new NextRequest(url);
}

function buildVideosPayload() {
  return {
    videos: [],
    snapshots: [],
    profiles: [],
    accounts: [],
    videoTags: [],
    assetLibrary: {},
    summary: {
      totalVideos: 0,
      taggedVideos: 0,
      snapshotCount: 0,
      abnormalCount: 0,
      pendingCount: 0,
    },
    assetSummary: {
      readyCount: 0,
      pendingLibraryCount: 0,
      completeCount: 0,
      partialCount: 0,
      missingCount: 0,
      gradedCount: 0,
    },
  };
}

test("videos list route 显式走 full 取数并回传 Server-Timing", async () => {
  const adminClient = { kind: "admin-video-client" } as never;
  const permissionInfo = {
    userId: "owner-1",
    name: "阿禅",
    role: "owner" as const,
    businessRole: "owner" as const,
    permissions: { manage_video_assets: true },
    accessLevel: 4,
    teamId: null,
    groupId: null,
    ledGroupIds: [],
  };
  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    businessRole: "owner" as const,
    permissions: { manage_video_assets: true },
    accessLevel: 4 as const,
    teamId: null,
    groupId: null,
    kind: "all" as const,
    visibleUserIds: ["user-1", "user-2"],
  };
  let receivedArgs: unknown = null;

  const response = await buildAdminVideosListResponse(
    buildRequest("https://dydata.cc/api/admin/videos/list?view=pending&scope=company"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "owner-1",
          role: "owner" as const,
          businessRole: "owner" as const,
          permissions: { manage_video_assets: true },
          name: "阿禅",
          accessLevel: 4,
          teamId: null,
          groupId: null,
          ledGroupIds: [],
        },
      }),
      getTeamOptions: async () => [],
      getCurrentPermissionContext: async () => ({ permissionInfo, scope }),
      createAdminClient: () => adminClient,
      loadAdminVideosFullData: async (args) => {
        receivedArgs = args;
        return buildVideosPayload();
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), buildVideosPayload());
  assert.deepEqual(receivedArgs, {
    supabase: adminClient,
    view: "pending",
    perspective: "company",
    teamId: null,
    permissionInfo,
    scope,
  });
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /context;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /data;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /total;dur=/);
});

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
  };
}

test("videos list route 显式走 full 取数并回传 Server-Timing", async () => {
  const adminClient = { kind: "admin-video-client" } as never;
  const permissionInfo = {
    userId: "owner-1",
    name: "阿禅",
    dataScope: "team" as const,
    role: "owner" as const,
    permissions: { manage_videos: true },
    teamId: null,
  };
  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    permissions: { manage_videos: true },
    teamId: null,
    kind: "team" as const,
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
          role: "admin" as const,
          companyRole: "company_owner" as const,
          permissions: { manage_videos: true },
          name: "阿禅",
          dataScope: "team" as const,
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
    perspective: "team",
    teamId: null,
    permissionInfo,
    scope,
  });
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /context;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /data;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /total;dur=/);
});

test("trash 只按视频管理权限放行，并把 trash 传给加载器", async () => {
  const adminClient = {} as never;
  let receivedView: unknown = null;
  const base = {
    getTeamOptions: async () => [],
    getCurrentPermissionContext: async () => ({ permissionInfo: { userId: "u1" }, scope: { visibleUserIds: ["u1"] } }),
    createAdminClient: () => adminClient,
    loadAdminVideosFullData: async (args: { view?: unknown }) => {
      receivedView = args.view;
      return buildVideosPayload();
    },
  };
  const denied = await buildAdminVideosListResponse(buildRequest("https://dydata.cc/api/admin/videos/list?view=trash"), {
    ...base,
    requireAdminActor: async () => ({ supabase: {} as never, actor: { userId: "u1", role: "admin", permissions: {}, name: null } }),
    dataScope: "team" as const,
  } as never);
  assert.equal(denied.status, 403);

  const allowed = await buildAdminVideosListResponse(buildRequest("https://dydata.cc/api/admin/videos/list?view=trash"), {
    ...base,
    requireAdminActor: async () => ({ supabase: {} as never, actor: { userId: "u1", role: "admin", permissions: { manage_videos: true }, name: null, teamId: "company-1" } }),
    dataScope: "team" as const,
  } as never);
  assert.equal(allowed.status, 200);
  assert.equal(receivedView, "trash");
});

test("review_content-only 不能调用旧素材库列表 API", async () => {
  const response = await buildAdminVideosListResponse(
    buildRequest("https://dydata.cc/api/admin/videos/list?view=all"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: { userId: "u1", role: "admin", permissions: { review_content: true }, name: null },
        dataScope: "team" as const,
      }),
      getTeamOptions: async () => [],
      getCurrentPermissionContext: async () => { throw new Error("must not load data"); },
      createAdminClient: () => ({} as never),
      loadAdminVideosFullData: async () => { throw new Error("must not load data"); },
    } as never,
  );
  assert.equal(response.status, 403);
});

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
    permissions: { manage_videos: true },
    dataScope: "all" as const,
    teamId: null,
  };
  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    permissions: { manage_videos: true },
    teamId: null,
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
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { manage_videos: true },
          name: "阿禅",
          dataScope: "all" as const,
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
  } as never);
  assert.equal(denied.status, 403);

  const allowed = await buildAdminVideosListResponse(buildRequest("https://dydata.cc/api/admin/videos/list?view=trash"), {
    ...base,
    requireAdminActor: async () => ({ supabase: {} as never, actor: { userId: "u1", role: "admin", permissions: { manage_videos: true }, name: null, teamId: "company-1" } }),
  } as never);
  assert.equal(allowed.status, 200);
  assert.equal(receivedView, "trash");
});

test("集团模式下 runtime member 也能查看回收站", async () => {
  const response = await buildAdminVideosListResponse(
    buildRequest("https://dydata.cc/api/admin/videos/list?view=trash&scope=company"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "group-member-1",
          role: "member" as const,
          companyRole: "member" as const,
          groupMode: true,
          permissions: { manage_videos: true },
          name: "集团成员",
          dataScope: "all" as const,
          teamId: "company-1",
        },
      }),
      getTeamOptions: async () => [{ id: "company-1" }, { id: "company-2" }],
      getCurrentPermissionContext: async () => ({
        permissionInfo: { userId: "group-member-1" },
        scope: { kind: "all", visibleUserIds: ["group-member-1"] },
      }),
      createAdminClient: () => ({}) as never,
      loadAdminVideosFullData: async () => buildVideosPayload(),
    } as never,
  );

  assert.equal(response.status, 200);
});

test("集团模式使用集团视角并且只在此时加载全部公司", async () => {
  let teamOptionCalls = 0;
  let receivedOptions: unknown = null;
  const response = await buildAdminVideosListResponse(
    buildRequest("https://dydata.cc/api/admin/videos/list?view=all&scope=company"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "group-owner-1",
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { manage_videos: true },
          name: "集团所有者",
          dataScope: "all" as const,
          teamId: "company-1",
        },
      }),
      getTeamOptions: async () => {
        teamOptionCalls += 1;
        return [{ id: "company-1", name: "公司一" }, { id: "company-2", name: "公司二" }];
      },
      getCurrentPermissionContext: async (_actor, options) => {
        receivedOptions = options;
        return {
          permissionInfo: { userId: "group-owner-1" },
          scope: { kind: "all", visibleUserIds: ["group-owner-1", "member-2"] },
        } as never;
      },
      createAdminClient: () => ({}) as never,
      loadAdminVideosFullData: async () => buildVideosPayload(),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(teamOptionCalls, 1);
  assert.deepEqual(receivedOptions, { perspective: "company", teamId: null });
});

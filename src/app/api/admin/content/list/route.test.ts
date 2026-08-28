import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { __internal, buildAdminContentListResponse } from "./route";

function buildRequest(url: string) {
  return new NextRequest(url);
}

function buildContentPayload() {
  return {
    videos: [],
    snapshots: [],
    profiles: [],
    accounts: [],
    reviewReadiness: {},
    summary: {
      totalVideos: 0,
      pendingReviewCount: 0,
    },
  };
}

test("content list route 显式走 full 取数并回传 Server-Timing", async () => {
  const adminClient = { kind: "admin-content-client" } as never;
  const permissionInfo = {
    userId: "owner-1",
    name: "阿禅",
    role: "owner" as const,
    permissions: { review_content: true },
    dataScope: "all" as const,
    teamId: null,
  };
  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    permissions: { review_content: true },
    teamId: "team-1",
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
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { review_content: true },
          name: "阿禅",
          dataScope: "all" as const,
          teamId: null,
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

test("公司所有者默认只能使用本公司视角，集团模式才能加载全部公司", async () => {
  __internal.resetAdminContentListCache();
  let teamOptionCalls = 0;
  let receivedOptions: unknown = null;
  const response = await buildAdminContentListResponse(
    buildRequest("https://dydata.cc/api/admin/content/list?view=all&scope=company&mode=full"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "company-owner-1",
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: false,
          permissions: { review_content: true },
          name: "公司所有者",
          dataScope: "team" as const,
          teamId: "company-1",
        },
      }),
      getTeamOptions: async () => {
        teamOptionCalls += 1;
        return [{ id: "company-2", name: "公司二" }];
      },
      getCurrentPermissionContext: async (_actor, options) => {
        receivedOptions = options;
        return {
          permissionInfo: {
            userId: "company-owner-1",
            name: "公司所有者",
            role: "admin" as const,
            companyRole: "company_owner" as const,
            permissions: { review_content: true },
            dataScope: "team" as const,
            teamId: "company-1",
          },
          scope: {
            userId: "company-owner-1",
            role: "admin" as const,
            companyRole: "company_owner" as const,
            permissions: { review_content: true },
            teamId: "company-1",
            kind: "team" as const,
            visibleUserIds: ["company-owner-1", "member-1"],
          },
        };
      },
      createAdminClient: () => ({}) as never,
      loadAdminContentFullData: async () => buildContentPayload(),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(teamOptionCalls, 0);
  assert.deepEqual(receivedOptions, { perspective: "team", teamId: "company-1" });
});

test("content list route 同 scope+参数 60 秒内复用服务端缓存", async () => {
  __internal.resetAdminContentListCache();

  let calls = 0;
  const responseA = await buildAdminContentListResponse(
    buildRequest("https://dydata.cc/api/admin/content/list?view=pending&scope=company&mode=full"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "owner-1",
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { review_content: true },
          name: "阿禅",
          dataScope: "all" as const,
          teamId: null,
        },
      }),
      getTeamOptions: async () => [],
      getCurrentPermissionContext: async () => ({
        permissionInfo: {
          userId: "owner-1",
          name: "阿禅",
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { review_content: true },
          dataScope: "all" as const,
          teamId: null,
        },
        scope: {
          userId: "owner-1",
          role: "owner" as const,
          permissions: { review_content: true },
          teamId: null,
          kind: "all" as const,
          visibleUserIds: ["user-1", "user-2"],
        },
      }),
      createAdminClient: () => ({ kind: "cached" }) as never,
      loadAdminContentFullData: async () => {
        calls += 1;
        return buildContentPayload();
      },
    },
  );
  const responseB = await buildAdminContentListResponse(
    buildRequest("https://dydata.cc/api/admin/content/list?view=pending&scope=company&mode=full"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "owner-1",
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { review_content: true },
          name: "阿禅",
          dataScope: "all" as const,
          teamId: null,
        },
      }),
      getTeamOptions: async () => [],
      getCurrentPermissionContext: async () => ({
        permissionInfo: {
          userId: "owner-1",
          name: "阿禅",
          role: "admin" as const,
          companyRole: "company_owner" as const,
          groupMode: true,
          permissions: { review_content: true },
          dataScope: "all" as const,
          teamId: null,
        },
        scope: {
          userId: "owner-1",
          role: "admin" as const,
          permissions: { review_content: true },
          teamId: null,
          kind: "all" as const,
          visibleUserIds: ["user-1", "user-2"],
        },
      }),
      createAdminClient: () => ({ kind: "cached" }) as never,
      loadAdminContentFullData: async () => {
        calls += 1;
        return buildContentPayload();
      },
    },
  );

  assert.equal(responseA.status, 200);
  assert.equal(responseB.status, 200);
  assert.equal(calls, 1);
  assert.equal(responseA.headers.get("cache-control"), "private, max-age=60");
  assert.equal(responseB.headers.get("cache-control"), "private, max-age=60");
});

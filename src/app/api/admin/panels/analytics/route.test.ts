import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildAnalyticsPanelResponse } from "./route";
import { AnalyticsRangeLimitError } from "@/lib/loaders/analytics-page";

function buildRequest(url: string) {
  return new NextRequest(url);
}

function buildPayload() {
  return {
    range: { from: "2026-05-01", to: "2026-05-30", preset: "30d" as const },
    userId: "owner-1",
    role: "owner",
    isPrivilegedUser: true,
    currentUserName: "阿禅",
    submitters: ["阿禅"],
    filteredReports: [],
    previousPeriodReports: [],
  };
}

test("analytics panel route 复用单次权限上下文、回传 Server-Timing，并写入首屏观测", async () => {
  const permissionInfo = {
    userId: "owner-1",
    name: "阿禅",
    role: "owner" as const,
    businessRole: "owner" as const,
    permissions: { view_analytics: true },
    accessLevel: 4,
    teamId: null,
    groupId: null,
    ledGroupIds: [],
  };
  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    businessRole: "owner" as const,
    permissions: { view_analytics: true },
    accessLevel: 4 as const,
    teamId: null,
    groupId: null,
    kind: "all" as const,
    visibleUserIds: ["owner-1"],
  };
  let receivedArgs: unknown = null;
  const observations: Array<{ route?: string; statusCode?: number; scopeKind?: string | null }> = [];

  const response = await buildAnalyticsPanelResponse(buildRequest("https://dydata.cc/api/admin/panels/analytics?preset=30d"), {
    requireAdminActor: async () => ({
      supabase: {} as never,
      actor: {
        userId: "owner-1",
        role: "owner" as const,
        businessRole: "owner" as const,
        permissions: { view_analytics: true },
        name: "阿禅",
        accessLevel: 4,
        teamId: null,
        groupId: null,
        ledGroupIds: [],
      },
    }),
    getCurrentPermissionContext: async () => ({ permissionInfo, scope }),
    loadAnalyticsPageData: async (args) => {
      receivedArgs = args;
      return buildPayload();
    },
      recordObservation: async (observation, _supabase) => {
        observations.push(observation);
      },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), buildPayload());
  assert.deepEqual(receivedArgs, {
    userId: "owner-1",
    preset: "30d",
    from: undefined,
    to: undefined,
    permissionInfo,
    scope,
  });
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /context;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /data;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /total;dur=/);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.route, "/api/admin/panels/analytics");
  assert.equal(observations[0]?.statusCode, 200);
  assert.equal(observations[0]?.scopeKind, "all");
});

test("analytics panel route 对超过 90 天的主区间直接返回 400", async () => {
  const response = await buildAnalyticsPanelResponse(
    buildRequest("https://dydata.cc/api/admin/panels/analytics?preset=custom&from=2026-01-01&to=2026-04-15"),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "owner-1",
          role: "owner" as const,
          businessRole: "owner" as const,
          permissions: { view_analytics: true },
          name: "阿禅",
          accessLevel: 4,
          teamId: null,
          groupId: null,
          ledGroupIds: [],
        },
      }),
      getCurrentPermissionContext: async () => ({
        permissionInfo: {
          userId: "owner-1",
          name: "阿禅",
          role: "owner" as const,
          businessRole: "owner" as const,
          permissions: { view_analytics: true },
          accessLevel: 4,
          teamId: null,
          groupId: null,
          ledGroupIds: [],
        },
        scope: {
          userId: "owner-1",
          role: "owner" as const,
          businessRole: "owner" as const,
          permissions: { view_analytics: true },
          accessLevel: 4 as const,
          teamId: null,
          groupId: null,
          kind: "all" as const,
          visibleUserIds: ["owner-1"],
        },
      }),
      loadAnalyticsPageData: async () => {
        throw new AnalyticsRangeLimitError(105, 90);
      },
      recordObservation: async () => undefined,
    },
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /最多只支持 90 天/);
});

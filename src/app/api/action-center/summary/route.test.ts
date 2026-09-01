import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { ActionCenterAccessOptions } from "@/lib/action-center/server";

import { buildActionCenterSummaryResponse } from "./route";

function request(path = "/api/action-center/summary") {
  return new NextRequest(`https://dydata.test${path}`);
}

const memberPermissionInfo = {
  userId: "member-1",
  name: "组员",
  role: "member" as const,
  permissions: { view_analytics: true, export_data: true },
  dataScope: "self" as const,
  teamId: "team-a",
  companyRole: "member" as const,
  membershipStatus: "active" as const,
};

test("行动中枢 summary 对组员只读取自己的通知，不开启审批来源", async () => {
  const loadInput = {} as Record<string, unknown>;
  const response = await buildActionCenterSummaryResponse(request(), {
    getCurrentUserContext: async () => ({
      user: { id: "member-1" },
      authError: null,
    }) as never,
    getUserPermissions: async () => memberPermissionInfo,
    buildPermissionContextFromPermissionInfo: async () => ({
      permissionInfo: memberPermissionInfo,
      scope: {
        kind: "self" as const,
        teamId: "team-a",
        visibleUserIds: ["member-1"],
        activeVisibleUserIds: ["member-1"],
      },
    }) as never,
    loadActionCenterSummary: async (input) => {
      Object.assign(loadInput, input as unknown as Record<string, unknown>);
      return {
        urgentCount: 0,
        todoCount: 0,
        approvalCount: 0,
        topItems: [],
        updatedAt: "2026-09-01T08:00:00.000Z",
      };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(loadInput?.userId, "member-1");
  assert.equal(loadInput?.canManageExemptions, false);
  assert.equal(loadInput?.canViewOrphanDetails, false);
});

test("行动中枢上游失败返回明确 500，不伪装成空列表", async () => {
  const response = await buildActionCenterSummaryResponse(request(), {
    getCurrentUserContext: async () => ({
      user: { id: "owner-1" },
      authError: null,
    }) as never,
    getUserPermissions: async () => ({
      ...memberPermissionInfo,
      userId: "owner-1",
      role: "admin" as const,
      permissions: { manage_fulfillment: true },
      companyRole: "admin" as const,
    }),
    buildPermissionContextFromPermissionInfo: async () => ({
      permissionInfo: memberPermissionInfo,
      scope: {
        kind: "team" as const,
        teamId: "team-a",
        visibleUserIds: ["owner-1"],
        activeVisibleUserIds: ["owner-1"],
      },
    }) as never,
    loadActionCenterSummary: async () => {
      throw new Error("数据库不可用");
    },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "行动中枢暂时无法同步，请稍后重试",
  });
});

test("管理员只把当前团队范围交给行动中枢，老板集团模式才开启全局归属来源", async () => {
  const received: ActionCenterAccessOptions[] = [];
  const buildDeps = (permissionInfo: UserPermissionInfo, scope: { kind: "team" | "all"; teamId: string | null }) => ({
    getCurrentUserContext: async () => ({
      user: { id: permissionInfo.userId },
      authError: null,
    }) as never,
    getUserPermissions: async () => permissionInfo,
    buildPermissionContextFromPermissionInfo: async () => ({
      permissionInfo,
      scope: {
        ...scope,
        visibleUserIds: [permissionInfo.userId],
        activeVisibleUserIds: [permissionInfo.userId],
      },
    }) as never,
    loadActionCenterSummary: async (input: ActionCenterAccessOptions) => {
      received.push(input);
      return {
        urgentCount: 0,
        todoCount: 0,
        approvalCount: 0,
        topItems: [],
        updatedAt: "2026-09-01T08:00:00.000Z",
      };
    },
  });

  await buildActionCenterSummaryResponse(
    request(),
    buildDeps(
      {
        ...memberPermissionInfo,
        userId: "admin-1",
        role: "admin",
        permissions: { manage_fulfillment: true },
        companyRole: "admin",
      },
      { kind: "team", teamId: "team-a" },
    ),
  );
  await buildActionCenterSummaryResponse(
    request(),
    buildDeps(
      {
        ...memberPermissionInfo,
        userId: "owner-1",
        role: "admin",
        permissions: { manage_fulfillment: true },
        companyRole: "company_owner",
      },
      { kind: "all", teamId: "team-a" },
    ),
  );

  assert.equal(received[0].canManageExemptions, true);
  assert.equal(received[0].canViewOrphanDetails, false);
  assert.deepEqual(received[0].scope, {
    kind: "team",
    teamId: "team-a",
    visibleUserIds: ["admin-1"],
    activeVisibleUserIds: ["admin-1"],
  });
  assert.equal(received[1].canManageExemptions, true);
  assert.equal(received[1].canViewOrphanDetails, true);
  assert.equal((received[1].scope as { kind: string }).kind, "all");
});

test("未登录请求返回 401", async () => {
  const response = await buildActionCenterSummaryResponse(request(), {
    getCurrentUserContext: async () => ({
      user: null,
      authError: null,
    }) as never,
    getUserPermissions: async () => {
      throw new Error("不应读取权限");
    },
    buildPermissionContextFromPermissionInfo: async () => null,
    loadActionCenterSummary: async () => {
      throw new Error("不应读取行动项");
    },
  });

  assert.equal(response.status, 401);
});

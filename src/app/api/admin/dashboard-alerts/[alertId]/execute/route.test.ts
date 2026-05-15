import test from "node:test";
import assert from "node:assert/strict";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import type { ToolExecutionResult } from "@/lib/admin-tools";
import type { DataAccessScope } from "@/lib/data-access-scope";

import { buildExecuteDashboardAlertResponse } from "./route";

function buildOwnerAuth() {
  return {
    supabase: {} as never,
    actor: {
      userId: "owner-1",
      role: "owner" as const,
      businessRole: "owner" as const,
      permissions: {
        view_analytics: true,
        view_all_data: true,
        edit_data: true,
        manage_members: true,
      },
      name: "阿禅",
    },
  };
}

function buildAlert(options?: {
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}) {
  return {
    id: "submission:no-submission:user-1:2026-05-14",
    source: "submission" as const,
    severity: "warning" as const,
    title: "连续未填报",
    detail: "连续 2 天未填报",
    affectedEntities: [
      {
        type: "profile" as const,
        id: "user-1",
        name: "张三",
      },
    ],
    suggestedActions: [
      {
        label: "查看成员",
        type: "execute_tool" as const,
        toolName: options?.toolName ?? "getUserInfo",
        toolArgs: options?.toolArgs ?? { userId: "user-1" },
      },
    ],
    createdAt: "2026-05-14T01:00:00.000Z",
  };
}

function buildDeps(options?: {
  authResult?: Awaited<ReturnType<typeof requireAdminActor>>;
  alert?: ReturnType<typeof buildAlert>;
  executeResult?: ToolExecutionResult;
  shouldRequireConfirmation?: boolean;
}) {
  const scope: DataAccessScope = {
    userId: "owner-1",
    role: "owner",
    businessRole: "owner",
    permissions: { view_analytics: true, view_all_data: true, edit_data: true, manage_members: true },
    accessLevel: 4,
    teamId: null,
    groupId: null,
    kind: "all",
    visibleUserIds: ["user-1"],
  };

  return {
    requireAdminActor: async () => options?.authResult ?? buildOwnerAuth(),
    createAdminClient: () => ({}) as never,
    buildDataAccessScope: async () => scope,
    aggregateDashboardAlerts: async () => ({
      alerts: [options?.alert ?? buildAlert()],
      groupedBySeverity: {
        critical: [],
        warning: [options?.alert ?? buildAlert()],
        info: [],
      },
      summary: {
        total: 1,
        critical: 0,
        warning: 1,
        info: 0,
        bySource: {
          submission: 1,
          playback: 0,
          violation: 0,
          conversion: 0,
          upload: 0,
          task: 0,
        },
      },
    }),
    executeAdminTool: async () =>
      options?.executeResult ?? {
        success: true,
        data: { user: { id: "user-1", name: "张三" } },
      },
    shouldRequireConfirmation: () => options?.shouldRequireConfirmation ?? false,
  };
}

test("dashboard-alerts execute 鉴权失败时返回原状态码", async () => {
  const response = await buildExecuteDashboardAlertResponse(
    {
      alertId: "submission:no-submission:user-1:2026-05-14",
      body: { toolName: "getUserInfo" },
    },
    buildDeps({
      authResult: {
        error: "无权限",
        status: 403,
      },
    }),
  );

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.error, "无权限");
});

test("dashboard-alerts execute 只允许执行该告警登记过的工具", async () => {
  const response = await buildExecuteDashboardAlertResponse(
    {
      alertId: "submission:no-submission:user-1:2026-05-14",
      body: { toolName: "diagnoseIssue" },
    },
    buildDeps(),
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "该告警不允许执行这个工具");
});

test("dashboard-alerts execute 遇到需确认工具时返回 409", async () => {
  let executed = false;
  const response = await buildExecuteDashboardAlertResponse(
    {
      alertId: "submission:no-submission:user-1:2026-05-14",
      body: { toolName: "clearCache", toolArgs: { cacheType: "all" } },
    },
    {
      ...buildDeps({
        alert: buildAlert({ toolName: "clearCache", toolArgs: { cacheType: "all" } }),
        shouldRequireConfirmation: true,
      }),
      executeAdminTool: async () => {
        executed = true;
        return { success: true, data: { cacheType: "all" } };
      },
    },
  );

  assert.equal(executed, false);
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.success, false);
});

test("dashboard-alerts execute 工具执行失败时返回 success=false", async () => {
  const response = await buildExecuteDashboardAlertResponse(
    {
      alertId: "submission:no-submission:user-1:2026-05-14",
      body: { toolName: "getUserInfo", toolArgs: { userId: "user-1" } },
    },
    buildDeps({
      executeResult: {
        success: false,
        error: "用户不存在",
      },
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.error, "用户不存在");
});

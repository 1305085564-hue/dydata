import test from "node:test";
import assert from "node:assert/strict";

import { __internal, buildDashboardAlertsResponse } from "./route";

test("dashboard-alerts GET 在 mock 聚合结果下返回非空数据", async () => {
  __internal.resetDashboardAlertsCache();
  const response = await buildDashboardAlertsResponse({
    requireAdminActor: async () => ({
      supabase: {} as never,
      actor: {
        userId: "owner-1",
        role: "owner" as const,
        businessRole: "owner" as const,
        permissions: { view_analytics: true },
        name: "阿禅",
      },
    }),
    createAdminClient: () => ({}) as never,
    buildDataAccessScope: async () => ({
      userId: "owner-1",
      role: "owner" as const,
      businessRole: "owner" as const,
      permissions: { view_analytics: true },
      accessLevel: 4,
      teamId: null,
      groupId: null,
      kind: "all" as const,
      visibleUserIds: ["user-1"],
    }),
    aggregateDashboardAlerts: async () => ({
      alerts: [
        {
          id: "submission:no-submission:user-1:2026-05-14",
          source: "submission",
          severity: "warning",
          title: "连续未填报",
          detail: "连续 2 天未填报",
          affectedEntities: [
            {
              type: "profile",
              id: "user-1",
              name: "张三",
            },
          ],
          suggestedActions: [
            {
              label: "查看成员",
              type: "execute_tool",
              toolName: "getUserInfo",
              toolArgs: { userId: "user-1" },
            },
          ],
          createdAt: "2026-05-14T01:00:00.000Z",
        },
      ],
      groupedBySeverity: {
        critical: [],
        warning: [
          {
            id: "submission:no-submission:user-1:2026-05-14",
            source: "submission",
            severity: "warning",
            title: "连续未填报",
            detail: "连续 2 天未填报",
            affectedEntities: [
              {
                type: "profile",
                id: "user-1",
                name: "张三",
              },
            ],
            suggestedActions: [
              {
                label: "查看成员",
                type: "execute_tool",
                toolName: "getUserInfo",
                toolArgs: { userId: "user-1" },
              },
            ],
            createdAt: "2026-05-14T01:00:00.000Z",
          },
        ],
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
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(Array.isArray(payload.alerts), true);
  assert.equal(payload.alerts.length, 1);
  assert.equal(payload.summary.total, 1);
});

test("dashboard-alerts GET 同 scope 60 秒内复用服务端缓存", async () => {
  __internal.resetDashboardAlertsCache();
  let calls = 0;

  const deps = {
    requireAdminActor: async () => ({
      supabase: {} as never,
      actor: {
        userId: "owner-1",
        role: "owner" as const,
        businessRole: "owner" as const,
        permissions: { view_analytics: true },
        name: "阿禅",
      },
    }),
    createAdminClient: () => ({}) as never,
    buildDataAccessScope: async () => ({
      userId: "owner-1",
      role: "owner" as const,
      businessRole: "owner" as const,
      permissions: { view_analytics: true },
      accessLevel: 4 as const,
      teamId: null,
      groupId: null,
      kind: "all" as const,
      visibleUserIds: ["user-1"],
    }),
    aggregateDashboardAlerts: async () => {
      calls += 1;
      return {
        alerts: [],
        groupedBySeverity: { critical: [], warning: [], info: [] },
        summary: {
          total: 0,
          critical: 0,
          warning: 0,
          info: 0,
          bySource: {
            submission: 0,
            playback: 0,
            violation: 0,
            conversion: 0,
            upload: 0,
            task: 0,
          },
        },
      };
    },
  } as const;

  const first = await buildDashboardAlertsResponse(deps);
  const second = await buildDashboardAlertsResponse(deps);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
  assert.equal(first.headers.get("cache-control"), "private, max-age=60");
  assert.equal(second.headers.get("cache-control"), "private, max-age=60");
});

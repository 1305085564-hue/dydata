import test from "node:test";
import assert from "node:assert/strict";

import type { AlertAggregationResult, DashboardAlertScope } from "./types";

test("告警聚合合同允许空数组、0 统计和 null 团队", () => {
  const scope: DashboardAlertScope = { actorUserId: "owner-1", businessRole: "owner", teamId: null, visibleUserIds: [] };
  const result: AlertAggregationResult = {
    alerts: [],
    groupedBySeverity: { critical: [], warning: [], info: [] },
    summary: {
      total: 0, critical: 0, warning: 0, info: 0,
      bySource: { submission: 0, playback: 0, violation: 0, conversion: 0, upload: 0, task: 0 },
    },
  };
  assert.equal(scope.teamId, null);
  assert.deepEqual(result.alerts, []);
  assert.equal(result.summary.total, 0);
});

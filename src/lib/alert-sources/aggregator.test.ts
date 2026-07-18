import test from "node:test";
import assert from "node:assert/strict";

import { aggregateDashboardAlerts } from "./aggregator";

function emptyClient() {
  const query = { select: () => query, eq: () => query, in: () => query, is: () => query, gte: () => query, lte: () => query, order: () => query, then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject) };
  return { from: () => query };
}

test("所有检测器返回空时生成完整 0 统计", async () => {
  const result = await aggregateDashboardAlerts({ supabase: emptyClient() as never, scope: { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: [] }, now: new Date("2026-07-18T04:00:00.000Z") });
  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.groupedBySeverity, { critical: [], warning: [], info: [] });
  assert.deepEqual(result.summary, { total: 0, critical: 0, warning: 0, info: 0, bySource: { submission: 0, playback: 0, violation: 0, conversion: 0, upload: 0, task: 0 } });
});

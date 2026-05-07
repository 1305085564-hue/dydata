import test from "node:test";
import assert from "node:assert/strict";

import type { DashboardAlertGroup } from "./alert-groups";

test("异常告警按人聚合并统计每个人的异常数量", async () => {
  const mod = await import(new URL("./alert-groups.ts", import.meta.url).href).catch(() => null);

  assert.ok(mod, "expected alert-groups helper to exist");

  const groups = mod.groupDashboardAlerts([
    {
      id: "a1",
      severity: "critical",
      message: "小张 数据报表超时未交",
      userId: "u1",
      userName: "小张",
      checkpointLabel: "数据报表",
    },
    {
      id: "a2",
      severity: "warning",
      message: "小张 选题策划超时未交",
      userId: "u1",
      userName: "小张",
      checkpointLabel: "选题策划",
    },
    {
      id: "a3",
      severity: "critical",
      message: "小李 今日数据断更",
      userId: "u2",
      userName: "小李",
      checkpointLabel: "数据报表",
    },
  ]) as DashboardAlertGroup[];

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => ({
      userName: group.userName,
      count: group.count,
      criticalCount: group.criticalCount,
      warningCount: group.warningCount,
    })),
    [
      { userName: "小张", count: 2, criticalCount: 1, warningCount: 1 },
      { userName: "小李", count: 1, criticalCount: 1, warningCount: 0 },
    ],
  );
});

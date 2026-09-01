import assert from "node:assert/strict";
import test from "node:test";

import { buildActionCenterSummary } from "./server";
import type { ActionItem } from "./types";

function item(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: "item-1",
    source: "notification",
    priority: "P2",
    title: "待处理事项",
    description: "需要确认下一步",
    actionLabel: "去处理",
    actionUrl: "/dashboard",
    action: { type: "navigate", url: "/dashboard" },
    status: "open",
    createdAt: "2026-09-01T08:00:00.000Z",
    dedupeKey: "notification:item-1",
    ...overrides,
  };
}

test("行动中枢汇总各来源，红点计数只由开放行动项组成", () => {
  const summary = buildActionCenterSummary({
    notifications: {
      items: [
        item({ id: "risk-1", priority: "P0", dedupeKey: "system:risk-1" }),
        item({ id: "todo-1", priority: "P2", dedupeKey: "notification:todo-1" }),
      ],
      count: 2,
      urgentCount: 1,
    },
    approvals: {
      items: [
        item({
          id: "approval-1",
          source: "exemption",
          priority: "P1",
          actionUrl: null,
          action: {
            type: "review-exemption",
            endpoint: "/api/exemptions/review",
            method: "POST",
            requestId: "request-1",
          },
          dedupeKey: "exemption:request-1",
        }),
      ],
      count: 1,
    },
    orphanCount: 2,
    updatedAt: "2026-09-01T08:10:00.000Z",
  });

  assert.equal(summary.urgentCount, 1);
  assert.equal(summary.todoCount, 5);
  assert.equal(summary.approvalCount, 1);
  assert.equal(summary.updatedAt, "2026-09-01T08:10:00.000Z");
  assert.equal(summary.topItems[0].priority, "P0");
  assert.ok(summary.topItems.some((entry) => entry.dedupeKey === "exemption:orphan"));
  assert.equal(new Set(summary.topItems.map((entry) => entry.dedupeKey)).size, summary.topItems.length);
});

test("没有开放事项时 summary 不亮红点，也不制造占位事项", () => {
  const summary = buildActionCenterSummary({
    notifications: { items: [], count: 0, urgentCount: 0 },
    approvals: { items: [], count: 0 },
    orphanCount: 0,
    updatedAt: "2026-09-01T08:10:00.000Z",
  });

  assert.deepEqual(summary, {
    urgentCount: 0,
    todoCount: 0,
    approvalCount: 0,
    topItems: [],
    updatedAt: "2026-09-01T08:10:00.000Z",
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildActionCenterSummary, loadPendingExemptionSource } from "./server";
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
    exemption_category: null,
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

test("行动中枢待审批来源携带 exemption_category 并在标题区分请假/免交", async () => {
  let selectString = "";
  const rows = [
    {
      id: "request-1",
      applicant_user_id: "applicant-1",
      team_id: "team-1",
      exemption_type: "range",
      exemption_category: "waive",
      start_date: "2026-09-01",
      end_date: "2026-09-03",
      reason: "数据波动免交",
      created_at: "2026-09-01T08:00:00.000Z",
    },
  ];
  const client = {
    from(table: string) {
      if (table === "exemption_request") {
        // supabase 的查询对象可继续链式 .in() 且整体可 await
        const query = {
          select(s: string, opts?: { count: string }) {
            selectString = s;
            void opts;
            return this;
          },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          in() { return this; },
          then(resolve: (value: { data: typeof rows; count: number; error: null }) => void) {
            resolve({ data: rows, count: 1, error: null });
          },
        };
        return query;
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: [{ id: "applicant-1", name: "王五" }], error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const source = await loadPendingExemptionSource({
    scope: {
      kind: "team",
      visibleUserIds: ["applicant-1"],
      activeVisibleUserIds: ["applicant-1"],
    },
    client: client as never,
    limit: 8,
  });

  assert.match(selectString, /exemption_category/);
  assert.equal(source.count, 1);
  const first = source.items[0];
  assert.match(first.title, /免交/);
  assert.match(first.title, /自定义范围/);
  assert.ok(isReviewExemptionActionish(first));
});

test("行动中枢保留历史 NULL 分类并以明确兼容文案显示", async () => {
  const rows = [{
    id: "request-legacy",
    applicant_user_id: "applicant-legacy",
    team_id: "team-1",
    exemption_type: "single",
    exemption_category: null,
    start_date: "2026-09-01",
    end_date: null,
    reason: "历史记录",
    created_at: "2026-09-01T08:00:00.000Z",
  }];
  const client = {
    from(table: string) {
      if (table === "exemption_request") {
        const query = {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return this; },
          in() { return this; },
          then(resolve: (value: { data: typeof rows; count: number; error: null }) => void) {
            resolve({ data: rows, count: 1, error: null });
          },
        };
        return query;
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: [{ id: "applicant-legacy", name: "李四" }], error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const source = await loadPendingExemptionSource({
    scope: { kind: "all", visibleUserIds: [], activeVisibleUserIds: [] },
    client: client as never,
  });

  assert.equal(source.items[0].exemption_category, null);
  assert.match(source.items[0].title, /免交（历史兼容）/);
  assert.match(source.items[0].description, /免交（历史兼容）/);
});

function isReviewExemptionActionish(item: ActionItem) {
  return item.action?.type === "review-exemption";
}

test("审批很多时不会把普通待办从 summary 首屏挤空", () => {
  const notificationItems = Array.from({ length: 4 }, (_, index) =>
    item({
      id: `todo-${index}`,
      source: "permission",
      priority: "P2",
      title: `权限待办 ${index}`,
      createdAt: `2026-09-01T08:0${index}:00.000Z`,
      dedupeKey: `permission:todo-${index}`,
    }),
  );
  const approvalItems = Array.from({ length: 12 }, (_, index) =>
    item({
      id: `approval-${index}`,
      source: "exemption",
      priority: "P1",
      title: `审批 ${index}`,
      actionUrl: null,
      action: {
        type: "review-exemption",
        endpoint: "/api/exemptions/review",
        method: "POST",
        requestId: `request-${index}`,
      },
      createdAt: `2026-09-01T09:${String(index).padStart(2, "0")}:00.000Z`,
      dedupeKey: `exemption:request-${index}`,
    }),
  );

  const summary = buildActionCenterSummary({
    notifications: {
      items: notificationItems,
      count: 4,
      urgentCount: 0,
    },
    approvals: {
      items: approvalItems,
      count: 12,
    },
    updatedAt: "2026-09-01T09:20:00.000Z",
  });

  assert.equal(summary.todoCount, 16);
  assert.equal(summary.approvalCount, 12);
  assert.equal(summary.topItems.length, 8);
  assert.equal(
    summary.topItems.filter((entry) => entry.source !== "exemption").length,
    4,
  );
  assert.equal(
    summary.topItems.filter((entry) => entry.source === "exemption").length,
    4,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotificationActionItem,
  isReviewExemptionAction,
  normalizeInternalActionUrl,
} from "./types";

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1",
    user_id: "user-1",
    type: "permission.request",
    category: "todo" as const,
    severity: "warning" as const,
    title: "权限申请",
    body: "需要管理员确认",
    action_label: "去处理",
    action_url: "/admin/modules?member=user-1",
    payload: {},
    status: "read" as const,
    expires_at: null,
    source_type: "permission_request",
    source_id: "user-1:转化中心",
    created_at: "2026-09-01T08:00:00.000Z",
    read_at: "2026-09-01T08:01:00.000Z",
    done_at: null,
    ...overrides,
  };
}

test("待办通知映射为权限行动项并保留已读但未完成状态", () => {
  const item = buildNotificationActionItem(notification());

  assert.equal(item.source, "permission");
  assert.equal(item.priority, "P1");
  assert.equal(item.status, "open");
  assert.equal(item.actionUrl, "/admin/modules?member=user-1");
  assert.deepEqual(item.action, {
    type: "navigate",
    url: "/admin/modules?member=user-1",
  });
  assert.equal(item.dedupeKey, "permission:permission_request:user-1:转化中心");
});

test("通知行动项拒绝外部或协议相对跳转地址", () => {
  assert.equal(normalizeInternalActionUrl("https://example.com"), null);
  assert.equal(normalizeInternalActionUrl("//example.com"), null);
  assert.equal(normalizeInternalActionUrl("/admin/modules"), "/admin/modules");
});

test("关键通知映射为 P0，审批操作可被识别", () => {
  const item = buildNotificationActionItem(
    notification({
      id: "critical-1",
      type: "system.risk",
      source_type: "system_risk",
      source_id: "risk-1",
      severity: "critical",
      action_label: null,
      action_url: null,
    }),
  );

  assert.equal(item.source, "system");
  assert.equal(item.priority, "P0");
  assert.equal(item.action, null);
  assert.equal(isReviewExemptionAction(item.action), false);
});

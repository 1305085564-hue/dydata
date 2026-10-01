import test from "node:test";
import assert from "node:assert/strict";

import { isPublishedAtConfirmed, resolveVideoSubmitDeadline } from "./video-submit-deadline";

test("同月且 72 小时内允许首次提交", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-29T10:00:00+08:00",
    uploadedAt: "2026-09-30T10:00:00+08:00",
    businessDate: "2026-09-29",
  });
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "within_window");
});

test("超过 72 小时需要申请", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-27T10:00:00+08:00",
    uploadedAt: "2026-09-30T10:01:00+08:00",
    businessDate: "2026-09-27",
  });
  assert.equal(result.decision, "requires_appeal");
  assert.equal(result.reason, "expired");
});

test("跨月但未超过 72 小时仍可直接提交", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-30T20:00:00+08:00",
    uploadedAt: "2026-10-01T08:00:00+08:00",
    businessDate: "2026-09-30",
  });
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "within_window");
});

test("编辑历史记录跳过首次提交门禁", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "edit",
    publishedAt: "2026-01-01T10:00:00+08:00",
    uploadedAt: "2026-10-01T10:00:00+08:00",
    businessDate: "2026-01-01",
  });
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "edit");
});

test("上海时区跨 UTC 午夜仍按上海日期计算", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-30T16:30:00Z",
    uploadedAt: "2026-09-30T18:00:00Z",
    businessDate: "2026-09-30",
  });
  assert.equal(result.publishedDate, "2026-10-01");
  assert.equal(result.decision, "allow");
});

test("表单的无时区日期时间按上海时区解析", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-29T20:00",
    uploadedAt: "2026-09-30T20:00",
    businessDate: "2026-09-29",
  });
  assert.equal(result.elapsedHours, 24);
  assert.equal(result.decision, "allow");
});

test("首次创建发布时间未确认时要求确认（禁止默认时间静默放行）", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-29T19:00",
    uploadedAt: "2026-09-30T20:00",
    businessDate: "2026-09-29",
    publishedAtConfirmed: false,
  });
  assert.equal(result.decision, "requires_confirmation");
  assert.equal(result.reason, "unconfirmed_published_at");
});

test("首次创建发布时间已确认且在窗口内允许提交", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-29T10:00:00+08:00",
    uploadedAt: "2026-09-30T10:00:00+08:00",
    businessDate: "2026-09-29",
    publishedAtConfirmed: true,
  });
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "within_window");
});

test("跨月且发布时间未确认仍要求确认真实时间", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-30T20:00",
    uploadedAt: "2026-10-01T08:00:00+08:00",
    businessDate: "2026-09-30",
    publishedAtConfirmed: false,
  });
  assert.equal(result.decision, "requires_confirmation");
  assert.equal(result.reason, "unconfirmed_published_at");
});

test("编辑模式忽略发布时间确认要求", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "edit",
    publishedAt: "2026-09-29T19:00",
    uploadedAt: "2026-10-01T20:00",
    businessDate: "2026-09-29",
    publishedAtConfirmed: false,
  });
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "edit");
});

test("isPublishedAtConfirmed 只认非空文本（前后端共用同一判定）", () => {
  assert.equal(isPublishedAtConfirmed(""), false);
  assert.equal(isPublishedAtConfirmed("   "), false);
  assert.equal(isPublishedAtConfirmed(null), false);
  assert.equal(isPublishedAtConfirmed(undefined), false);
  assert.equal(isPublishedAtConfirmed("2026-09-26 19:00"), true);
});

test("未确认发布时间优先于 72 小时判定，用户拿不到申请补交的入口", () => {
  // 这是「截图识别不出发布时间」时用户被卡死的根因：即使已经超期，
  // 返回的也不是 requires_appeal，所以前端不会出现「申请补交」按钮。
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-20T10:00:00+08:00",
    uploadedAt: "2026-10-01T10:00:00+08:00",
    businessDate: "2026-09-20",
    publishedAtConfirmed: isPublishedAtConfirmed(""),
  });
  assert.equal(result.decision, "requires_confirmation");
  assert.equal(result.reason, "unconfirmed_published_at");
});

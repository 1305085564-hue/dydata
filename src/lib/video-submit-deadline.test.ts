import test from "node:test";
import assert from "node:assert/strict";

import {
  isPublishedAtConfirmed,
  parsePublishedAtText,
  resolveOcrPublishedAt,
  resolveVideoSubmitDeadline,
} from "./video-submit-deadline";

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

test("parsePublishedAtText 从 OCR 原文解析真实时间", () => {
  // OCR 原文常带后缀/中文写法，new Date() 直接解析会 Invalid
  assert.equal(parsePublishedAtText("2026-03-05 20:42 发布"), "2026-03-05T20:42");
  assert.equal(parsePublishedAtText("2026年3月5日 20:42"), "2026-03-05T20:42");
  assert.equal(parsePublishedAtText("发布时间：2026/03/05 20:42"), "2026-03-05T20:42");
  assert.equal(parsePublishedAtText("2026-03-05"), "2026-03-05T00:00");
  assert.equal(parsePublishedAtText("  2026-3-5 9:05  "), "2026-03-05T09:05");
});

test("parsePublishedAtText 拒绝解析不出或不合法的输入", () => {
  assert.equal(parsePublishedAtText(""), null);
  assert.equal(parsePublishedAtText("   "), null);
  assert.equal(parsePublishedAtText(null), null);
  assert.equal(parsePublishedAtText("昨天 19:00"), null);
  assert.equal(parsePublishedAtText("2026-02-31 10:00"), null);
  assert.equal(parsePublishedAtText("2026-13-01 10:00"), null);
  assert.equal(parsePublishedAtText("2026-03-05 25:00"), null);
});

test("resolveOcrPublishedAt 必须拿到真实时间，只识别到文字不放行", () => {
  // 情形一：ISO 解析失败、原文可解析 → 用原文解析出真实时间（解除「重传也写不进」的死循环）
  assert.deepEqual(
    resolveOcrPublishedAt(null, "2026-03-05 20:42 发布"),
    { publishedAt: "2026-03-05T20:42", publishedAtText: "2026-03-05 20:42 发布" },
  );
  // 情形二：ISO 可用但没给原文 → 用格式化文本补齐，两边同源
  assert.deepEqual(
    resolveOcrPublishedAt("2026-03-05T20:42", null),
    { publishedAt: "2026-03-05T20:42", publishedAtText: "2026-03-05 20:42" },
  );
  // 情形三：有文字但解析不出时间 → 必须返回 null，否则 published_at_text 被写入会让门禁放行，
  // 而 72 小时判定用的还是派生默认时间，等于绕过补交审批
  assert.equal(resolveOcrPublishedAt(null, "昨天 19:00"), null);
  assert.equal(resolveOcrPublishedAt(null, "刚刚发布"), null);
  assert.equal(resolveOcrPublishedAt("", "  "), null);
  assert.equal(resolveOcrPublishedAt(null, null), null);
});

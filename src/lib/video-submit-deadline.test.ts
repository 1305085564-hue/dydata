import test from "node:test";
import assert from "node:assert/strict";

import { resolveVideoSubmitDeadline } from "./video-submit-deadline";

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

test("跨月即使未超过 72 小时也需要申请", () => {
  const result = resolveVideoSubmitDeadline({
    mode: "create",
    publishedAt: "2026-09-30T20:00:00+08:00",
    uploadedAt: "2026-10-01T08:00:00+08:00",
    businessDate: "2026-09-30",
  });
  assert.equal(result.decision, "requires_appeal");
  assert.equal(result.reason, "cross_month");
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
  assert.equal(result.decision, "requires_appeal");
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

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatHourText,
  getBizDateHelperText,
  getRecentBizDateRange,
  isBizDateSelectable,
  syncPublishedAtAndText,
  toManualFieldState,
  type EditableMetricKey,
} from "./填报表单状态";

test("biz_date 默认可选最近 7 天", () => {
  const range = getRecentBizDateRange("2026-03-22");

  assert.deepEqual(range, [
    "2026-03-16",
    "2026-03-17",
    "2026-03-18",
    "2026-03-19",
    "2026-03-20",
    "2026-03-21",
    "2026-03-22",
  ]);
});

test("biz_date 允许补交历史日期但不允许未来日期", () => {
  assert.equal(isBizDateSelectable("2026-03-22", "2026-03-22"), true);
  assert.equal(isBizDateSelectable("2026-03-22", "2026-03-16"), true);
  assert.equal(isBizDateSelectable("2026-03-22", "2026-03-01"), true);
  assert.equal(isBizDateSelectable("2026-03-22", "2026-03-23"), false);
});

test("周末 biz_date 显示补传提示", () => {
  assert.equal(getBizDateHelperText("2026-03-21"), "周末内容，数据可在周一上传");
  assert.equal(getBizDateHelperText("2026-03-22"), "周末内容，数据可在周一上传");
  assert.equal(getBizDateHelperText("2026-03-20"), null);
});

test("选择发布时间后自动生成小时文本", () => {
  assert.equal(formatHourText("2026-03-22T10:00"), "10点");
  assert.equal(formatHourText("2026-03-22T10:30"), "10点30分");
  assert.equal(formatHourText(""), "");
});

test("时间选择器与文本输入互联", () => {
  assert.deepEqual(syncPublishedAtAndText({
    nextPublishedAt: "2026-03-22T10:00",
    nextPublishedAtText: "",
    changedField: "published_at",
  }), {
    publishedAt: "2026-03-22T10:00",
    publishedAtText: "10点",
  });

  assert.deepEqual(syncPublishedAtAndText({
    nextPublishedAt: "2026-03-22T10:00",
    nextPublishedAtText: "10点左右",
    changedField: "published_at_text",
  }), {
    publishedAt: "2026-03-22T10:00",
    publishedAtText: "10点左右",
  });
});

test("手动修改字段后来源切为 manual 且自动确认", () => {
  const result = toManualFieldState({
    key: "play_count" as EditableMetricKey,
    value: "3.21",
    source: "ocr",
    requiresManualConfirmation: true,
    confirmed: false,
    confidenceScore: 0.6,
  });

  assert.deepEqual(result, {
    key: "play_count",
    value: "3.21",
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceScore: 0.6,
  });
});

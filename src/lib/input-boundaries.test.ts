import assert from "node:assert/strict";
import test from "node:test";

import {
  EXEMPTION_REASON_MAX_LENGTH,
  REPORT_COUNT_MAX,
  REPORT_TEXT_MAX_LENGTH,
  validateAdminDailyReportUpdate,
  validateReportMetricBoundaries,
  validateTextBoundary,
} from "./input-boundaries";

const validAdminReport = {
  title: "复盘标题",
  play_count: 1000,
  completion_rate: "35.5",
  avg_play_duration: "12.8",
  bounce_rate_2s: "22",
  completion_rate_5s: "48",
  likes: 20,
  comments: 3,
  shares: 2,
  favorites: 4,
  follower_gain: 5,
  follower_convert: 1,
};

test("日报指标边界拒绝负数和极大数字", () => {
  assert.deepEqual(
    validateReportMetricBoundaries({ play_count: -1 }),
    { ok: false, error: "播放量不能为负数" },
  );
  assert.deepEqual(
    validateReportMetricBoundaries({ likes: REPORT_COUNT_MAX + 1 }),
    { ok: false, error: `点赞数不能超过 ${REPORT_COUNT_MAX}` },
  );
});

test("日报指标边界拒绝比例越界和非数字", () => {
  assert.deepEqual(
    validateReportMetricBoundaries({ completion_rate_5s: "101" }),
    { ok: false, error: "5秒完播率必须在 0-100 之间" },
  );
  assert.deepEqual(
    validateReportMetricBoundaries({ avg_play_duration: "abc" }),
    { ok: false, error: "平均播放时长必须是有效数字" },
  );
});

test("管理员日报编辑复用同一套指标与标题边界", () => {
  assert.equal(validateAdminDailyReportUpdate(validAdminReport).ok, true);
  assert.deepEqual(
    validateAdminDailyReportUpdate({ ...validAdminReport, title: "x".repeat(121) }),
    { ok: false, error: "标题不能超过 120 个字符" },
  );
  assert.deepEqual(
    validateAdminDailyReportUpdate({ ...validAdminReport, follower_convert: -1 }),
    { ok: false, error: "导粉数不能为负数" },
  );
});

test("长文本边界拒绝超长内容，不做无声截断", () => {
  assert.deepEqual(
    validateTextBoundary({
      label: "豁免理由",
      value: "x".repeat(EXEMPTION_REASON_MAX_LENGTH + 1),
      maxLength: EXEMPTION_REASON_MAX_LENGTH,
    }),
    { ok: false, error: `豁免理由不能超过 ${EXEMPTION_REASON_MAX_LENGTH} 个字符` },
  );
  assert.deepEqual(
    validateTextBoundary({
      label: "文案",
      value: "x".repeat(REPORT_TEXT_MAX_LENGTH + 1),
      maxLength: REPORT_TEXT_MAX_LENGTH,
      required: true,
    }),
    { ok: false, error: `文案不能超过 ${REPORT_TEXT_MAX_LENGTH} 个字符` },
  );
});

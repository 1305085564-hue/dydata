import assert from "node:assert/strict";
import test from "node:test";

import { VIDEO_REVIEW_RULE_THRESHOLDS } from "./video-review-thresholds";

/**
 * 这五项是视频复盘的异常判定口径。管理员编辑入口已于 2026-09-26 下线，
 * 改值只能走代码发布；本测试是那道闸门，数值变动必须是有意的。
 * 行为覆盖（告警文案、优先级计分）在 review-queue.test.ts。
 */
test("视频复盘异常判定规则固定为代码内常量", () => {
  assert.deepEqual(VIDEO_REVIEW_RULE_THRESHOLDS, {
    bounce_rate_2s: 30,
    completion_rate_5s: 50,
    avg_play_duration: 30,
    completion_rate: 5,
    play_count: 1000,
  });
});

test("样本下限固定为 1000：低于该值的稿子按样本不足降灰", () => {
  assert.equal(VIDEO_REVIEW_RULE_THRESHOLDS.play_count, 1000);
});

test("比率类警戒线保持 0-100 的有效区间，时长阈值非负", () => {
  for (const key of ["bounce_rate_2s", "completion_rate_5s", "completion_rate"] as const) {
    const value = VIDEO_REVIEW_RULE_THRESHOLDS[key];
    assert.equal(value >= 0 && value <= 100, true, `${key} 必须落在 0-100`);
  }
  assert.equal(VIDEO_REVIEW_RULE_THRESHOLDS.avg_play_duration >= 0, true);
});

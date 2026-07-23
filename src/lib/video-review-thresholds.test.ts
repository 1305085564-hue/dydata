import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  normalizeVideoReviewThresholds,
  parseVideoReviewThresholds,
} from "./video-review-thresholds";

test("视频复盘阈值接受合法配置", () => {
  const result = parseVideoReviewThresholds({
    bounce_rate_2s: 25.5,
    completion_rate_5s: 60,
    avg_play_duration: 12.5,
    completion_rate: 8,
    play_count: 1500,
  });

  assert.deepEqual("data" in result && result.data, {
    bounce_rate_2s: 25.5,
    completion_rate_5s: 60,
    avg_play_duration: 12.5,
    completion_rate: 8,
    play_count: 1500,
  });
});

test("视频复盘阈值拒绝越界百分比和非整数播放量", () => {
  assert.equal("error" in parseVideoReviewThresholds({
    ...DEFAULT_VIDEO_REVIEW_THRESHOLDS,
    bounce_rate_2s: 101,
  }), true);
  assert.equal("error" in parseVideoReviewThresholds({
    ...DEFAULT_VIDEO_REVIEW_THRESHOLDS,
    play_count: 1.5,
  }), true);
});

test("空配置或损坏配置回退默认值", () => {
  assert.deepEqual(normalizeVideoReviewThresholds(null), DEFAULT_VIDEO_REVIEW_THRESHOLDS);
  assert.deepEqual(normalizeVideoReviewThresholds({ play_count: "1000" }), DEFAULT_VIDEO_REVIEW_THRESHOLDS);
});

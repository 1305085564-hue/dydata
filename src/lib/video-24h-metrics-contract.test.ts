import assert from "node:assert/strict";
import test from "node:test";

import {
  NULLABLE_VIDEO_24H_METRIC_KEYS,
  REQUIRED_VIDEO_24H_METRIC_KEYS,
  VIDEO_24H_METRIC_DEFINITIONS,
  isNullableVideo24hApiKey,
  parseNullableMetricInput,
} from "./video-24h-metrics-contract";

test("24h 指标契约只在一个地方声明必填和可空规则", () => {
  assert.deepEqual(REQUIRED_VIDEO_24H_METRIC_KEYS, [
    "play_count",
    "likes",
    "comments",
    "shares",
    "favorites",
    "follower_gain",
  ]);
  assert.deepEqual(NULLABLE_VIDEO_24H_METRIC_KEYS, [
    "follower_loss",
    "follower_convert",
    "avg_play_duration",
    "bounce_rate_2s",
    "completion_rate_5s",
    "completion_rate",
  ]);
  assert.equal(VIDEO_24H_METRIC_DEFINITIONS.length, 12);
});

test("null 与 0 的输入语义不同：空值保留 null，明确输入 0 保留 0", () => {
  assert.equal(parseNullableMetricInput(""), null);
  assert.equal(parseNullableMetricInput(null), null);
  assert.equal(parseNullableMetricInput("0"), 0);
  assert.equal(parseNullableMetricInput(" 0 "), 0);
  assert.equal(parseNullableMetricInput("8"), 8);
});

test("读取端按同一契约放行 nullable API 字段", () => {
  assert.equal(isNullableVideo24hApiKey("followerConvert"), true);
  assert.equal(isNullableVideo24hApiKey("completionRate"), true);
  assert.equal(isNullableVideo24hApiKey("playCount"), false);
});

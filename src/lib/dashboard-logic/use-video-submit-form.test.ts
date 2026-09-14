import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMetric,
  parseMetricFieldOrNull,
  parseMetricOrNull,
} from "./use-video-submit-form";

test("落库解析按字段类型清洗 rate 与 duration，非法单位不落错值", () => {
  assert.equal(parseMetricFieldOrNull("bounce_rate_2s", "1.2w"), null);
  assert.equal(parseMetricFieldOrNull("completion_rate", "1:20"), null);
  assert.equal(parseMetricFieldOrNull("avg_play_duration", "1.2w"), null);
  assert.equal(parseMetricFieldOrNull("avg_play_duration", "1:20"), 80);
});

test("计数字段仍支持万单位，带类型解析保留 fallback 语义", () => {
  assert.equal(parseMetricOrNull("1.2w", "count"), 12000);
  assert.equal(parseMetric("1:20", "rate", -1), -1);
});

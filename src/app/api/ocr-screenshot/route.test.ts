import test from "node:test";
import assert from "node:assert/strict";

import {
  parseClassificationContent,
  parseCurveContent,
  parseRetentionContent,
} from "./route";

test("自动分类识别截图类型", () => {
  const result = parseClassificationContent('{"screenshot_type":"curve"}');

  assert.equal(result, "curve");
});

test("推流曲线识别返回结构化字段", () => {
  const result = parseCurveContent(
    JSON.stringify({
      recognized: true,
      curve_pattern: "二次起量",
      first_peak_position: "前段",
      drop_severity: "medium",
      tail_strength: "high",
      confidence: 0.86,
    })
  );

  assert.deepEqual(result, {
    recognized: true,
    curve_pattern: "二次起量",
    first_peak_position: "前段",
    drop_severity: "medium",
    tail_strength: "high",
    confidence: 0.86,
  });
});

test("跳出回看图识别返回 retention_analysis", () => {
  const result = parseRetentionContent(
    JSON.stringify({
      recognized: true,
      retention_analysis: {
        bounce_peak_time: "0-3秒",
        replay_peak_time: "12-15秒",
        segment_summary: [
          { segment: "0-5秒", performance: "跳出高" },
          { segment: "10-15秒", performance: "回看明显" },
        ],
      },
      confidence: 0.78,
    })
  );

  assert.deepEqual(result, {
    recognized: true,
    retention_analysis: {
      bounce_peak_time: "0-3秒",
      replay_peak_time: "12-15秒",
      segment_summary: [
        { segment: "0-5秒", performance: "跳出高" },
        { segment: "10-15秒", performance: "回看明显" },
      ],
    },
    confidence: 0.78,
  });
});

test("识别失败时返回非阻塞结果", () => {
  const result = parseCurveContent(
    JSON.stringify({
      recognized: false,
      reason: "图片不清晰",
    })
  );

  assert.deepEqual(result, {
    recognized: false,
    reason: "图片不清晰",
  });
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  getScreenshotTypeByAssetRole,
  parseClassificationContent,
  parseCurveContent,
  parseOcrResponse,
  parseRetentionContent,
} from "./route";

test("asset_role 强制映射截图类型", () => {
  assert.equal(getScreenshotTypeByAssetRole("overview"), "data");
  assert.equal(getScreenshotTypeByAssetRole("traffic_curve"), "curve");
  assert.equal(getScreenshotTypeByAssetRole("retention_curve"), "retention");
  assert.equal(getScreenshotTypeByAssetRole("engagement_extra"), "data");
  assert.equal(getScreenshotTypeByAssetRole("other"), "data");
  assert.equal(getScreenshotTypeByAssetRole("screenshot_1"), "data");
  assert.equal(getScreenshotTypeByAssetRole("screenshot_2"), "retention");
  assert.equal(getScreenshotTypeByAssetRole("unknown"), null);
});

test("自动分类识别截图类型", () => {
  const result = parseClassificationContent('{"screenshot_type":"curve"}');

  assert.equal(result, "curve");
});

test("overview OCR 返回待确认结果结构", () => {
  const result = parseOcrResponse(
    JSON.stringify({
      play_count: 32100,
      likes: 1280,
      comments: 68,
      shares: 15,
      favorites: 106,
      follower_gain: 42,
      confidence: {
        play_count: "high",
        likes: "medium",
        comments: "high",
        shares: "low",
        favorites: "high",
        follower_gain: "medium",
      },
    }),
    "overview"
  );

  assert.deepEqual(result, {
    slot_status: "pending_confirm",
    screenshot_type: "data",
    confidence_score: 0.67,
    requires_manual_confirmation: true,
    recognized_fields: {
      play_count: 32100,
      likes: 1280,
      comments: 68,
      shares: 15,
      favorites: 106,
      follower_gain: 42,
    },
    confidence: {
      play_count: "high",
      likes: "medium",
      comments: "high",
      shares: "low",
      favorites: "high",
      follower_gain: "medium",
    },
  });
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

test("低置信曲线结果会标记待确认", () => {
  const result = parseOcrResponse(
    JSON.stringify({
      recognized: true,
      curve_pattern: "二次起量",
      first_peak_position: "前段",
      drop_severity: "medium",
      tail_strength: "high",
      confidence: 0.68,
    }),
    "traffic_curve"
  );

  assert.deepEqual(result, {
    slot_status: "pending_confirm",
    screenshot_type: "curve",
    confidence_score: 0.68,
    requires_manual_confirmation: true,
    recognized_fields: {
      recognized: true,
      curve_pattern: "二次起量",
      first_peak_position: "前段",
      drop_severity: "medium",
      tail_strength: "high",
      confidence: 0.68,
    },
  });
});

test("跳出回看图识别返回 retention_metrics 和 retention_analysis", () => {
  const result = parseRetentionContent(
    JSON.stringify({
      recognized: true,
      retention_metrics: {
        avg_play_duration: "23.6秒",
        bounce_rate_2s: "41.2%",
        completion_rate_5s: "32.8%",
        completion_rate: "18.5%",
      },
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
    retention_metrics: {
      avg_play_duration: 23.6,
      bounce_rate_2s: 41.2,
      completion_rate_5s: 32.8,
      completion_rate: 18.5,
    },
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

test("retention 部分识别也返回待确认结果", () => {
  const result = parseOcrResponse(
    JSON.stringify({
      recognized: true,
      retention_metrics: {
        avg_play_duration: null,
        bounce_rate_2s: "41.2%",
        completion_rate_5s: null,
        completion_rate: "18.5%",
      },
      retention_analysis: {
        bounce_peak_time: null,
        replay_peak_time: "12-15秒",
        segment_summary: [{ segment: "10-15秒", performance: "回看明显" }],
      },
      confidence: 0.69,
    }),
    "retention_curve"
  );

  assert.deepEqual(result, {
    slot_status: "pending_confirm",
    screenshot_type: "retention",
    confidence_score: 0.69,
    requires_manual_confirmation: true,
    recognized_fields: {
      recognized: true,
      retention_metrics: {
        avg_play_duration: null,
        bounce_rate_2s: 41.2,
        completion_rate_5s: null,
        completion_rate: 18.5,
      },
      retention_analysis: {
        bounce_peak_time: null,
        replay_peak_time: "12-15秒",
        segment_summary: [{ segment: "10-15秒", performance: "回看明显" }],
      },
      confidence: 0.69,
    },
  });
});

test("识别失败时返回 failed 槽位状态", () => {
  const result = parseOcrResponse(
    JSON.stringify({
      recognized: false,
      reason: "图片不清晰",
    }),
    "retention_curve"
  );

  assert.deepEqual(result, {
    slot_status: "failed",
    screenshot_type: "retention",
    confidence_score: 0,
    requires_manual_confirmation: true,
    error: "图片不清晰",
    recognized_fields: null,
  });
});

test("retention 识别：AI 没返回 segment_summary 也能成功", () => {
  const result = parseRetentionContent(
    JSON.stringify({
      recognized: true,
      retention_metrics: {
        avg_play_duration: "23.6秒",
        bounce_rate_2s: "41.2%",
        completion_rate_5s: null,
        completion_rate: "18.5%",
      },
      confidence: 0.8,
    })
  );

  assert.deepEqual(result, {
    recognized: true,
    retention_metrics: {
      avg_play_duration: 23.6,
      bounce_rate_2s: 41.2,
      completion_rate_5s: null,
      completion_rate: 18.5,
    },
    retention_analysis: {
      bounce_peak_time: null,
      replay_peak_time: null,
      segment_summary: [],
    },
    confidence: 0.8,
  });
});


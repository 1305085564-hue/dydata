import test from "node:test";
import assert from "node:assert/strict";

import {
  getScreenshotTypeByAssetRole,
  getScreenshotTypeFallbackByAssetRole,
  parseOcrResponse,
  parseRetentionContent,
  resolveKnownScreenshotType,
} from "./route";

test("asset_role 只保留旧类型别名映射，不再把截图槽位强制映射为 OCR 类型", () => {
  assert.equal(getScreenshotTypeByAssetRole("overview"), "data");
  assert.equal(getScreenshotTypeByAssetRole("traffic_curve"), null);
  assert.equal(getScreenshotTypeByAssetRole("retention_curve"), "retention");
  assert.equal(getScreenshotTypeByAssetRole("engagement_extra"), "data");
  assert.equal(getScreenshotTypeByAssetRole("other"), "data");
  assert.equal(getScreenshotTypeByAssetRole("screenshot_1"), null);
  assert.equal(getScreenshotTypeByAssetRole("screenshot_2"), null);
  assert.equal(getScreenshotTypeByAssetRole("unknown"), null);
});

test("截图类型由槽位直接决定，不再跑 AI 分类", () => {
  assert.equal(getScreenshotTypeFallbackByAssetRole("screenshot_1"), "data");
  assert.equal(getScreenshotTypeFallbackByAssetRole("screenshot_2"), "retention");
  assert.equal(getScreenshotTypeFallbackByAssetRole("unknown"), "data");
});

test("有截图槽位时按槽位决定识别类型", () => {
  assert.deepEqual(
    resolveKnownScreenshotType({ screenshotType: null, assetRole: "screenshot_1" }),
    { type: "data", source: "asset_role" },
  );
  assert.deepEqual(
    resolveKnownScreenshotType({ screenshotType: null, assetRole: "screenshot_2" }),
    { type: "retention", source: "asset_role" },
  );
  assert.deepEqual(
    resolveKnownScreenshotType({ screenshotType: "data", assetRole: "screenshot_1" }),
    { type: "data", source: "explicit" },
  );
  assert.equal(resolveKnownScreenshotType({ screenshotType: null, assetRole: null }), null);
});

test("曲线形态识别已下线：curve 别名不再产出识别结果", () => {
  assert.equal(
    parseOcrResponse(
      JSON.stringify({
        recognized: true,
        curve_pattern: "二次起量",
        first_peak_position: "前段",
        drop_severity: "medium",
        tail_strength: "high",
        confidence: 0.86,
      }),
      "traffic_curve"
    ),
    null
  );
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

test("data OCR 忽略 AI 返回的 curve_info / retention_info", () => {
  const result = parseOcrResponse(
    JSON.stringify({
      play_count: 1000,
      likes: 10,
      comments: null,
      shares: null,
      favorites: null,
      follower_gain: null,
      confidence: {
        play_count: "high",
        likes: "high",
        comments: "low",
        shares: "low",
        favorites: "low",
        follower_gain: "low",
      },
      curve_info: { curve_pattern: "二次起量" },
      retention_info: { bounce_peak_time: "0-3秒" },
    }),
    "overview"
  );

  assert.ok(result);
  assert.deepEqual(result.recognized_fields, {
    play_count: 1000,
    likes: 10,
  });
});

test("跳出回看图只返回 retention_metrics 四个数字指标", () => {
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
        segment_summary: [{ segment: "0-5秒", performance: "跳出高" }],
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
    error_code: "LOW_CONFIDENCE",
    error: "图片不清晰",
    recognized_fields: null,
  });
});

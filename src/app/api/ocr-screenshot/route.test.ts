import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecognitionContentFromOcrText,
  getPaddleOcrEndpoint,
  getScreenshotTypeByAssetRole,
  getImageRecognitionMode,
  parsePaddleOcrText,
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

test("识别模式默认使用 hybrid，让 OCR 主跑并保留大模型兜底", () => {
  assert.equal(getImageRecognitionMode(undefined), "hybrid");
  assert.equal(getImageRecognitionMode("ocr"), "ocr");
  assert.equal(getImageRecognitionMode("hybrid"), "hybrid");
  assert.equal(getImageRecognitionMode("bad-value"), "hybrid");
});

test("PaddleOCR 服务地址优先读环境变量，未配置时使用当前云端服务", () => {
  assert.equal(getPaddleOcrEndpoint(undefined), "http://118.89.72.250:18790/ocr");
  assert.equal(getPaddleOcrEndpoint(" http://ocr.example.com/ocr "), "http://ocr.example.com/ocr");
});

test("PaddleOCR 响应会提取原始文字", () => {
  const text = parsePaddleOcrText({
    success: true,
    text: "播放量 3.21万\n点赞 1280",
    lines: [{ text: "播放量 3.21万", confidence: 0.994 }],
    elapsed_ms: 1595.9,
  });

  assert.equal(text, "播放量 3.21万\n点赞 1280");
});

test("OCR 纯文字可转换为现有 overview JSON 结构", () => {
  const content = buildRecognitionContentFromOcrText(
    [
      "播放量 3.21万",
      "点赞 1280",
      "评论 68",
      "分享 15",
      "收藏 106",
      "涨粉 42",
    ].join("\n"),
    "data"
  );

  assert.deepEqual(JSON.parse(content), {
    play_count: 32100,
    likes: 1280,
    comments: 68,
    shares: 15,
    favorites: 106,
    follower_gain: 42,
    confidence: {
      play_count: "high",
      likes: "high",
      comments: "high",
      shares: "high",
      favorites: "high",
      follower_gain: "high",
    },
  });
});

test("OCR 纯文字可转换为 retention JSON 结构", () => {
  const content = buildRecognitionContentFromOcrText(
    [
      "平均播放时长 23.6秒",
      "2秒跳出率 41.2%",
      "5秒完播率 32.8%",
      "完播率 18.5%",
    ].join("\n"),
    "retention"
  );

  assert.deepEqual(JSON.parse(content), {
    recognized: true,
    retention_metrics: {
      avg_play_duration: 23.6,
      bounce_rate_2s: 41.2,
      completion_rate_5s: 32.8,
      completion_rate: 18.5,
    },
    retention_analysis: {
      bounce_peak_time: null,
      replay_peak_time: null,
      segment_summary: [],
    },
    confidence: 1,
  });
});

test("hybrid 上传链路不在推流曲线截图上做形态识别", () => {
  const content = buildRecognitionContentFromOcrText("", "curve");

  assert.deepEqual(JSON.parse(content), {
    recognized: false,
    reason: "OCR 只能提取文字，无法稳定判断推流曲线形态",
  });
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

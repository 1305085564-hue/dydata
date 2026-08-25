import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStructurePromptByType,
  mapBaiduErrorToOcrCode,
  runBaiduOcrAttempt,
  STRUCTURE_FEATURE_KEY,
} from "./baidu-channel";
import { BaiduOcrError } from "@/lib/baidu-ocr";

const DATA_URL = `data:image/png;base64,${Buffer.from("fake-image").toString("base64")}`;

function makeTimings() {
  return {} as Record<string, number | undefined>;
}

test("结构化调用绑定独立功能键，与看图回退（ocr_screenshot）互不干扰", () => {
  assert.equal(STRUCTURE_FEATURE_KEY, "ocr_screenshot_structure");
});

test("百度错误分类映射到现有 OcrErrorCode 枚举，非 BaiduOcrError 返回 null", () => {
  assert.equal(mapBaiduErrorToOcrCode(new BaiduOcrError("qps", "QPS_LIMITED")), "RATE_LIMITED");
  assert.equal(mapBaiduErrorToOcrCode(new BaiduOcrError("timeout", "TIMEOUT")), "AI_TIMEOUT");
  assert.equal(
    mapBaiduErrorToOcrCode(new BaiduOcrError("image", "IMAGE_REJECTED")),
    "LOW_CONFIDENCE",
  );
  assert.equal(
    mapBaiduErrorToOcrCode(new BaiduOcrError("token", "TOKEN_INVALID", 110)),
    "AI_CHANNEL_UNAVAILABLE",
  );
  assert.equal(
    mapBaiduErrorToOcrCode(new BaiduOcrError("quota", "QUOTA_EXCEEDED", 17)),
    "AI_CHANNEL_UNAVAILABLE",
  );
  assert.equal(
    mapBaiduErrorToOcrCode(new BaiduOcrError("config", "CONFIG")),
    "AI_CHANNEL_UNAVAILABLE",
  );
  assert.equal(
    mapBaiduErrorToOcrCode(new BaiduOcrError("service", "SERVICE_ERROR", 282000)),
    "AI_CHANNEL_UNAVAILABLE",
  );
  assert.equal(mapBaiduErrorToOcrCode(new Error("普通错误")), null);
});

test("结构化 prompt 按槽位区分：data 要 6 指标，retention 要留存 4 数字，且带 OCR 文字行", () => {
  const lines = ["播放量 3.21万", "点赞 1280"];

  const dataPrompt = buildStructurePromptByType("data", lines);
  assert.match(dataPrompt, /1\. 播放量 3\.21万/);
  assert.match(dataPrompt, /2\. 点赞 1280/);
  assert.match(dataPrompt, /play_count/);
  assert.match(dataPrompt, /follower_gain/);

  const retentionPrompt = buildStructurePromptByType("retention", lines);
  assert.match(retentionPrompt, /avg_play_duration/);
  assert.match(retentionPrompt, /completion_rate/);
});

test("百度提字 + 文字模型结构化：输出契约与视觉通道等价（data 槽位）", async () => {
  const timings = makeTimings();
  const result = await runBaiduOcrAttempt(
    { dataUrl: DATA_URL, screenshotType: "data", timings },
    {
      recognize: async () => ["播放量 32100", "点赞 1280"],
      callStructureModel: async () => ({
        content: JSON.stringify({
          play_count: 32100,
          likes: 1280,
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
        }),
        model: "structure-model-x",
      }),
    },
  );

  assert.ok(result.parsed);
  assert.equal(result.channelName, "baidu");
  assert.equal(result.model, "structure-model-x");
  assert.deepEqual(result.parsed.recognized_fields, { play_count: 32100, likes: 1280 });
  assert.equal(result.parsed.slot_status, "pending_confirm");
  assert.equal(result.parsed.confidence_score, 0.33);
  assert.ok(typeof timings.baidu_ms === "number");
  assert.ok(typeof timings.structure_ms === "number");
});

test("retention 槽位返回嵌套数值契约，与旧通道一致", async () => {
  const result = await runBaiduOcrAttempt(
    { dataUrl: DATA_URL, screenshotType: "retention", timings: makeTimings() },
    {
      recognize: async () => ["平均播放时长 23.6秒", "2秒跳出 41.2%"],
      callStructureModel: async () => ({
        content: JSON.stringify({
          recognized: true,
          retention_metrics: {
            avg_play_duration: 23.6,
            bounce_rate_2s: 41.2,
            completion_rate_5s: null,
            completion_rate: 18.5,
          },
          confidence: 0.69,
        }),
      }),
    },
  );

  assert.ok(result.parsed);
  assert.equal(result.parsed.screenshot_type, "retention");
  assert.equal(result.parsed.slot_status, "pending_confirm");
  assert.deepEqual(result.parsed.recognized_fields, {
    recognized: true,
    retention_metrics: {
      avg_play_duration: 23.6,
      bounce_rate_2s: 41.2,
      completion_rate_5s: null,
      completion_rate: 18.5,
    },
    confidence: 0.69,
  });
});

test("OCR 文字行为空时直接降级 failed 契约，不调用文字模型", async (t) => {
  const structureMock = t.mock.fn(async () => ({ content: "{}" }));
  const result = await runBaiduOcrAttempt(
    { dataUrl: DATA_URL, screenshotType: "data", timings: makeTimings() },
    {
      recognize: async () => [],
      callStructureModel: structureMock,
    },
  );

  assert.ok(result.parsed);
  assert.equal(result.parsed.slot_status, "failed");
  assert.equal(result.parsed.error_code, "LOW_CONFIDENCE");
  assert.equal(structureMock.mock.callCount(), 0);
});

test("文字模型返回无法解析的内容时 parsed 为 null（上层按 AI_PARSE_FAILED 处理）", async () => {
  const result = await runBaiduOcrAttempt(
    { dataUrl: DATA_URL, screenshotType: "data", timings: makeTimings() },
    {
      recognize: async () => ["播放量 100"],
      callStructureModel: async () => ({ content: "不是 JSON" }),
    },
  );

  assert.equal(result.parsed, null);
});

test("百度客户端抛出的错误原样向上传播，供接口层映射 error_code", async () => {
  await assert.rejects(
    () =>
      runBaiduOcrAttempt(
        { dataUrl: DATA_URL, screenshotType: "data", timings: makeTimings() },
        {
          recognize: async () => {
            throw new BaiduOcrError("图片超限", "IMAGE_REJECTED", 282100);
          },
        },
      ),
    (error: unknown) =>
      error instanceof BaiduOcrError &&
      error.errorType === "IMAGE_REJECTED" &&
      mapBaiduErrorToOcrCode(error) === "LOW_CONFIDENCE",
  );
});

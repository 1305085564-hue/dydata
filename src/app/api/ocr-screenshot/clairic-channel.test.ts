import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { CLAIRIC_MODEL_ID, ClairicOcrError } from "@/lib/clairic-ocr";
import {
  CLAIRIC_FIELDS_V2,
  convertClairicAnswersToResponse,
  parseClairicPublishedAt,
  runClairicAttemptWithBaiduFallback,
  runClairicOcrAttempt,
} from "./clairic-channel";
import { buildOcrScreenshotResponse } from "./route";
import type { OcrLogParams } from "./ocr-log";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("CLAIRIC_FIELDS_V2 不含单列 pub_hour / pub_minute，只留 published_at_text", () => {
  for (const type of ["data", "retention"] as const) {
    assert.equal("pub_hour" in CLAIRIC_FIELDS_V2[type], false);
    assert.equal("pub_minute" in CLAIRIC_FIELDS_V2[type], false);
    assert.ok("published_at_text" in CLAIRIC_FIELDS_V2[type]);
  }
});

test("parseClairicPublishedAt 准确解析常见中文/横杠/斜杠时间并按 +08:00 转 UTC", () => {
  const cn = parseClairicPublishedAt("2026年11月19日 18:41");
  assert.equal(cn.published_at, "2026-11-19T10:41:00.000Z");
  assert.equal(cn.published_at_text, "2026年11月19日 18:41");

  const dashWithLabel = parseClairicPublishedAt("  2026-11-19 18:57 发布 ");
  assert.equal(dashWithLabel.published_at, "2026-11-19T10:57:00.000Z");
  assert.equal(dashWithLabel.published_at_text, "2026-11-19 18:57 发布");

  const slash = parseClairicPublishedAt("2026/11/19 09:05");
  assert.equal(slash.published_at, "2026-11-19T01:05:00.000Z");

  const withSeconds = parseClairicPublishedAt("2026-11-19 18:57:30");
  assert.equal(withSeconds.published_at, "2026-11-19T10:57:30.000Z");

  const overflowDay = parseClairicPublishedAt("2026-02-30 12:00");
  assert.equal(overflowDay.published_at, null);
  assert.equal(overflowDay.published_at_text, "2026-02-30 12:00");

  assert.deepEqual(parseClairicPublishedAt(null), { published_at: null, published_at_text: null });
});

test("data 页高置信度正常转换（含万单位、标题、+08:00 发布时间）", () => {
  const res = convertClairicAnswersToResponse(
    {
      play_count: { value: "9.28万", confidence: 0.96, p_null: 0.01 },
      likes: { value: 1280, confidence: 0.94, p_null: 0.01 },
      comments: { value: 68, confidence: 0.91, p_null: 0.01 },
      shares: { value: 15, confidence: 0.85, p_null: 0.05 },
      favorites: { value: 106, confidence: 0.92, p_null: 0.02 },
      follower_gain: { value: 42, confidence: 0.90, p_null: 0.02 },
      video_title: { value: "测试作品标题", confidence: 0.95, p_null: 0.01 },
      published_at_text: { value: "2026年11月19日 18:41", confidence: 0.93, p_null: 0.02 },
    },
    "data",
  );

  assert.equal(res.slot_status, "confirmed");
  assert.equal(res.requires_manual_confirmation, false);
  assert.equal(res.screenshot_type, "data");
  assert.deepEqual(res.recognized_fields, {
    play_count: 92800,
    likes: 1280,
    comments: 68,
    shares: 15,
    favorites: 106,
    follower_gain: 42,
    video_title: "测试作品标题",
    published_at: "2026-11-19T10:41:00.000Z",
    published_at_text: "2026年11月19日 18:41",
    published_at_confidence: "high",
  });
  assert.deepEqual(res.confidence, {
    play_count: "high",
    likes: "high",
    comments: "high",
    shares: "medium",
    favorites: "high",
    follower_gain: "high",
  });
});

test("单项低置信度红线：即使 5 项高分使平均分 ≥ 0.7，1 项 < 0.80 或 p_null > 0.20 必须强制 pending_confirm", () => {
  // 情形 1：1 项 confidence = 0.752（< 0.80）
  const lowConf = convertClairicAnswersToResponse(
    {
      play_count: { value: 10000, confidence: 0.99, p_null: 0.01 },
      likes: { value: 500, confidence: 0.99, p_null: 0.01 },
      comments: { value: 30, confidence: 0.99, p_null: 0.01 },
      shares: { value: 10, confidence: 0.99, p_null: 0.01 },
      favorites: { value: 40, confidence: 0.99, p_null: 0.01 },
      follower_gain: { value: 12, confidence: 0.752, p_null: 0.05 },
    },
    "data",
  );
  assert.equal(lowConf.slot_status, "pending_confirm");
  assert.equal(lowConf.requires_manual_confirmation, true);
  assert.equal(lowConf.confidence?.follower_gain, "low");

  // 情形 2：p_null > 0.20 即使 confidence >= 0.80 也触发人工确认
  const highPNull = convertClairicAnswersToResponse(
    {
      play_count: { value: 10000, confidence: 0.99, p_null: 0.01 },
      likes: { value: 500, confidence: 0.85, p_null: 0.25 },
      comments: { value: 30, confidence: 0.99, p_null: 0.01 },
      shares: { value: 10, confidence: 0.99, p_null: 0.01 },
      favorites: { value: 40, confidence: 0.99, p_null: 0.01 },
      follower_gain: { value: 12, confidence: 0.99, p_null: 0.01 },
    },
    "data",
  );
  assert.equal(highPNull.slot_status, "pending_confirm");
  assert.equal(highPNull.requires_manual_confirmation, true);

  // 情形 3：发布时间有返回但无法解析或低置信度，也强制 pending_confirm
  const badPub = convertClairicAnswersToResponse(
    {
      play_count: { value: 10000, confidence: 0.99, p_null: 0.01 },
      likes: { value: 500, confidence: 0.99, p_null: 0.01 },
      comments: { value: 30, confidence: 0.99, p_null: 0.01 },
      shares: { value: 10, confidence: 0.99, p_null: 0.01 },
      favorites: { value: 40, confidence: 0.99, p_null: 0.01 },
      follower_gain: { value: 12, confidence: 0.99, p_null: 0.01 },
      published_at_text: { value: "2026-11-19 18:41", confidence: 0.72, p_null: 0.05 },
    },
    "data",
  );
  assert.equal(badPub.slot_status, "pending_confirm");
  assert.equal(badPub.requires_manual_confirmation, true);
});

test("空值字段单独处理：p_null >= 0.80 不误拦；p_null < 0.80 模棱两可的空值强制转人工", () => {
  // 高确定度为空（图面确实没入画涨粉量），其余全高置信度 -> confirmed
  const certainNull = convertClairicAnswersToResponse(
    {
      play_count: { value: 32100, confidence: 0.97, p_null: 0.01 },
      likes: { value: 1280, confidence: 0.96, p_null: 0.01 },
      comments: { value: 68, confidence: 0.95, p_null: 0.01 },
      shares: { value: 15, confidence: 0.94, p_null: 0.01 },
      favorites: { value: 106, confidence: 0.95, p_null: 0.01 },
      follower_gain: { value: null, confidence: 0.98, p_null: 0.99 },
    },
    "data",
  );
  assert.equal(certainNull.slot_status, "confirmed");
  assert.equal(certainNull.requires_manual_confirmation, false);
  assert.equal(certainNull.recognized_fields?.follower_gain, undefined);

  // 模棱两可的空（p_null = 0.45 < 0.80）-> pending_confirm
  const ambiguousNull = convertClairicAnswersToResponse(
    {
      play_count: { value: 32100, confidence: 0.97, p_null: 0.01 },
      likes: { value: 1280, confidence: 0.96, p_null: 0.01 },
      comments: { value: 68, confidence: 0.95, p_null: 0.01 },
      shares: { value: 15, confidence: 0.94, p_null: 0.01 },
      favorites: { value: 106, confidence: 0.95, p_null: 0.01 },
      follower_gain: { value: null, confidence: 0.50, p_null: 0.45 },
    },
    "data",
  );
  assert.equal(ambiguousNull.slot_status, "pending_confirm");
  assert.equal(ambiguousNull.requires_manual_confirmation, true);
});

test("retention 页转换与单项低置信度强制转人工", () => {
  const ok = convertClairicAnswersToResponse(
    {
      video_title: { value: "留存标题", confidence: 0.92, p_null: 0.01 },
      avg_play_duration: { value: 23.6, confidence: 0.95, p_null: 0.01 },
      avg_play_ratio: { value: 65.4, confidence: 0.91, p_null: 0.01 },
      bounce_rate_2s: { value: 41.2, confidence: 0.94, p_null: 0.01 },
      completion_rate_5s: { value: 52.1, confidence: 0.88, p_null: 0.05 },
      completion_rate: { value: 18.5, confidence: 0.93, p_null: 0.01 },
      published_at_text: { value: "2026-11-19 18:57 发布", confidence: 0.94, p_null: 0.01 },
    },
    "retention",
  );
  assert.equal(ok.slot_status, "confirmed");
  assert.equal(ok.requires_manual_confirmation, false);
  assert.deepEqual(ok.recognized_fields?.retention_metrics, {
    avg_play_duration: 23.6,
    avg_play_ratio: 65.4,
    bounce_rate_2s: 41.2,
    completion_rate_5s: 52.1,
    completion_rate: 18.5,
  });

  // 1 项低置信度即使均值 > 0.7 也必须 pending_confirm
  const oneLow = convertClairicAnswersToResponse(
    {
      avg_play_duration: { value: 23.6, confidence: 0.99, p_null: 0.01 },
      avg_play_ratio: { value: 65.4, confidence: 0.99, p_null: 0.01 },
      bounce_rate_2s: { value: 41.2, confidence: 0.99, p_null: 0.01 },
      completion_rate_5s: { value: 52.1, confidence: 0.99, p_null: 0.01 },
      completion_rate: { value: 18.5, confidence: 0.74, p_null: 0.05 },
    },
    "retention",
  );
  assert.equal(oneLow.slot_status, "pending_confirm");
  assert.equal(oneLow.requires_manual_confirmation, true);
});

test("全空无有效数据时返回 failed/LOW_CONFIDENCE，且不触发百度回退", async () => {
  let baiduCalled = false;
  const result = await runClairicAttemptWithBaiduFallback(
    { dataUrl: PNG_DATA_URL, screenshotType: "data", timings: {} },
    {
      runClairicAttempt: async (input) =>
        runClairicOcrAttempt(input, {
          callClairic: async () => ({
            answers: {
              play_count: { value: null, confidence: 0.99, p_null: 1 },
              likes: { value: null, confidence: 0.99, p_null: 1 },
              comments: { value: null, confidence: 0.99, p_null: 1 },
              shares: { value: null, confidence: 0.99, p_null: 1 },
              favorites: { value: null, confidence: 0.99, p_null: 1 },
              follower_gain: { value: null, confidence: 0.99, p_null: 1 },
              video_title: { value: null, confidence: 0.99, p_null: 1 },
            },
            usage: { passes: 7, input_tokens: 9000 },
            latencyMs: 800,
          }),
        }),
      runBaiduAttempt: async () => {
        baiduCalled = true;
        throw new Error("不应回退百度");
      },
    },
  );
  assert.equal(baiduCalled, false);
  assert.equal(result.fallback, null);
  assert.equal(result.channelName, "clairic");
  assert.equal(result.parsed?.slot_status, "failed");
  assert.equal(result.parsed?.error_code, "LOW_CONFIDENCE");

  const retentionEmpty = convertClairicAnswersToResponse(
    {
      video_title: { value: "有标题但无指标", confidence: 0.9, p_null: 0.01 },
      avg_play_duration: { value: null, confidence: 0.99, p_null: 1 },
      avg_play_ratio: { value: null, confidence: 0.99, p_null: 1 },
      bounce_rate_2s: { value: null, confidence: 0.99, p_null: 1 },
      completion_rate_5s: { value: null, confidence: 0.99, p_null: 1 },
      completion_rate: { value: null, confidence: 0.99, p_null: 1 },
    },
    "retention",
  );
  assert.equal(retentionEmpty.slot_status, "failed");
  assert.equal(retentionEmpty.error_code, "LOW_CONFIDENCE");
});

test("route.ts 主路由接入 clairic：正常命中记 clairic + @cf/cloudflare/clairic，故障无缝回退百度记 clairic->baidu", async () => {
  const makeReq = () =>
    new NextRequest("https://dydata.cc/api/ocr-screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: PNG_DATA_URL, screenshot_type: "data" }),
    });

  // 1) Clairic 正常命中
  const successLogs: OcrLogParams[] = [];
  const successDetails: Record<string, unknown>[] = [];
  const okRes = await buildOcrScreenshotResponse(
    makeReq(),
    {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) as never,
      ocrChannelFetcher: async () => ({ channel_settings: { ocr_screenshot_channel: "clairic" } }) as never,
      callAi: async () => { throw new Error("不应走 vision"); },
      recordLog: async (p) => { successLogs.push(p); },
      runClairicAttempt: async ({ timings }) => {
        timings.clairic_ms = 910;
        return {
          parsed: convertClairicAnswersToResponse(
            {
              play_count: { value: 5000, confidence: 0.95, p_null: 0.01 },
              likes: { value: 120, confidence: 0.95, p_null: 0.01 },
              comments: { value: 10, confidence: 0.95, p_null: 0.01 },
              shares: { value: 5, confidence: 0.95, p_null: 0.01 },
              favorites: { value: 8, confidence: 0.95, p_null: 0.01 },
              follower_gain: { value: 2, confidence: 0.95, p_null: 0.01 },
            },
            "data",
          ),
          channelName: "clairic",
          model: CLAIRIC_MODEL_ID,
          usage: { passes: 8, input_tokens: 11200 },
        };
      },
    },
    { requestId: "11111111-1111-4111-8111-111111111111", mark: () => {}, setDetail: (d) => successDetails.push(d) },
  );

  assert.equal(okRes.status, 200);
  const okBody = (await okRes.json()) as { timings: Record<string, number>; data: { slot_status: string } };
  assert.equal(okBody.data.slot_status, "confirmed");
  assert.equal(okBody.timings.clairic_ms, 910);
  assert.equal(successLogs[0]?.channelName, "clairic");
  assert.equal(successLogs[0]?.modelId, CLAIRIC_MODEL_ID);
  assert.equal(successLogs[0]?.ocrMs, 910);
  assert.deepEqual(successDetails[0]?.clairic_usage, { passes: 8, input_tokens: 11200 });

  // 2) Clairic 故障自动回退百度
  const fallbackLogs: OcrLogParams[] = [];
  const fallbackDetails: Record<string, unknown>[] = [];
  const fbRes = await buildOcrScreenshotResponse(
    makeReq(),
    {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) as never,
      ocrChannelFetcher: async () => ({ channel_settings: { ocr_screenshot_channel: "clairic" } }) as never,
      callAi: async () => { throw new Error("不应走 vision"); },
      recordLog: async (p) => { fallbackLogs.push(p); },
      runClairicAttempt: async ({ timings }) => {
        timings.clairic_ms = 5001;
        throw new ClairicOcrError("Cloudflare Clairic 请求超时（5000ms）", "TIMEOUT");
      },
      runBaiduAttempt: async ({ timings }) => {
        timings.baidu_ms = 320;
        timings.structure_ms = 410;
        return {
          parsed: {
            slot_status: "confirmed",
            screenshot_type: "data",
            confidence_score: 1,
            requires_manual_confirmation: false,
            recognized_fields: { play_count: 5000, likes: 120 },
          },
          channelName: "baidu (deepseek-v3)",
          model: "deepseek-v3",
        };
      },
    },
    { requestId: "11111111-1111-4111-8111-111111111111", mark: () => {}, setDetail: (d) => fallbackDetails.push(d) },
  );

  assert.equal(fbRes.status, 200);
  const fbBody = (await fbRes.json()) as { timings: Record<string, number>; data: { slot_status: string } };
  assert.equal(fbBody.data.slot_status, "confirmed");
  assert.equal(fbBody.timings.clairic_ms, 5001);
  assert.equal(fbBody.timings.baidu_ms, 320);
  assert.equal(fbBody.timings.structure_ms, 410);
  assert.equal(fallbackLogs[0]?.channelName, "clairic->baidu (deepseek-v3)");
  assert.equal(fallbackLogs[0]?.modelId, "deepseek-v3");
  assert.deepEqual(fallbackDetails[0]?.channel_fallback, {
    from: "clairic",
    to: "baidu",
    reason: "Cloudflare Clairic 请求超时（5000ms）",
  });
});

test("旧 baidu 通道路径行为保持不变", async () => {
  const logs: OcrLogParams[] = [];
  const res = await buildOcrScreenshotResponse(
    new NextRequest("https://dydata.cc/api/ocr-screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: PNG_DATA_URL, screenshot_type: "data" }),
    }),
    {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) as never,
      ocrChannelFetcher: async () => ({ channel_settings: { ocr_screenshot_channel: "baidu" } }) as never,
      callAi: async () => { throw new Error("不应走 vision"); },
      recordLog: async (p) => { logs.push(p); },
      runBaiduAttempt: async ({ timings }) => {
        timings.baidu_ms = 210;
        timings.structure_ms = 390;
        return {
          parsed: {
            slot_status: "confirmed",
            screenshot_type: "data",
            confidence_score: 1,
            requires_manual_confirmation: false,
            recognized_fields: { play_count: 100 },
          },
          channelName: "baidu (qwen)",
          model: "qwen",
        };
      },
    },
    { requestId: "11111111-1111-4111-8111-111111111111", mark: () => {}, setDetail: () => {} },
  );
  assert.equal(res.status, 200);
  assert.equal(logs[0]?.channelName, "baidu (qwen)");
  assert.equal(logs[0]?.modelId, "qwen");
});

import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { CLAIRIC_MODEL_ID } from "@/lib/clairic-ocr";
import {
  CLAIRIC_FIELDS_V2,
  convertClairicAnswersToResponse,
  parseClairicPublishedAt,
  runClairicOcrAttempt,
} from "./clairic-channel";
import { OcrRunnerError } from "./ocr-runner";
import { buildOcrScreenshotResponse } from "./route";
import type { OcrLogParams } from "./ocr-log";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("CLAIRIC_FIELDS_V2 不含单列 pub_hour / pub_minute，且 follower_gain 明确禁止借用收藏量/弹幕量", () => {
  for (const type of ["data", "retention"] as const) {
    assert.equal("pub_hour" in CLAIRIC_FIELDS_V2[type], false);
    assert.equal("pub_minute" in CLAIRIC_FIELDS_V2[type], false);
    assert.ok("published_at_text" in CLAIRIC_FIELDS_V2[type]);
  }
  const fgInstr = CLAIRIC_FIELDS_V2.data.follower_gain.instructions;
  assert.match(fgInstr, /返回 null/);
  assert.match(fgInstr, /收藏量/);
  assert.match(fgInstr, /弹幕量/);
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

test("空值字段单独处理：单缺且高 p_null 不误拦；模棱两可空值或错槽稀疏（命中 < 3 项）强制转人工", () => {
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

  const wrongSlotSparse = convertClairicAnswersToResponse(
    {
      play_count: { value: 15000, confidence: 0.99, p_null: 0.01 },
      likes: { value: null, confidence: 0.99, p_null: 1.0 },
      comments: { value: null, confidence: 0.99, p_null: 1.0 },
      shares: { value: null, confidence: 0.99, p_null: 1.0 },
      favorites: { value: null, confidence: 0.99, p_null: 1.0 },
      follower_gain: { value: null, confidence: 0.99, p_null: 1.0 },
    },
    "data",
  );
  assert.equal(wrongSlotSparse.slot_status, "pending_confirm");
  assert.equal(wrongSlotSparse.requires_manual_confirmation, true);
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

test("runClairicOcrAttempt 将显式凭据透传给 callClairicOcr 并在全空时返回 failed/LOW_CONFIDENCE", async () => {
  let seenBaseUrl = "";
  let seenApiKey = "";
  const attempt = await runClairicOcrAttempt(
    {
      dataUrl: PNG_DATA_URL,
      screenshotType: "data",
      credentials: { baseUrl: "https://gw.test/cf", apiKey: "tok-explicit", modelId: CLAIRIC_MODEL_ID },
      channelName: "CF-Main",
      timings: {},
    },
    {
      callClairic: async (_input, creds) => {
        seenBaseUrl = creds.baseUrl;
        seenApiKey = creds.apiKey;
        return {
          answers: {
            play_count: { value: null, confidence: 0.99, p_null: 1 },
            likes: { value: null, confidence: 0.99, p_null: 1 },
          },
          usage: { passes: 3, input_tokens: 500 },
          latencyMs: 320,
        };
      },
    },
  );
  assert.equal(seenBaseUrl, "https://gw.test/cf");
  assert.equal(seenApiKey, "tok-explicit");
  assert.equal(attempt.channelName, "CF-Main");
  assert.equal(attempt.parsed.slot_status, "failed");
  assert.equal(attempt.parsed.error_code, "LOW_CONFIDENCE");
});

test("route.ts 主路由记录 Clairic 识别成功与多段回退拆解（含全部失败时也落账）", async () => {
  const makeReq = () =>
    new NextRequest("https://dydata.cc/api/ocr-screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: PNG_DATA_URL, screenshot_type: "data" }),
    });

  // 1) Clairic 回退后成功
  const fallbackLogs: OcrLogParams[] = [];
  const fbRes = await buildOcrScreenshotResponse(
    makeReq(),
    {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) as never,
      recordLog: async (p) => { fallbackLogs.push(p); },
      runOcr: async ({ timings }) => {
        timings.clairic_ms = 1140;
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
          channelName: "CF账号2",
          model: CLAIRIC_MODEL_ID,
          protocol: "cloudflare_clairic",
          usage: { passes: 8, input_tokens: 11200 },
          ocrMs: 2620,
          fallbackDetail: {
            attempts: [
              { channel_name: "CF账号1", model_id: CLAIRIC_MODEL_ID, protocol: "cloudflare_clairic", ok: false, elapsed_ms: 1140, error_code: "RATE_LIMITED", reason: "限流429" },
              { channel_name: "CF账号2", model_id: CLAIRIC_MODEL_ID, protocol: "cloudflare_clairic", ok: true, elapsed_ms: 1480 },
            ],
          },
        };
      },
    },
    { requestId: "11111111-1111-4111-8111-111111111111", mark: () => {}, setDetail: () => {} },
  );
  assert.equal(fbRes.status, 200);
  assert.equal(fallbackLogs[0]?.channelName, "CF账号2");
  assert.equal(fallbackLogs[0]?.ocrMs, 2620);
  assert.equal(fallbackLogs[0]?.fallbackDetail?.attempts.length, 2);

  // 2) 所有渠道均失败时，同样落最后尝试渠道与 fallback_detail
  const errLogs: OcrLogParams[] = [];
  const errRes = await buildOcrScreenshotResponse(
    makeReq(),
    {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) as never,
      recordLog: async (p) => { errLogs.push(p); },
      runOcr: async () => {
        throw new OcrRunnerError("全部超时", {
          errorCode: "AI_TIMEOUT",
          ocrMs: 6200,
          attempts: [
            { channel_name: "CF账号1", model_id: CLAIRIC_MODEL_ID, protocol: "cloudflare_clairic", ok: false, elapsed_ms: 5000, error_code: "AI_TIMEOUT", reason: "请求超时" },
            { channel_name: "默认视觉", model_id: "claude-haiku-5-5", protocol: "openai_compatible", ok: false, elapsed_ms: 1200, error_code: "AI_TIMEOUT", reason: "请求超时" },
          ],
          lastChannelName: "默认视觉",
          lastModel: "claude-haiku-5-5",
        });
      },
    },
    { requestId: "11111111-1111-4111-8111-111111111111", mark: () => {}, setDetail: () => {} },
  );
  assert.equal(errRes.status, 500);
  assert.equal(errLogs[0]?.isSuccess, false);
  assert.equal(errLogs[0]?.errorCode, "AI_TIMEOUT");
  assert.equal(errLogs[0]?.channelName, "默认视觉");
  assert.equal(errLogs[0]?.modelId, "claude-haiku-5-5");
  assert.equal(errLogs[0]?.fallbackDetail?.attempts.length, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { AiChannelError } from "@/lib/ai/client";
import type { ChannelConfig } from "@/lib/ai/client-routing";
import { buildOcrScreenshotResponse } from "./route";
import type { OcrFallbackAttempt, OcrLogParams } from "./ocr-log";
import { runScreenshotOcr } from "./ocr-runner";

// 同一编号串到底：接口返回给前端的编号 = ocr_recognition_logs.request_id
// = ai_call_attempts.request_id。三处任一处自己再生成一个，这里就红。

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const OCR_JSON = JSON.stringify({
  play_count: 32100, likes: 1280, comments: 68, shares: 15, favorites: 106, follower_gain: 42,
  confidence: { play_count: "high", likes: "high", comments: "high", shares: "high", favorites: "high", follower_gain: "high" },
});

type RouteDeps = Parameters<typeof buildOcrScreenshotResponse>[1];

const VISION_CHANNEL: ChannelConfig = {
  id: "v1",
  name: "api9 claude (max)",
  providerKeyLabel: "api9 claude (max)",
  baseUrl: "https://vision.example.test/v1",
  apiKey: "tok",
  protocol: "openai_compatible",
  model: "claude-haiku-5-5",
  canonicalModelId: "claude-haiku-5-5",
  source: "provider_key_model",
};

function makeRequest() {
  return new NextRequest("https://dydata.cc/api/ocr-screenshot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dydata-request-id": REQUEST_ID },
    body: JSON.stringify({ image: PNG, screenshot_type: "data" }),
  });
}

const observation = { requestId: REQUEST_ID, mark: () => {}, setDetail: () => {} } as const;

function makeDeps(input: {
  sentRequestIds: string[];
  logged: OcrLogParams[];
  sendToChannel: () => Promise<{ content: string; model: string; channelName: string; elapsedMs: number }>;
}): RouteDeps {
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) } }) as never,
    runOcr: async (runnerInput) => {
      input.sentRequestIds.push(runnerInput.requestId);
      return runScreenshotOcr(runnerInput, {
        getServiceClient: () => null,
        getFeatureConfig: async () => ({
          featureKey: "ocr_screenshot",
          providerKeyModelId: null,
          modelId: "claude-haiku-5-5",
          systemPrompt: null,
          isEnabled: true,
          lifecycleState: "active",
        }),
        resolveFeatureChannelChain: async () => [VISION_CHANNEL],
        recordAiCallAttempt: async (attempt) => { input.sentRequestIds.push(attempt.requestId); },
        normalizeVisionDataUrl: async (u) => u,
        sendToChannel: input.sendToChannel,
      });
    },
    recordLog: async (params) => { input.logged.push(params); },
  } as RouteDeps;
}

test("识别成功：接口编号原样传给识别记录和 AI 调用记录，三处同一个值", async () => {
  const sentRequestIds: string[] = [];
  const logged: OcrLogParams[] = [];
  const deps = makeDeps({
    sentRequestIds,
    logged,
    sendToChannel: async () => ({ content: OCR_JSON, model: "claude-haiku-5-5", channelName: "api9 claude (max)", elapsedMs: 1500 }),
  });

  const response = await buildOcrScreenshotResponse(makeRequest(), deps, observation);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.request_id, REQUEST_ID);

  const [runnerInputId, aiAttemptId] = sentRequestIds;
  assert.equal(runnerInputId, REQUEST_ID, "识别入口收到的编号必须是指口生成的编号，不能自己再生成");
  assert.equal(aiAttemptId, REQUEST_ID, "ai_call_attempts 写入的编号必须与接口编号一致");
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.requestId, REQUEST_ID, "ocr_recognition_logs 写入的编号必须与接口编号一致");
  assert.equal(logged[0]?.isSuccess, true);
});

test("识别失败：两张表仍然写同一个编号，能按接口返回的编号查到这一次", async () => {
  const sentRequestIds: string[] = [];
  const logged: OcrLogParams[] = [];
  const deps = makeDeps({
    sentRequestIds,
    logged,
    sendToChannel: async () => {
      throw new AiChannelError("上游 503", "http_503", true);
    },
  });

  const response = await buildOcrScreenshotResponse(makeRequest(), deps, observation);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 500);
  assert.equal(body.request_id, REQUEST_ID);
  assert.equal(body.error_code, "AI_CHANNEL_UNAVAILABLE");

  const [runnerInputId, aiAttemptId] = sentRequestIds;
  assert.equal(runnerInputId, REQUEST_ID);
  assert.equal(aiAttemptId, REQUEST_ID, "失败那次也必须用接口编号写 ai_call_attempts");
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.requestId, REQUEST_ID, "失败那次也必须用接口编号写 ocr_recognition_logs");
  assert.equal(logged[0]?.isSuccess, false);
  const attempts = (logged[0]?.fallbackDetail as { attempts: OcrFallbackAttempt[] } | null)?.attempts ?? [];
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.ok, false);
});

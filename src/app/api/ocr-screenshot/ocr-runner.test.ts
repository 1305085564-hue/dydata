import assert from "node:assert/strict";
import test from "node:test";

import { AiChannelError } from "@/lib/ai/client";
import type { ChannelConfig, FeatureConfig } from "@/lib/ai/client-routing";
import { CLAIRIC_MODEL_ID, ClairicOcrError, DEFAULT_CLAIRIC_TIMEOUT_MS } from "@/lib/clairic-ocr";
import { CLAIRIC_ATTEMPT_TIMEOUT_MS, OcrRunnerError, runScreenshotOcr } from "./ocr-runner";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeClairicChannel(id: string, label: string, overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    id,
    name: "Cloudflare Workers AI",
    providerKeyLabel: label,
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/acc-${id}/ai/run`,
    apiKey: `tok-${id}`,
    protocol: "cloudflare_clairic",
    model: CLAIRIC_MODEL_ID,
    canonicalModelId: "clairic",
    providerKeyModelId: id,
    providerKeyId: `key-${id}`,
    source: "provider_key_model",
    ...overrides,
  };
}

function makeVisionChannel(id: string, label: string, overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    id,
    name: "Vision Proxy",
    providerKeyLabel: label,
    baseUrl: "https://vision.example.test/v1",
    apiKey: `vision-tok-${id}`,
    protocol: "openai_compatible",
    model: "claude-haiku-5-5",
    canonicalModelId: "claude-haiku-5-5",
    providerKeyModelId: id,
    providerKeyId: `key-${id}`,
    source: "provider_key_model",
    ...overrides,
  };
}

const DEFAULT_FEATURE: FeatureConfig = {
  featureKey: "ocr_screenshot",
  providerKeyModelId: null,
  modelId: "clairic",
  systemPrompt: "请仔细识别",
  isEnabled: true,
  lifecycleState: "active",
};

test("OCR runner 引用统一的 Clairic 9 秒预算", () => {
  assert.equal(CLAIRIC_ATTEMPT_TIMEOUT_MS, DEFAULT_CLAIRIC_TIMEOUT_MS);
  assert.equal(CLAIRIC_ATTEMPT_TIMEOUT_MS, 9_000);
});

test("CF账号1 429 自动记录冷却并无缝切 CF账号2 成功，台账累计耗时且拆解不含密钥", async () => {
  const cf1 = makeClairicChannel("cf1", "CF账号1");
  const cf2 = makeClairicChannel("cf2", "CF账号2");
  const failureRecords: Array<{ providerKeyId: string; errorType: string; message: string }> = [];
  const successRecords: Array<{ providerKeyId: string }> = [];
  const attemptLogs: Array<{ attemptNo: number; isSuccess: boolean; errorKind: string | null }> = [];
  let clock = 1000;
  const now = () => clock;

  const result = await runScreenshotOcr(
    { dataUrl: PNG, screenshotType: "data", timings: {}, requestId: "33333333-3333-4333-8333-333333333333" },
    {
      now,
      getServiceClient: () => ({}) as never,
      getFeatureConfig: async () => DEFAULT_FEATURE,
      resolveFeatureChannelChain: async () => [cf1, cf2],
      getProviderKeyModelConfig: async () => null,
      claimProviderRecovery: async () => null,
      releaseProviderRecovery: async () => {},
      recordProviderFailure: async (arg) => {
        failureRecords.push({ providerKeyId: arg.providerKeyId, errorType: arg.errorType, message: arg.message });
      },
      recordProviderSuccess: async (arg) => {
        successRecords.push({ providerKeyId: arg.providerKeyId });
      },
      recordAiCallAttempt: async (arg) => {
        attemptLogs.push({ attemptNo: arg.attemptNo, isSuccess: arg.isSuccess, errorKind: arg.errorKind });
      },
      runClairicAttempt: async ({ credentials, channelName }) => {
        if (credentials.apiKey === "tok-cf1") {
          clock += 1140;
          throw new ClairicOcrError("Cloudflare Clairic 请求过于频繁 tok-cf1 acc-cf1", "RATE_LIMITED", 429);
        }
        clock += 1480;
        assert.equal(credentials.baseUrl, cf2.baseUrl);
        return {
          parsed: {
            slot_status: "confirmed",
            screenshot_type: "data",
            confidence_score: 0.95,
            requires_manual_confirmation: false,
            recognized_fields: { play_count: 5000 },
          },
          channelName: channelName ?? "CF账号2",
          model: CLAIRIC_MODEL_ID,
          usage: { passes: 6, input_tokens: 8000 },
        };
      },
    },
  );

  assert.equal(result.channelName, "CF账号2");
  assert.equal(result.model, CLAIRIC_MODEL_ID);
  assert.equal(result.protocol, "cloudflare_clairic");
  assert.equal(result.ocrMs, 2620);
  assert.deepEqual(failureRecords, [
    {
      providerKeyId: "key-cf1",
      errorType: "http_429",
      message: "Cloudflare Clairic 请求过于频繁 [凭据已隐藏] [凭据已隐藏]",
    },
  ]);
  assert.deepEqual(successRecords, [{ providerKeyId: "key-cf2" }]);
  assert.deepEqual(attemptLogs, [
    { attemptNo: 1, isSuccess: false, errorKind: "限流" },
    { attemptNo: 2, isSuccess: true, errorKind: null },
  ]);
  assert.deepEqual(result.fallbackDetail.attempts, [
    {
      channel_name: "CF账号1",
      model_id: CLAIRIC_MODEL_ID,
      protocol: "cloudflare_clairic",
      ok: false,
      elapsed_ms: 1140,
      error_code: "RATE_LIMITED",
      reason: "限流429",
    },
    {
      channel_name: "CF账号2",
      model_id: CLAIRIC_MODEL_ID,
      protocol: "cloudflare_clairic",
      ok: true,
      elapsed_ms: 1480,
    },
  ]);
});

test("全部 Clairic 不可用时无缝回退到全局默认视觉模型完成识别", async () => {
  const cf1 = makeClairicChannel("cf1", "CF主账号");
  const cf2 = makeClairicChannel("cf2", "CF备用");
  const vision = makeVisionChannel("v1", "默认视觉渠道");
  let clock = 5000;
  let capturedPromptSystem: string | null = null;
  let capturedValidate: ((content: string) => boolean) | undefined;

  const result = await runScreenshotOcr(
    { dataUrl: PNG, screenshotType: "data", timings: {}, requestId: "33333333-3333-4333-8333-333333333333" },
    {
      now: () => clock,
      getServiceClient: () => ({}) as never,
      getFeatureConfig: async () => DEFAULT_FEATURE,
      resolveFeatureChannelChain: async () => [cf1, cf2, vision],
      getProviderKeyModelConfig: async () => null,
      claimProviderRecovery: async () => null,
      releaseProviderRecovery: async () => {},
      recordProviderFailure: async () => {},
      recordProviderSuccess: async () => {},
      recordAiCallAttempt: async () => {},
      normalizeVisionDataUrl: async (url) => url,
      runClairicAttempt: async () => {
        clock += 500;
        throw new ClairicOcrError("Cloudflare Clairic 请求超时（9000ms）", "TIMEOUT");
      },
      sendToChannel: async (_channel, options) => {
        clock += 1200;
        capturedPromptSystem = options.messages[0]?.role === "system" ? String(options.messages[0].content) : null;
        capturedValidate = options.validateContent;
        return {
          content: JSON.stringify({
            play_count: 32100,
            likes: 1280,
            comments: 68,
            shares: 15,
            favorites: 106,
            follower_gain: 42,
            confidence: { play_count: "high", likes: "high", comments: "high", shares: "high", favorites: "high", follower_gain: "high" },
          }),
          model: "claude-haiku-5-5",
          channelName: "Vision Proxy",
          elapsedMs: 1200,
        };
      },
    },
  );

  assert.equal(capturedPromptSystem, "请仔细识别");
  assert.equal(capturedValidate?.('{"play_count":1}'), true);
  assert.equal(capturedValidate?.("无法查看图片"), false);
  assert.equal(result.channelName, "默认视觉渠道");
  assert.equal(result.model, "claude-haiku-5-5");
  assert.equal(result.protocol, "openai_compatible");
  assert.equal(result.ocrMs, 2200);
  assert.equal(result.parsed.slot_status, "confirmed");
  assert.equal(result.fallbackDetail.attempts.length, 3);
  assert.equal(result.fallbackDetail.attempts[0]?.reason, "请求超时");
  assert.equal(result.fallbackDetail.attempts[2]?.ok, true);
});

test("Clairic 返回业务全空（slot_status=failed）直接返回，不回退到兜底视觉模型", async () => {
  const cf1 = makeClairicChannel("cf1", "CF主账号");
  const vision = makeVisionChannel("v1", "默认视觉渠道");
  let visionCalled = false;

  const result = await runScreenshotOcr(
    { dataUrl: PNG, screenshotType: "data", timings: {}, requestId: "33333333-3333-4333-8333-333333333333" },
    {
      getServiceClient: () => ({}) as never,
      getFeatureConfig: async () => DEFAULT_FEATURE,
      resolveFeatureChannelChain: async () => [cf1, vision],
      recordProviderSuccess: async () => {},
      recordAiCallAttempt: async () => {},
      runClairicAttempt: async () => ({
        parsed: {
          slot_status: "failed",
          screenshot_type: "data",
          confidence_score: 0,
          requires_manual_confirmation: true,
          error_code: "LOW_CONFIDENCE",
          error: "未识别到数据",
          recognized_fields: null,
        },
        channelName: "CF主账号",
        model: CLAIRIC_MODEL_ID,
        usage: { passes: 2, input_tokens: 100 },
      }),
      sendToChannel: async () => {
        visionCalled = true;
        throw new Error("业务全空不应回退");
      },
    },
  );

  assert.equal(visionCalled, false);
  assert.equal(result.parsed.slot_status, "failed");
  assert.equal(result.fallbackDetail.attempts.length, 1);
  assert.equal(result.fallbackDetail.attempts[0]?.ok, true);
});

test("全部渠道失败时抛出 OcrRunnerError，保留 attempts 明细、累计耗时且脱敏凭据", async () => {
  const cf1 = makeClairicChannel("cf1", "CF1");
  const v1 = makeVisionChannel("v1", "V1");
  let clock = 100;

  await assert.rejects(
    () =>
      runScreenshotOcr(
        { dataUrl: PNG, screenshotType: "data", timings: {}, requestId: "33333333-3333-4333-8333-333333333333" },
        {
          now: () => clock,
          getServiceClient: () => ({}) as never,
          getFeatureConfig: async () => DEFAULT_FEATURE,
          resolveFeatureChannelChain: async () => [cf1, v1],
          recordProviderFailure: async () => {},
          recordAiCallAttempt: async () => {},
          normalizeVisionDataUrl: async (u) => u,
          runClairicAttempt: async () => {
            clock += 300;
            throw new ClairicOcrError("鉴权失败 tok-cf1", "AUTH", 401);
          },
          sendToChannel: async () => {
            clock += 900;
            throw new AiChannelError("AI 请求超时 vision-tok-v1", "timeout", true);
          },
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof OcrRunnerError);
      assert.equal(err.errorCode, "AI_TIMEOUT");
      assert.equal(err.ocrMs, 1200);
      assert.equal(err.lastChannelName, "V1");
      assert.equal(err.lastModel, "claude-haiku-5-5");
      assert.equal(err.attempts.length, 2);
      assert.equal(err.attempts[0]?.reason, "鉴权失败");
      assert.equal(err.attempts[1]?.reason, "请求超时");
      assert.equal(err.message.includes("vision-tok-v1"), false);
      assert.equal(err.message.includes("tok-cf1"), false);
      return true;
    },
  );
});

test("总预算 60s 耗尽或恢复租约未抢到时停止继续派发", async () => {
  const cf1 = makeClairicChannel("cf1", "CF1");
  const cf2 = makeClairicChannel("cf2", "CF2", { requiresProbe: true });
  const cf3 = makeClairicChannel("cf3", "CF3");
  let clock = 0;
  const called: string[] = [];

  await assert.rejects(
    () =>
      runScreenshotOcr(
        { dataUrl: PNG, screenshotType: "data", timings: {}, requestId: "33333333-3333-4333-8333-333333333333" },
        {
          now: () => clock,
          getServiceClient: () => ({}) as never,
          getFeatureConfig: async () => DEFAULT_FEATURE,
          resolveFeatureChannelChain: async () => [cf1, cf2, cf3],
          claimProviderRecovery: async () => null,
          recordProviderFailure: async () => {},
          recordAiCallAttempt: async () => {},
          runClairicAttempt: async ({ channelName }) => {
            called.push(channelName ?? "");
            clock += 59_000;
            throw new ClairicOcrError("timeout", "TIMEOUT");
          },
        },
      ),
    (err: unknown) => err instanceof OcrRunnerError,
  );

  assert.deepEqual(called, ["CF1"]);
});

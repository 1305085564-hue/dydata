import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { AiChannelError } from "@/lib/ai/client";
import type { ChannelConfig } from "@/lib/ai/client-routing";
import { POST, buildOcrScreenshotResponse, defaultOcrScreenshotDeps } from "./route";
import { recordOcrRecognitionLog, type OcrLogParams } from "./ocr-log";
import { OcrRunnerError, runScreenshotOcr } from "./ocr-runner";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const OCR_JSON = JSON.stringify({
  play_count: 32100, likes: 1280, comments: 68, shares: 15, favorites: 106, follower_gain: 42,
  confidence: { play_count: "high", likes: "high", comments: "high", shares: "high", favorites: "high", follower_gain: "high" },
});

type RouteDeps = Parameters<typeof buildOcrScreenshotResponse>[1];

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://dydata.cc/api/ocr-screenshot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dydata-request-id": REQUEST_ID },
    body: JSON.stringify(body),
  });
}

const observation = { requestId: REQUEST_ID, mark: () => {}, setDetail: () => {} } as const;

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

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) } }) as never,
    runOcr: async (input) => runScreenshotOcr(input, {
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
      recordAiCallAttempt: async () => {},
      normalizeVisionDataUrl: async (u) => u,
      sendToChannel: async () => ({
        content: OCR_JSON,
        model: "claude-haiku-5-5",
        channelName: "api9 claude (max)",
        elapsedMs: 1500,
      }),
    }),
    recordLog: async () => {},
    ...overrides,
  } as RouteDeps;
}

function assertLayered(body: Record<string, unknown>) {
  for (const field of ["businessSucceeded", "permissionChecked", "auditStatus", "employeeNotificationStatus", "todoStatus", "compensationRequired"]) {
    assert.ok(field in body, `缺少分层字段 ${field}`);
  }
}

test("ocr-screenshot：依赖返回未登录时真实 handler 明确失败并只写一条日志", async () => {
  const original = defaultOcrScreenshotDeps.createClient;
  const originalInfo = console.info;
  const logs: string[] = [];
  defaultOcrScreenshotDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }) as never;
  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const response = await POST(new NextRequest("https://dydata.cc/api/ocr-screenshot", {
      method: "POST",
      headers: { "x-dydata-request-id": REQUEST_ID, "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("x-dydata-request-id"), REQUEST_ID);
    const body = await response.json() as Record<string, unknown>;
    assertLayered(body);
    assert.equal(body.businessSucceeded, false);
    assert.equal(body.error, "未登录");
  } finally {
    defaultOcrScreenshotDeps.createClient = original;
    console.info = originalInfo;
  }
  assert.equal(logs.filter((line) => line.includes("/api/ocr-screenshot")).length, 1);
});

test("截图识别全链路成功：真实渠道名、耗时与 fallbackDetail 写入测速台账", async () => {
  const logged: OcrLogParams[] = [];
  const response = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }),
    makeDeps({ recordLog: async (params) => { logged.push(params); } }),
    observation,
  );
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.businessSucceeded, true);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].channelName, "api9 claude (max)");
  assert.equal(logged[0].modelId, "claude-haiku-5-5");
  assert.equal(logged[0].isSuccess, true);
  assert.equal(logged[0].screenshotType, "data");
  assert.equal(logged[0].userId, USER_ID);
  assert.ok(typeof logged[0].totalMs === "number" && logged[0].totalMs >= 0);
  assert.ok(typeof logged[0].ocrMs === "number" && logged[0].ocrMs! >= 0);
  assert.equal(logged[0].fallbackDetail?.attempts.length, 1);
  assert.equal(logged[0].fallbackDetail?.attempts[0]?.protocol, "openai_compatible");
});

function promptCapturingDeps(prompts: string[], logged: OcrLogParams[] = []) {
  return makeDeps({
    runOcr: async (input) => runScreenshotOcr(input, {
      getServiceClient: () => null,
      getFeatureConfig: async () => ({
        featureKey: "ocr_screenshot",
        providerKeyModelId: null,
        modelId: "m",
        systemPrompt: null,
        isEnabled: true,
        lifecycleState: "active",
      }),
      resolveFeatureChannelChain: async () => [VISION_CHANNEL],
      recordAiCallAttempt: async () => {},
      normalizeVisionDataUrl: async (u) => u,
      sendToChannel: async (_ch, { messages }) => {
        const content = messages[0]?.content;
        const first = Array.isArray(content) ? content[0] : null;
        prompts.push(first?.type === "text" ? first.text : String(content ?? ""));
        return { content: OCR_JSON, model: "m", channelName: "vision", elapsedMs: 10 };
      },
    }),
    recordLog: async (params) => { logged.push(params); },
  });
}

test("不带截图类型直接 400：不猜类型、不调模型、不落测速台账", async () => {
  const prompts: string[] = [];
  const logged: OcrLogParams[] = [];
  for (const body of [{ image: PNG }, { image: PNG, asset_role: "screenshot_1" }, { image: PNG, screenshot_type: "auto" }]) {
    const response = await buildOcrScreenshotResponse(makeRequest(body), promptCapturingDeps(prompts, logged), observation);
    assert.equal(response.status, 400);
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.businessSucceeded, false);
    assert.match(String(payload.error), /screenshot_type/);
  }
  assert.equal(prompts.length, 0);
  assert.equal(logged.length, 0);
});

test("显式类型只发单族提示词，返回来源为 explicit", async () => {
  const prompts: string[] = [];
  const dataResponse = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }), promptCapturingDeps(prompts), observation,
  );
  const dataBody = await dataResponse.json() as Record<string, unknown>;
  assert.equal(dataBody.screenshot_type, "data");
  assert.equal(dataBody.screenshot_type_source, "explicit");
  await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "retention" }), promptCapturingDeps(prompts), observation,
  );
  assert.equal(prompts.length, 2, "每张图只调一次模型");
  assert.match(prompts[0], /play_count/);
  assert.doesNotMatch(prompts[0], /retention_metrics/);
  assert.match(prompts[1], /retention_metrics/);
  assert.doesNotMatch(prompts[1], /play_count/);
});

test("未登录与输入错误不写测速台账（只记真正进入识别的请求）", async () => {
  const logged: OcrLogParams[] = [];
  const recordLog = async (params: OcrLogParams) => { logged.push(params); };

  const unauth = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG }),
    makeDeps({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) as never,
      recordLog,
    }),
    observation,
  );
  assert.equal(unauth.status, 401);

  const badInput = await buildOcrScreenshotResponse(
    makeRequest({ image: "" }),
    makeDeps({ recordLog }),
    observation,
  );
  assert.equal(badInput.status, 400);
  assert.equal(logged.length, 0);
});

test("台账写入抛异常绝不影响识别业务回执", async () => {
  const response = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }),
    makeDeps({ recordLog: async () => { throw new Error("db down"); } }),
    observation,
  );
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.businessSucceeded, true);
});

test("识别超时仍落一条失败台账：记录错误码 AI_TIMEOUT、最后尝试渠道与 fallback_detail", async () => {
  const logged: OcrLogParams[] = [];
  const response = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }),
    makeDeps({
      runOcr: async (input) => runScreenshotOcr(input, {
        getServiceClient: () => null,
        getFeatureConfig: async () => null,
        resolveFeatureChannelChain: async () => [VISION_CHANNEL],
        recordAiCallAttempt: async () => {},
        normalizeVisionDataUrl: async (u) => u,
        sendToChannel: async () => { throw new AiChannelError("AI 请求超时（45000ms）", "timeout", true); },
      }),
      recordLog: async (params) => { logged.push(params); },
    }),
    observation,
  );
  assert.equal(response.status, 500);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].isSuccess, false);
  assert.equal(logged[0].errorCode, "AI_TIMEOUT");
  assert.equal(logged[0].channelName, "api9 claude (max)");
  assert.equal(logged[0].fallbackDetail?.attempts[0]?.error_code, "AI_TIMEOUT");
});

test("无可用渠道时失败台账渠道留空且错误码为 AI_CHANNEL_UNAVAILABLE", async () => {
  const logged: OcrLogParams[] = [];
  const response = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }),
    makeDeps({
      runOcr: async () => {
        throw new OcrRunnerError("无可用截图识别渠道", {
          errorCode: "AI_CHANNEL_UNAVAILABLE",
          ocrMs: 0,
          attempts: [],
          lastChannelName: null,
          lastModel: null,
        });
      },
      recordLog: async (params) => { logged.push(params); },
    }),
    observation,
  );
  assert.equal(response.status, 500);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].errorCode, "AI_CHANNEL_UNAVAILABLE");
  assert.equal(logged[0].channelName, null);
});

test("AI 返回无法解析时明确 500，并把 AI_PARSE_FAILED 写进台账", async () => {
  const logged: OcrLogParams[] = [];
  const response = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }),
    makeDeps({
      runOcr: async (input) => runScreenshotOcr(input, {
        getServiceClient: () => null,
        getFeatureConfig: async () => null,
        resolveFeatureChannelChain: async () => [VISION_CHANNEL],
        recordAiCallAttempt: async () => {},
        normalizeVisionDataUrl: async (u) => u,
        sendToChannel: async () => ({
          content: "这不是 JSON", model: "m", channelName: "c", elapsedMs: 10,
        }),
      }),
      recordLog: async (params) => { logged.push(params); },
    }),
    observation,
  );
  assert.equal(response.status, 500);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.error_code, "AI_PARSE_FAILED");
  assert.equal(logged.length, 1);
  assert.equal(logged[0].errorCode, "AI_PARSE_FAILED");
});

test("识别不到任何数字时返回 200 + failed，提示走人工确认", async () => {
  const response = await buildOcrScreenshotResponse(
    makeRequest({ image: PNG, screenshot_type: "data" }),
    makeDeps({
      runOcr: async (input) => runScreenshotOcr(input, {
        getServiceClient: () => null,
        getFeatureConfig: async () => null,
        resolveFeatureChannelChain: async () => [VISION_CHANNEL],
        recordAiCallAttempt: async () => {},
        normalizeVisionDataUrl: async (u) => u,
        sendToChannel: async () => ({
          content: "{}", model: "m", channelName: "c", elapsedMs: 10,
        }),
      }),
    }),
    observation,
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { slot_status: string; error_code?: string } };
  assert.equal(body.data.slot_status, "failed");
  assert.equal(body.data.error_code, "LOW_CONFIDENCE");
});

test("multipart 上传缺文件或类型不支持时返回 400，不调用 AI", async () => {
  let ocrCalled = false;
  const deps = makeDeps({
    runOcr: async () => {
      ocrCalled = true;
      throw new Error("不应调用 AI");
    },
  });

  const missingFile = new FormData();
  const missingResponse = await buildOcrScreenshotResponse(
    new NextRequest("https://dydata.cc/api/ocr-screenshot", { method: "POST", body: missingFile }),
    deps,
    observation,
  );
  assert.equal(missingResponse.status, 400);
  assert.equal((await missingResponse.json() as { error: string }).error, "请上传图片文件");

  const wrongType = new FormData();
  wrongType.append("file", new Blob(["hello"], { type: "text/plain" }), "note.txt");
  const wrongTypeResponse = await buildOcrScreenshotResponse(
    new NextRequest("https://dydata.cc/api/ocr-screenshot", { method: "POST", body: wrongType }),
    deps,
    observation,
  );
  assert.equal(wrongTypeResponse.status, 400);
  assert.equal((await wrongTypeResponse.json() as { error: string }).error, "仅支持 jpg、png、webp 图片");
  assert.equal(ocrCalled, false);
});

test("台账 insert 写入 fallback_detail，且返回 error 时告警但不影响调用方", async () => {
  const inserted: Record<string, unknown>[] = [];
  await recordOcrRecognitionLog(
    {
      totalMs: 1200,
      ocrMs: 1100,
      isSuccess: true,
      fallbackDetail: {
        attempts: [{ channel_name: "CF1", model_id: "@cf/cloudflare/clairic", protocol: "cloudflare_clairic", ok: true, elapsed_ms: 1100 }],
      },
    },
    () => ({
      from: () => ({
        insert: async (payload: Record<string, unknown>) => {
          inserted.push(payload);
          return { error: null };
        },
      }),
    }) as never,
  );
  assert.equal((inserted[0]?.fallback_detail as { attempts: unknown[] })?.attempts.length, 1);

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    await recordOcrRecognitionLog(
      { totalMs: 100, isSuccess: true },
      () => ({ from: () => ({ insert: async () => ({ error: { message: "permission denied" } }) }) }) as never,
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ocr_recognition_logs/);
});

test("台账客户端创建失败被吞并，调用方无感", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await recordOcrRecognitionLog({ totalMs: 100, isSuccess: true }, () => { throw new Error("missing env"); });
  } finally {
    console.warn = originalWarn;
  }
});

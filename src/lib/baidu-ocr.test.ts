import assert from "node:assert/strict";
import test from "node:test";

import {
  BaiduOcrError,
  _resetBaiduOcrTokenCacheForTest,
  classifyBaiduOcrErrorCode,
  compressImageForOcr,
  getImageDimensions,
  getBaiduOcrAccessToken,
  recognizeWebImage,
  validateWebImage,
} from "./baidu-ocr";
import sharp from "sharp";

type FetchCall = { url: string; body: string | null };
type FetchHandler = (call: { url: string; body: string | null }) => Response;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchSequence(t: import("node:test").TestContext, handlers: FetchHandler[]) {
  const calls: FetchCall[] = [];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: String(url),
      body:
        typeof init?.body === "string"
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : null,
    };
    calls.push(call);
    const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)];
    return handler(call);
  });
  return calls;
}

const tokenResponse = () => jsonResponse({ access_token: "fake-token", expires_in: 2592000 });
const webimageResponse = (payload: Record<string, unknown>) =>
  jsonResponse({ log_id: 12345, ...payload });

function installKeys(t: import("node:test").TestContext) {
  const savedKey = process.env.BAIDU_OCR_API_KEY;
  const savedSecret = process.env.BAIDU_OCR_SECRET_KEY;
  process.env.BAIDU_OCR_API_KEY = "test-api-key";
  process.env.BAIDU_OCR_SECRET_KEY = "test-secret-key";
  t.after(() => {
    if (savedKey === undefined) delete process.env.BAIDU_OCR_API_KEY;
    else process.env.BAIDU_OCR_API_KEY = savedKey;
    if (savedSecret === undefined) delete process.env.BAIDU_OCR_SECRET_KEY;
    else process.env.BAIDU_OCR_SECRET_KEY = savedSecret;
  });
}

/** 固定 Date.now，返回推进时间的控制器 */
function installFakeClock(t: import("node:test").TestContext, startMs: number) {
  let currentMs = startMs;
  t.mock.method(Date, "now", () => currentMs);
  return {
    advance(ms: number) {
      currentMs += ms;
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function makePng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test.beforeEach(() => {
  _resetBaiduOcrTokenCacheForTest();
});

test("API Key 缺失时抛出明确的配置错误，且不发任何网络请求", async (t) => {
  const savedKey = process.env.BAIDU_OCR_API_KEY;
  const savedSecret = process.env.BAIDU_OCR_SECRET_KEY;
  delete process.env.BAIDU_OCR_API_KEY;
  delete process.env.BAIDU_OCR_SECRET_KEY;
  t.after(() => {
    if (savedKey !== undefined) process.env.BAIDU_OCR_API_KEY = savedKey;
    else delete process.env.BAIDU_OCR_API_KEY;
    if (savedSecret !== undefined) process.env.BAIDU_OCR_SECRET_KEY = savedSecret;
    else delete process.env.BAIDU_OCR_SECRET_KEY;
  });

  const fetchMock = t.mock.method(globalThis, "fetch", async () => tokenResponse());
  await assert.rejects(
    () => getBaiduOcrAccessToken(),
    (error: unknown) => error instanceof BaiduOcrError && error.errorType === "CONFIG",
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("token 首次换取后缓存命中，第二次调用不再发请求", async (t) => {
  installKeys(t);
  const clock = installFakeClock(t, 1_000_000_000_000);
  const calls = mockFetchSequence(t, [() => tokenResponse()]);

  const first = await getBaiduOcrAccessToken();
  const second = await getBaiduOcrAccessToken();
  clock.advance(10 * DAY_MS); // 远小于 29 天刷新点
  const third = await getBaiduOcrAccessToken();

  assert.equal(first, "fake-token");
  assert.equal(second, "fake-token");
  assert.equal(third, "fake-token");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/oauth/2.0/token"));
  assert.ok(calls[0].body?.includes("grant_type=client_credentials"));
});

test("token 在 29 天安全余量刷新点前命中缓存，越过刷新点后自动重新换取", async (t) => {
  installKeys(t);
  let currentMs = 1_000_000_000_000;
  t.mock.method(Date, "now", () => currentMs);
  const calls = mockFetchSequence(t, [() => tokenResponse(), () => tokenResponse()]);

  await getBaiduOcrAccessToken();
  assert.equal(calls.length, 1);

  currentMs += 28.5 * DAY_MS; // 未到 29 天刷新点，应命中缓存
  await getBaiduOcrAccessToken();
  assert.equal(calls.length, 1);

  currentMs += 0.6 * DAY_MS; // 越过 29 天刷新点（30 天 - 1 天余量）
  const refreshed = await getBaiduOcrAccessToken();

  assert.equal(refreshed, "fake-token");
  assert.equal(calls.length, 2, "到达提前刷新点后必须重新换取 token");
});

test("识别遇 110 自动刷新 token 重试成功", async (t) => {
  installKeys(t);
  const imageBuffer = Buffer.from("hello-image");
  const calls = mockFetchSequence(t, [
    () => tokenResponse(),
    () => webimageResponse({ error_code: 110, error_msg: "Access token invalid" }),
    () => jsonResponse({ access_token: "fake-token-2", expires_in: 2592000 }),
    () => webimageResponse({ words_result: [{ words: "播放量 32100" }, { words: "点赞 128" }] }),
  ]);

  const lines = await recognizeWebImage(imageBuffer);

  assert.deepEqual(lines, ["播放量 32100", "点赞 128"]);
  assert.equal(calls.length, 4);
  assert.ok(calls[3].url.includes("access_token=fake-token-2"), "重试必须使用刷新后的新 token");
});

test("识别遇 111 刷新重试仍失败则抛 TOKEN_INVALID", async (t) => {
  installKeys(t);
  mockFetchSequence(t, [
    () => tokenResponse(),
    () => webimageResponse({ error_code: 111, error_msg: "Access token expired" }),
    () => tokenResponse(),
    () => webimageResponse({ error_code: 111, error_msg: "Access token expired" }),
  ]);

  await assert.rejects(
    () => recognizeWebImage(Buffer.from("hello-image")),
    (error: unknown) => error instanceof BaiduOcrError && error.errorType === "TOKEN_INVALID",
  );
});

test("各错误码按五类分法归类并抛出对应错误", async (t) => {
  const cases: Array<{ code: number; expected: BaiduOcrError["errorType"] }> = [
    { code: 18, expected: "QPS_LIMITED" },
    { code: 17, expected: "QUOTA_EXCEEDED" },
    { code: 19, expected: "QUOTA_EXCEEDED" },
    { code: 216604, expected: "QUOTA_EXCEEDED" },
    { code: 216201, expected: "IMAGE_REJECTED" },
    { code: 216202, expected: "IMAGE_REJECTED" },
    { code: 216205, expected: "IMAGE_REJECTED" },
    { code: 282100, expected: "IMAGE_REJECTED" },
    { code: 282000, expected: "SERVICE_ERROR" },
  ];

  for (const item of cases) {
    assert.equal(classifyBaiduOcrErrorCode(item.code), item.expected);

    installKeys(t);
    mockFetchSequence(t, [
      () => tokenResponse(),
      () => webimageResponse({ error_code: item.code, error_msg: "mock" }),
    ]);
    await assert.rejects(
      () => recognizeWebImage(Buffer.from("hello-image")),
      (error: unknown) =>
        error instanceof BaiduOcrError &&
        error.errorType === item.expected &&
        error.baiduErrorCode === item.code,
      `错误码 ${item.code} 应归类为 ${item.expected}`,
    );
    _resetBaiduOcrTokenCacheForTest();
  }
});

test("请求超时映射为 TIMEOUT", async (t) => {
  installKeys(t);
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: RequestInfo | URL, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );

  await assert.rejects(
    () => recognizeWebImage(Buffer.from("hello-image")),
    (error: unknown) => error instanceof BaiduOcrError && error.errorType === "TIMEOUT",
  );
});

test("网络连接失败映射为 SERVICE_ERROR", async (t) => {
  installKeys(t);
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("network down");
  });

  await assert.rejects(
    () => recognizeWebImage(Buffer.from("hello-image")),
    (error: unknown) => error instanceof BaiduOcrError && error.errorType === "SERVICE_ERROR",
  );
});

test("base64 编码超过 4M 时前置拦截，不发起任何请求", async (t) => {
  installKeys(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => tokenResponse());
  const oversized = Buffer.alloc(3_200_000); // base64 后约 4.27M
  const validation = validateWebImage(oversized);
  assert.equal(validation.ok, false);
  if (!validation.ok) assert.match(validation.reason, /4M 上限/);

  await assert.rejects(
    () => recognizeWebImage(oversized),
    (error: unknown) => error instanceof BaiduOcrError && error.errorType === "IMAGE_REJECTED",
  );
  assert.equal(fetchMock.mock.callCount(), 0, "超限图片不允许发起任何网络请求");
});

test("图片边长不符合百度限制时前置拦截（最短边 ≤15px 或最长边 ≥4096px）", async (t) => {
  installKeys(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => tokenResponse());

  const tooSmall = makePng(10, 40);
  assert.deepEqual(getImageDimensions(tooSmall), { width: 10, height: 40 });
  await assert.rejects(() => recognizeWebImage(tooSmall), /最短边/);

  const tooLarge = makePng(5000, 3000);
  await assert.rejects(() => recognizeWebImage(tooLarge), /最长边/);

  assert.equal(fetchMock.mock.callCount(), 0);
});

test("base64 编码正确且剥掉 data:image 头", async (t) => {
  installKeys(t);
  const rawBase64 = Buffer.from("hello-image").toString("base64");
  const dataUrlBuffer = Buffer.from(`data:image/png;base64,${rawBase64}`);
  const calls = mockFetchSequence(t, [
    () => tokenResponse(),
    () => webimageResponse({ words_result: [{ words: "ok" }] }),
  ]);

  const lines = await recognizeWebImage(dataUrlBuffer);

  assert.deepEqual(lines, ["ok"]);
  const ocrCall = calls[1];
  assert.ok(ocrCall.url.includes("/rest/2.0/ocr/v1/webimage"));
  assert.ok(ocrCall.url.includes("access_token=fake-token"));
  const parsedBody = new URLSearchParams(ocrCall.body ?? "");
  assert.equal(parsedBody.get("image"), rawBase64, "请求体必须是剥头后的纯 base64");
});

test("成功解析 words_result 文字行数组，空行被过滤", async (t) => {
  installKeys(t);
  mockFetchSequence(t, [
    () => tokenResponse(),
    () =>
      webimageResponse({
        words_result_num: 3,
        words_result: [{ words: "播放量 32100" }, { words: "" }, { words: " 点赞 128 " }],
      }),
  ]);

  const lines = await recognizeWebImage(Buffer.from("hello-image"));
  assert.deepEqual(lines, ["播放量 32100", "点赞 128"]);
});

test("compressImageForOcr 小图原样返回，不触发压缩", async () => {
  const small = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  assert.ok(small.length <= 3 * 1024 * 1024);
  const result = await compressImageForOcr(small);
  assert.equal(result, small, "小图必须返回同一 Buffer（零拷贝透传）");
});

test("compressImageForOcr 大图压缩到百度限制内，且压缩结果可过前置校验", async () => {
  const noisy = await sharp({
    create: {
      width: 3000,
      height: 3000,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  assert.ok(noisy.length > 3 * 1024 * 1024, "测试前置：构造出的图需超过 3MB 阈值");

  const result = await compressImageForOcr(noisy);
  assert.ok(result.length < noisy.length, "压缩后必须更小");
  const validation = validateWebImage(result);
  assert.equal(validation.ok, true, "压缩结果必须能通过百度前置校验");
});

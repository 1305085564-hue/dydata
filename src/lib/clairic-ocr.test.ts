import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  CLAIRIC_CHANNEL_LABEL,
  CLAIRIC_CHANNEL_NAME,
  CLAIRIC_COMPRESS_THRESHOLD_BYTES,
  CLAIRIC_MAX_IMAGE_EDGE_PX,
  CLAIRIC_MODEL_ID,
  ClairicOcrError,
  callClairicOcr,
  prepareClairicImage,
  probeClairicOcr,
} from "./clairic-ocr";

function installEnv(
  t: import("node:test").TestContext,
  vars: { accountId?: string; apiToken?: string },
) {
  const prevAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const prevToken = process.env.CLOUDFLARE_API_TOKEN;
  if (vars.accountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
  else process.env.CLOUDFLARE_ACCOUNT_ID = vars.accountId;
  if (vars.apiToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
  else process.env.CLOUDFLARE_API_TOKEN = vars.apiToken;

  t.after(() => {
    if (prevAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccount;
    if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = prevToken;
  });
}

test("缺 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN 抛出 CONFIG 错误", async (t) => {
  installEnv(t, { accountId: undefined, apiToken: "tok" });
  await assert.rejects(
    () =>
      callClairicOcr({
        buffer: Buffer.from([1, 2, 3]),
        contentType: "image/png",
        fields: { play_count: { type: "number", integer: true, instructions: "播放量" } },
      }),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "CONFIG",
  );

  installEnv(t, { accountId: "acc-1", apiToken: "" });
  await assert.rejects(
    () =>
      callClairicOcr({
        buffer: Buffer.from([1, 2, 3]),
        contentType: "image/png",
        fields: { play_count: { type: "number", integer: true, instructions: "播放量" } },
      }),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "CONFIG",
  );
});

test("小于等于阈值保持原图字节与 MIME 直传，不做多余重编码", async () => {
  const smallPng = await sharp({
    create: { width: 100, height: 60, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .png()
    .toBuffer();
  assert.ok(smallPng.length <= CLAIRIC_COMPRESS_THRESHOLD_BYTES);

  const prepared = await prepareClairicImage(smallPng, "image/png");
  assert.equal(prepared.compressed, false);
  assert.equal(prepared.contentType, "image/png");
  assert.equal(prepared.buffer, smallPng);
});

test("超过阈值（4 MiB / 3.8 MiB）触发 sharp 压缩到长边 2048px + JPEG 90，绝不低于 2048", async () => {
  // 生成高于阈值的噪声 PNG（2600x1600 不可压缩随机像素）
  const width = 2600;
  const height = 1600;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = (i * 73 + (i >> 5)) & 0xff;
  }
  const hugePng = await sharp(raw, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  assert.ok(
    hugePng.length > CLAIRIC_COMPRESS_THRESHOLD_BYTES,
    `期望合成大图超过阈值，实际=${hugePng.length}`,
  );

  const prepared = await prepareClairicImage(hugePng, "image/png");
  assert.equal(prepared.compressed, true);
  assert.equal(prepared.contentType, "image/jpeg");
  assert.ok(prepared.buffer.length < hugePng.length);

  const meta = await sharp(prepared.buffer).metadata();
  assert.equal(Math.max(meta.width ?? 0, meta.height ?? 0), CLAIRIC_MAX_IMAGE_EDGE_PX);
});

test("正常响应解析 answers 与 usage，并校验请求头与端点格式", async (t) => {
  installEnv(t, { accountId: "acc-test", apiToken: "secret-token-xyz" });
  const smallPng = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  let capturedUrl = "";
  let capturedAuth = "";
  let capturedBody: Record<string, unknown> = {};

  const res = await callClairicOcr(
    {
      buffer: smallPng,
      contentType: "image/png",
      fields: { play_count: { type: "number", integer: true, instructions: "播放量" } },
    },
    {
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
        capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              answers: { play_count: { value: 92800, confidence: 0.96, p_null: 0.01 } },
              usage: { passes: 7, input_tokens: 12345 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(
    capturedUrl,
    `https://api.cloudflare.com/client/v4/accounts/acc-test/ai/run/${CLAIRIC_MODEL_ID}`,
  );
  assert.equal(capturedAuth, "Bearer secret-token-xyz");
  assert.equal(capturedBody.model, "clairic");
  assert.equal(res.answers.play_count?.value, 92800);
  assert.equal(res.usage?.passes, 7);
  assert.equal(res.usage?.input_tokens, 12345);
});

test("HTTP 错误、超时、非 JSON 响应与网络异常均准确分类且不泄露密钥", async (t) => {
  installEnv(t, { accountId: "acc-secret", apiToken: "tok-secret-999" });
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const fields = { play_count: { type: "number" as const, integer: true, instructions: "播放量" } };

  // 401 -> AUTH
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        { fetchImpl: async () => new Response('{"success":false}', { status: 401 }) },
      ),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "AUTH" && err.status === 401,
  );

  // 429 -> RATE_LIMITED
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        { fetchImpl: async () => new Response('{"success":false}', { status: 429 }) },
      ),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "RATE_LIMITED",
  );

  // 502 -> UPSTREAM_ERROR
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        { fetchImpl: async () => new Response('{"success":false}', { status: 502 }) },
      ),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "UPSTREAM_ERROR" && err.status === 502,
  );

  // 非 JSON -> INVALID_RESPONSE
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        { fetchImpl: async () => new Response("bad gateway html", { status: 200 }) },
      ),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "INVALID_RESPONSE",
  );

  // 缺 answers -> INVALID_RESPONSE
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        { fetchImpl: async () => new Response(JSON.stringify({ success: true, result: {} }), { status: 200 }) },
      ),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "INVALID_RESPONSE",
  );

  // 网络报错不泄露 token
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        {
          fetchImpl: async () => {
            throw new Error("connect failed with tok-secret-999");
          },
        },
      ),
    (err: unknown) =>
      err instanceof ClairicOcrError &&
      err.errorType === "UPSTREAM_ERROR" &&
      !err.message.includes("tok-secret-999"),
  );

  // 超时 -> TIMEOUT
  await assert.rejects(
    () =>
      callClairicOcr(
        { buffer: buf, contentType: "image/png", fields },
        {
          timeoutMs: 25,
          fetchImpl: (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            }),
        },
      ),
    (err: unknown) => err instanceof ClairicOcrError && err.errorType === "TIMEOUT",
  );
});

test("probeClairicOcr 返回标准探针结果与中文错误诊断", async (t) => {
  installEnv(t, { accountId: undefined, apiToken: undefined });
  const missing = await probeClairicOcr();
  assert.equal(missing.ok, false);
  assert.equal(missing.model, CLAIRIC_MODEL_ID);
  assert.equal(missing.channelName, CLAIRIC_CHANNEL_NAME);
  assert.equal(missing.channelLabel, CLAIRIC_CHANNEL_LABEL);
  assert.match(missing.message ?? "", /CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN/);

  installEnv(t, { accountId: "acc-ok", apiToken: "tok-ok" });
  const ok = await probeClairicOcr({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: { answers: { probe_text: { value: null, confidence: 0.99, p_null: 0.99 } } },
        }),
        { status: 200 },
      ),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.model, CLAIRIC_MODEL_ID);
  assert.equal(ok.channelName, CLAIRIC_CHANNEL_NAME);
  assert.equal(ok.channelLabel, CLAIRIC_CHANNEL_LABEL);
  assert.ok(typeof ok.latencyMs === "number");
});

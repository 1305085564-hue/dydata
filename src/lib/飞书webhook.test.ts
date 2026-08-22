import assert from "node:assert/strict";
import test from "node:test";

import { sendFeishuWebhook } from "./飞书webhook";
import type { fetchWithTimeout } from "./fetch-timeout";

type FetchStub = typeof fetchWithTimeout;

function okResponse() {
  return new Response(JSON.stringify({ code: 0 }), { status: 200 });
}

test("发送成功返回 ok", async () => {
  let capturedTimeout: number | undefined;
  const stub: FetchStub = (async (_url, _options, timeoutMs) => {
    capturedTimeout = timeoutMs;
    return okResponse();
  }) as FetchStub;

  const result = await sendFeishuWebhook(
    { msg_type: "text" },
    { webhookUrl: "https://open.feishu.cn/hook/test", fetchImpl: stub },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(capturedTimeout, 10_000);
});

test("缺 FEISHU_WEBHOOK_URL 时返回 not_configured 且不发起请求", async () => {
  const original = process.env.FEISHU_WEBHOOK_URL;
  delete process.env.FEISHU_WEBHOOK_URL;
  try {
    const result = await sendFeishuWebhook({}, {});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_configured");
    }
  } finally {
    if (original !== undefined) process.env.FEISHU_WEBHOOK_URL = original;
  }
});

test("非 2xx 返回失败并带状态码和截断预览，不泄露 URL", async () => {
  const stub: FetchStub = (async () =>
    new Response("x".repeat(500), { status: 502 })) as unknown as FetchStub;

  const result = await sendFeishuWebhook(
    {},
    { webhookUrl: "https://open.feishu.cn/hook/secret-token", fetchImpl: stub },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "non_2xx");
    assert.equal(result.status, 502);
    assert.ok(result.bodyPreview && result.bodyPreview.length <= 201);
    assert.ok(!JSON.stringify(result).includes("secret-token"));
  }
});

test("超时映射为 timeout 失败原因，且不做自动重试（只调用一次）", async () => {
  let callCount = 0;
  const stub: FetchStub = (async () => {
    callCount += 1;
    throw new Error("请求超时，请检查网络后重试");
  }) as FetchStub;

  const result = await sendFeishuWebhook(
    {},
    {
      webhookUrl: "https://open.feishu.cn/hook/test",
      fetchImpl: stub,
      timeoutMs: 1,
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "timeout");
  // 超时后投递状态未知，自动重试可能重复发消息——必须只发一次
  assert.equal(callCount, 1);
});

test("网络异常映射为 network 失败原因且不携带错误详情", async () => {
  const stub: FetchStub = (async () => {
    throw new TypeError("fetch failed: https://internal-host/sensitive");
  }) as unknown as FetchStub;

  const result = await sendFeishuWebhook(
    {},
    { webhookUrl: "https://open.feishu.cn/hook/test", fetchImpl: stub },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "network");
    assert.equal(result.bodyPreview, undefined);
  }
});

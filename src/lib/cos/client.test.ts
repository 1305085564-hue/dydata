import assert from "node:assert/strict";
import test from "node:test";

import { cosGetObject } from "./client";

const config = {
  secretId: "secret-id",
  secretKey: "secret-key",
  bucket: "bucket",
  region: "ap-singapore",
};

test("COS 正常响应体可以完整读取", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg", etag: '"abc"' },
    })) as typeof fetch;

  try {
    const result = await cosGetObject(config, "user-1/a.jpg", 2_000);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.byteLength, 3);
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.etag, '"abc"');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("COS 慢响应体在超时内中断，不会无限挂住", { timeout: 5_000 }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 先给一段数据，然后故意不 close，模拟响应体慢传
        controller.enqueue(new Uint8Array([1, 2, 3]));
        signal?.addEventListener("abort", () => {
          controller.error(new Error("aborted"));
        });
      },
    });
    return Promise.resolve(new Response(stream, { status: 200 }));
  }) as typeof fetch;

  try {
    const startedAt = Date.now();
    const result = await cosGetObject(config, "user-1/b.jpg", 200);
    const elapsed = Date.now() - startedAt;
    assert.equal(result.ok, false);
    assert.ok(elapsed < 4_000, `应在超时附近返回，实际 ${elapsed}ms`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

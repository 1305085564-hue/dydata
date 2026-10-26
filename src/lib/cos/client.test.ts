import assert from "node:assert/strict";
import test from "node:test";

import { cosDeleteObject, cosGetObject, cosPutObject } from "./client";

const config = {
  secretId: "secret-id",
  secretKey: "secret-key",
  bucket: "bucket",
  region: "ap-singapore",
};

async function withMockFetch(mock: typeof fetch, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function networkError(code: string, message = "fetch failed") {
  const cause = Object.assign(new Error(`socket error ${code}`), { code });
  return Object.assign(new TypeError(message), { cause });
}

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
      assert.equal(result.attempts, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("COS GET 对 429 和 5xx 最多重试一次并给成功结果记录 attempts", async () => {
  for (const firstStatus of [429, 503]) {
    let calls = 0;
    const logEntries: unknown[][] = [];
    const originalInfo = console.info;
    console.info = ((...args: unknown[]) => logEntries.push(args)) as typeof console.info;
    try {
      await withMockFetch((async () => {
        calls += 1;
        return calls === 1
          ? new Response(null, { status: firstStatus })
          : new Response(new Uint8Array([4, 5]), { status: 200 });
      }) as typeof fetch, async () => {
        const result = await cosGetObject(config, "user-1/private-shot.jpg", 2_000);
        assert.equal(result.ok, true);
        assert.equal(result.attempts, 2);
        if (result.ok) assert.equal(result.body.byteLength, 2);
      });
    } finally {
      console.info = originalInfo;
    }

    assert.equal(calls, 2);
    assert.equal(logEntries.length, 1);
    const [prefix, encoded] = logEntries[0];
    assert.equal(prefix, "[cos]");
    const entry = JSON.parse(String(encoded));
    assert.ok(Number.isInteger(entry.elapsed_ms));
    const { elapsed_ms, ...stableFields } = entry;
    assert.equal(elapsed_ms >= 0, true);
    assert.deepEqual(stableFields, {
      event: "get_retry",
      host: "bucket.cos.ap-singapore.myqcloud.com",
      region: "ap-singapore",
      kind: "http",
      code: String(firstStatus),
      phase: "headers",
      attempt: 1,
      next_attempt: 2,
      timeout_ms: 2_000,
    });
    assert.doesNotMatch(JSON.stringify(logEntries), /private-shot|secret-id|secret-key/);
  }
});

test("COS GET 从循环 AggregateError cause 中识别网络码且不返回原始错误消息", async () => {
  let calls = 0;
  const root = new TypeError("fetch failed https://example.test/path?token=do-not-return");
  const nested = new AggregateError([], "aggregate wrapper");
  const leaf = Object.assign(new Error("socket reset"), { code: "UND_ERR_SOCKET" }) as Error & { cause?: unknown };
  Object.defineProperty(root, "cause", { value: nested });
  (nested.errors as Error[]).push(leaf);
  Object.defineProperty(leaf, "cause", { value: root });

  await withMockFetch((async () => {
    calls += 1;
    throw root;
  }) as typeof fetch, async () => {
    const result = await cosGetObject(config, "user-1/private-shot.jpg", 2_000);
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(result.error, "UND_ERR_SOCKET");
    assert.equal(result.attempts, 2);
    if (!result.ok) {
      assert.deepEqual(result.failure, {
        kind: "network",
        code: "UND_ERR_SOCKET",
        phase: "headers",
        attempts: 2,
      });
      assert.doesNotMatch(result.error, /example\.test|token=|do-not-return/);
    }
  });
  assert.equal(calls, 2);
});

test("COS GET 的证书错误和 401/403/404 不重试", async () => {
  for (const code of ["CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
    let certCalls = 0;
    await withMockFetch((async () => {
      certCalls += 1;
      throw networkError(code, "certificate failed for https://private.test/?token=secret");
    }) as typeof fetch, async () => {
      const result = await cosGetObject(config, "user-1/a.jpg", 2_000);
      assert.equal(result.ok, false);
      assert.equal(result.attempts, 1);
      assert.equal(result.error, code);
      if (!result.ok) {
        assert.deepEqual(result.failure, {
          kind: "network",
          code,
          phase: "headers",
          attempts: 1,
        });
      }
    });
    assert.equal(certCalls, 1);
  }

  for (const status of [401, 403, 404]) {
    let calls = 0;
    await withMockFetch((async () => {
      calls += 1;
      return new Response(null, { status });
    }) as typeof fetch, async () => {
      const result = await cosGetObject(config, "user-1/a.jpg", 2_000);
      assert.equal(result.ok, false);
      assert.equal(result.status, status);
      assert.equal(result.error, `cos_status_${status}`);
      assert.equal(result.attempts, 1);
      if (!result.ok) {
        assert.deepEqual(result.failure, {
          kind: "http",
          code: String(status),
          phase: "headers",
          attempts: 1,
        });
      }
    });
    assert.equal(calls, 1);
  }
});

test("COS GET 会重试 body 阶段的网络中断并标明成功尝试次数", async () => {
  let calls = 0;
  await withMockFetch((async () => {
    calls += 1;
    if (calls === 1) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(networkError("ECONNRESET", "body read failed"));
        },
      });
      return new Response(body, { status: 200 });
    }
    return new Response(new Uint8Array([9]), { status: 200 });
  }) as typeof fetch, async () => {
    const result = await cosGetObject(config, "user-1/a.jpg", 2_000);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    if (result.ok) assert.equal(result.body.byteLength, 1);
  });
  assert.equal(calls, 2);
});

test("COS GET 重试底层 timeout 码，但未知错误保持稳定脱敏且不重试", async () => {
  let timeoutCalls = 0;
  await withMockFetch((async () => {
    timeoutCalls += 1;
    if (timeoutCalls === 1) throw networkError("ETIMEDOUT", "request to https://private.test/?token=secret timed out");
    return new Response(new Uint8Array([2]), { status: 200 });
  }) as typeof fetch, async () => {
    const result = await cosGetObject(config, "user-1/a.jpg", 2_000);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });
  assert.equal(timeoutCalls, 2);

  let unknownCalls = 0;
  await withMockFetch((async () => {
    unknownCalls += 1;
    throw new TypeError("fetch failed https://private.test/?token=never-return-this");
  }) as typeof fetch, async () => {
    const result = await cosGetObject(config, "user-1/a.jpg", 2_000);
    assert.equal(result.ok, false);
    assert.equal(result.error, "COS_READ_FAILED");
    assert.equal(result.attempts, 1);
    if (!result.ok) {
      assert.deepEqual(result.failure, {
        kind: "unknown",
        code: null,
        phase: "headers",
        attempts: 1,
      });
      assert.doesNotMatch(result.error, /private\.test|token=|never-return-this/);
    }
  });
  assert.equal(unknownCalls, 1);
});

test("COS GET 网络重试共用原 timeout 总预算", { timeout: 2_000 }, async () => {
  let calls = 0;
  const startedAt = Date.now();
  await withMockFetch((async (_input, init) => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      throw networkError("ECONNRESET");
    }
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal;
      const abort = () => reject(signal.reason ?? new Error("aborted"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }) as typeof fetch, async () => {
    const result = await cosGetObject(config, "user-1/a.jpg", 120);
    const elapsed = Date.now() - startedAt;
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 2);
    assert.ok(elapsed < 800, `timeout 总预算不应被重试延长，实际 ${elapsed}ms`);
    if (!result.ok) {
      assert.equal(result.error, "cos_timeout");
      assert.deepEqual(result.failure, {
        kind: "timeout",
        code: "COS_TIMEOUT",
        phase: "headers",
        attempts: 2,
      });
    }
  });
  assert.equal(calls, 2);
});

test("COS PUT 和 DELETE 不重试网络错误", async () => {
  let calls = 0;
  await withMockFetch((async () => {
    calls += 1;
    throw networkError("ECONNRESET");
  }) as typeof fetch, async () => {
    await cosPutObject(config, "user-1/upload.jpg", new Uint8Array([1]), "image/jpeg");
    assert.equal(calls, 1);
    calls = 0;
    await cosDeleteObject(config, "user-1/upload.jpg");
    assert.equal(calls, 1);
  });
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

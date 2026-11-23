import test from "node:test";
import assert from "node:assert/strict";

import {
  OCR_CLIENT_TIMEOUT_MS,
  OCR_TIMEOUT_MESSAGE,
  OcrTimeoutError,
  createOcrRequestGuard,
  requestOcr,
} from "./ocr-request";

function withFetch(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => fetcher(String(input), init)) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("前端等待上限比服务端 60 秒略长", () => {
  assert.equal(OCR_CLIENT_TIMEOUT_MS, 65_000);
  assert.ok(OCR_CLIENT_TIMEOUT_MS > 60_000);
  assert.equal(OCR_TIMEOUT_MESSAGE, "识别超时，请手动填写或重试");
});

test("到点中止识别请求并按超时处理", async () => {
  await withFetch(
    (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("This operation was aborted", "AbortError"));
      }, { once: true });
    }),
    async () => {
      await assert.rejects(
        () => requestOcr({ body: "x", timeoutMs: 20 }),
        (error: unknown) => {
          assert.ok(error instanceof OcrTimeoutError, `到点必须抛 OcrTimeoutError，实际 ${String(error)}`);
          assert.equal((error as Error).message, OCR_TIMEOUT_MESSAGE);
          return true;
        },
      );
    },
  );
});

test("用户主动取消（换图/离开）不冒充超时", async () => {
  const external = new AbortController();
  await withFetch(
    (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("This operation was aborted", "AbortError"));
      }, { once: true });
    }),
    async () => {
      const pending = requestOcr({ body: "x", signal: external.signal, timeoutMs: 5_000 });
      external.abort();
      await assert.rejects(pending, (error: unknown) => {
        assert.equal(error instanceof OcrTimeoutError, false, "取消不能被当成超时");
        assert.equal((error as Error).name, "AbortError");
        return true;
      });
    },
  );
});

test("已经取消的 signal 直接不进请求", async () => {
  const external = new AbortController();
  external.abort();
  let called = 0;
  await withFetch(
    () => {
      called += 1;
      return Promise.resolve(new Response("{}", { status: 200 }));
    },
    async () => {
      let thrown: unknown = null;
      try {
        await requestOcr({ body: "x", signal: external.signal });
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown, "已取消的请求不应被当成成功");
      assert.equal((thrown as Error).name, "AbortError");
      assert.equal(called, 0, "已取消的信号不应真的发出请求");
    },
  );
});

test("正常返回时清理定时器，不留下悬挂的计时器", async () => {
  await withFetch(
    () => Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })),
    async () => {
      const response = await requestOcr({ body: "x", timeoutMs: 5_000 });
      assert.equal(response.status, 200);
      const guard = createOcrRequestGuard(undefined, 5_000);
      assert.equal(guard.timedOut(), false);
      guard.dispose();
      assert.equal(guard.signal.aborted, false);
    },
  );
});

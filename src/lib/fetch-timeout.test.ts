import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithTimeout } from "./fetch-timeout";

test("请求成功时返回响应", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ count: 0 })));
  const response = await fetchWithTimeout("https://example.test", undefined, 50);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { count: 0 });
});

test("超时中止会转换为用户可读错误", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  await assert.rejects(() => fetchWithTimeout("https://example.test", undefined, 0), /请求超时/);
});

test("非中止异常原样抛出", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("network down");
  });
  await assert.rejects(() => fetchWithTimeout("https://example.test", undefined, 10), /network down/);
});

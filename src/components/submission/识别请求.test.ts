import test from "node:test";
import assert from "node:assert/strict";

import { OCR_TIMEOUT_MESSAGE } from "@/lib/ocr-request";
import { runManualImportOcr } from "./识别请求";

function pngFile() {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", { type: "image/png" });
}

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("请求固定打到识别接口，并按互动截图带类型（接口不再接受不带类型的请求）", async () => {
  let requestedUrl = "";
  let body: FormData | null = null;
  await withFetch(
    (url, init) => {
      requestedUrl = url;
      body = init?.body instanceof FormData ? init.body : null;
      return Promise.resolve(jsonResponse({ data: { recognized_fields: { play_count: 1 } } }));
    },
    async () => {
      const result = await runManualImportOcr(pngFile());
      assert.equal(result.ok, true);
    },
  );

  assert.equal(requestedUrl, "/api/ocr-screenshot");
  assert.ok(body, "识别请求必须以 FormData 直传文件");
  const sent = body as unknown as FormData;
  assert.equal(sent.get("screenshot_type"), "data");
  assert.equal((sent.get("file") as File).name, "shot.png");
});

test("识别成功：只回填识别到非空值的字段，未识别到的字段不被覆盖", async () => {
  await withFetch(
    () => Promise.resolve(jsonResponse({
      data: {
        recognized_fields: { play_count: 32100, likes: 1280, comments: null },
        confidence: { play_count: "high", likes: "medium", comments: "low" },
      },
    })),
    async () => {
      const result = await runManualImportOcr(pngFile());
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.values, { play_count: "32100", likes: "1280" });
      assert.deepEqual(result.confidence, { play_count: "high", likes: "medium" });
    },
  );
});

test("服务端明确失败时把原因交回去，不假装识别完成", async () => {
  await withFetch(
    () => Promise.resolve(jsonResponse({ error: "截图识别通道暂不可用，请手动填写或稍后重试" }, 500)),
    async () => {
      const result = await runManualImportOcr(pngFile());
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.message, "截图识别通道暂不可用，请手动填写或稍后重试");
    },
  );
});

test("等待超过上限时中止，并提示识别超时、可手动填写或重试", async () => {
  await withFetch(
    (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("This operation was aborted", "AbortError"));
      }, { once: true });
    }),
    async () => {
      const startedAt = Date.now();
      const result = await runManualImportOcr(pngFile(), { timeoutMs: 20 });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.message, OCR_TIMEOUT_MESSAGE);
      assert.ok(Date.now() - startedAt < 5_000, "到点必须中止，不能一直等");
    },
  );
});

test("网络直接失败时提示重试，不留空白提示", async () => {
  await withFetch(
    () => Promise.reject(new TypeError("Failed to fetch")),
    async () => {
      const result = await runManualImportOcr(pngFile());
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.message, "Failed to fetch");
    },
  );
});

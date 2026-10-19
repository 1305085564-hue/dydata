import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST, defaultSubmissionScreenshotDeps } from "./route";

// PNG 头 + 少量字节：只要通过签名校验即可，不参与解码。
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]);

function jsonResponse(body: string, status: number) {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

test("COS 写失败时上传接口必须报错，不得伪成功", async () => {
  const originalEnv = {
    SCREENSHOT_STORAGE: process.env.SCREENSHOT_STORAGE,
    COS_SECRET_ID: process.env.COS_SECRET_ID,
    COS_SECRET_KEY: process.env.COS_SECRET_KEY,
    COS_BUCKET: process.env.COS_BUCKET,
    COS_REGION: process.env.COS_REGION,
  };
  process.env.SCREENSHOT_STORAGE = "cos";
  process.env.COS_SECRET_ID = "test-secret-id";
  process.env.COS_SECRET_KEY = "test-secret-key";
  process.env.COS_BUCKET = "test-bucket-1250000000";
  process.env.COS_REGION = "ap-singapore";

  const originalCreateClient = defaultSubmissionScreenshotDeps.createClient;
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalError = console.error;
  const logs: string[] = [];
  const calls: { url: string; method: string }[] = [];

  defaultSubmissionScreenshotDeps.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "account-1", profile_id: "user-1" }, error: null }),
        }),
      }),
    }),
  }) as never;

  // COS 写失败：不发真实请求，直接让 COS PUT 拿到 500。
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return jsonResponse("denied", 500);
  }) as typeof fetch;

  console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));

  try {
    const form = new FormData();
    form.set("file", new File([PNG_BYTES], "shot.png", { type: "image/png" }));
    form.set("account_id", "account-1");
    form.set("asset_role", "screenshot_1");

    const response = await POST(
      new NextRequest("https://dydata.cc/api/submission-screenshots", {
        method: "POST",
        headers: { "x-dydata-request-id": "22222222-2222-4222-8222-222222222222" },
        body: form,
      }),
    );

    assert.equal(response.status, 500, "COS 写失败必须是 500，不能返回成功码");
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.error, "截图上传失败，请稍后重试");
    assert.equal("path" in body, false, "失败响应不得给出 path");
    assert.equal("url" in body, false, "失败响应不得给出 url");
    assert.equal("data" in body, false, "失败响应不得给出 data 包装的假成功");

    // 只尝试写 COS，没有第二次写 Supabase —— 切到 COS 后新图在 Supabase 无副本。
    assert.equal(calls.length, 1, "不应发生除 COS PUT 以外的写请求");
    assert.equal(calls[0]?.method, "PUT");

    const storageLogs = logs.filter((line) => line.includes("[screenshot-storage]"));
    assert.ok(
      storageLogs.some((line) => line.includes("write_failed") && line.includes('"backend":"cos"')),
      `日志缺少 write_failed + backend=cos：${storageLogs.join(" | ")}`,
    );
  } finally {
    defaultSubmissionScreenshotDeps.createClient = originalCreateClient;
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

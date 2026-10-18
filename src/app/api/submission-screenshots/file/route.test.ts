import test from "node:test";
import assert from "node:assert/strict";

import { buildSubmissionScreenshotFileResponse } from "./route";
import { buildGrantValue } from "@/lib/screenshot-grant";

test("未登录不能读取日报截图", async () => {
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=user-1%2Fa.png"),
    {
      getUser: async () => null,
      getVisibleUserIds: async () => [],
      createSignedUrl: async () => ({ signedUrl: "https://signed.example/a.png", error: null }),
    }
  );

  assert.equal(response.status, 401);
});

test("不能读取其他用户的日报截图", async () => {
  let signed = false;
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=user-2%2Fa.png"),
    {
      getUser: async () => ({ id: "user-1" }),
      getVisibleUserIds: async () => ["user-1"],
      createSignedUrl: async () => {
        signed = true;
        return { signedUrl: "https://signed.example/a.png", error: null };
      },
    }
  );

  assert.equal(response.status, 403);
  assert.equal(signed, false);
});

test("本人截图使用短时签名地址跳转", async () => {
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fa.png"),
    {
      getUser: async () => ({ id: "user-1" }),
      getVisibleUserIds: async () => ["user-1"],
      createSignedUrl: async (path, expiresIn) => {
        assert.equal(path, "user-1/account-1/a.png");
        assert.equal(expiresIn, 60);
        return { signedUrl: "https://signed.example/a.png", error: null };
      },
    }
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://signed.example/a.png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("管理者可读取统一业务范围内成员的日报截图", async () => {
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=member-1%2Faccount-1%2Fa.png"),
    {
      getUser: async () => ({ id: "leader-1" }),
      getVisibleUserIds: async () => ["leader-1", "member-1"],
      createSignedUrl: async () => ({ signedUrl: "https://signed.example/a.png", error: null }),
    }
  );

  assert.equal(response.status, 307);
});

test("有效票据命中快路径并返回图片字节，不再查会话与权限", async () => {
  const originalSecret = process.env.SCREENSHOT_GRANT_SECRET;
  const originalEnabled = process.env.SCREENSHOT_GRANT_ENABLED;
  process.env.SCREENSHOT_GRANT_SECRET = "route-test-secret";
  process.env.SCREENSHOT_GRANT_ENABLED = "1";
  try {
    const grant = buildGrantValue({ v: 1, u: "viewer-1", allow: ["user-1"], exp: 2_000_000_000 }, process.env)!;
    const response = await buildSubmissionScreenshotFileResponse(
      new Request("https://dydata.cc/api/submission-screenshots/file?path=user-1%2Fa.png", { headers: { cookie: `shot_grant=${grant}` } }),
      {
        getUser: async () => { throw new Error("fast path must not call getUser"); },
        getVisibleUserIds: async () => { throw new Error("fast path must not call getVisibleUserIds"); },
        createSignedUrl: async () => ({ signedUrl: null, error: { message: "unused" } }),
        readScreenshot: async () => ({ kind: "bytes", backend: "cos", body: new Uint8Array([1, 2, 3]), contentType: "image/png", etag: "etag", fellBack: false }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-screenshot-mode"), "fast");
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
  } finally {
    if (originalSecret === undefined) delete process.env.SCREENSHOT_GRANT_SECRET;
    else process.env.SCREENSHOT_GRANT_SECRET = originalSecret;
    if (originalEnabled === undefined) delete process.env.SCREENSHOT_GRANT_ENABLED;
    else process.env.SCREENSHOT_GRANT_ENABLED = originalEnabled;
  }
});

test("有效票据遇到不在 allow 的 owner 直接 403", async () => {
  const originalSecret = process.env.SCREENSHOT_GRANT_SECRET;
  process.env.SCREENSHOT_GRANT_SECRET = "route-test-secret";
  try {
    const grant = buildGrantValue({ v: 1, u: "viewer-1", allow: ["user-1"], exp: 2_000_000_000 }, process.env)!;
    const response = await buildSubmissionScreenshotFileResponse(
      new Request("https://dydata.cc/api/submission-screenshots/file?path=user-2%2Fa.png", { headers: { cookie: `shot_grant=${grant}` } }),
      {
        getUser: async () => ({ id: "viewer-1" }),
        getVisibleUserIds: async () => ["viewer-1", "user-2"],
        createSignedUrl: async () => ({ signedUrl: "https://signed.example/a.png", error: null }),
      },
    );
    assert.equal(response.status, 403);
  } finally {
    if (originalSecret === undefined) delete process.env.SCREENSHOT_GRANT_SECRET;
    else process.env.SCREENSHOT_GRANT_SECRET = originalSecret;
  }
});

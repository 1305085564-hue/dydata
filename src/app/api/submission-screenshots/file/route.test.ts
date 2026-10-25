import test from "node:test";
import assert from "node:assert/strict";

import { buildSubmissionScreenshotFileResponse, getScreenshotCacheControl } from "./route";
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
        canReadVideoScreenshot: async () => { throw new Error("fast path must not check video context"); },
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

test("截图缓存：3 天内的图使用 30 分钟私有缓存", () => {
  const now = Date.parse("2026-10-19T00:00:00.000Z");
  assert.equal(
    getScreenshotCacheControl("user-1/account-1/screenshot_1/2026-10-18T06-52-59-583Z-abc.jpg", now),
    "private, max-age=1800",
  );
});

test("截图缓存：4 天前的图使用 30 天私有缓存", () => {
  const now = Date.parse("2026-10-19T00:00:00.000Z");
  assert.equal(
    getScreenshotCacheControl("user-1/account-1/screenshot_1/2026-10-15T06-52-59-583Z-abc.jpg", now),
    "private, max-age=2592000",
  );
});

test("截图缓存：5 月老图使用 30 天私有缓存", () => {
  const now = Date.parse("2026-10-19T00:00:00.000Z");
  assert.equal(
    getScreenshotCacheControl("user-1/account-1/screenshot_1/2026-05-18T06-52-59-583Z-abc.jpg", now),
    "private, max-age=2592000",
  );
});

test("截图缓存：路径解析失败时保守使用 30 分钟私有缓存", () => {
  const now = Date.parse("2026-10-19T00:00:00.000Z");
  assert.equal(
    getScreenshotCacheControl("user-1/account-1/screenshot_1/first-upload.jpg", now),
    "private, max-age=1800",
  );
});

test("截图缓存：恰好 3 天仍按 30 分钟处理", () => {
  const now = Date.parse("2026-10-19T00:00:00.000Z");
  assert.equal(
    getScreenshotCacheControl("user-1/account-1/screenshot_1/2026-10-16T00-00-00-000Z-abc.jpg", now),
    "private, max-age=1800",
  );
});

test("截图缓存：时间戳在未来时保守按 30 分钟处理", () => {
  const now = Date.parse("2026-10-19T00:00:00.000Z");
  assert.equal(
    getScreenshotCacheControl("user-1/account-1/screenshot_1/2026-10-25T06-52-59-583Z-abc.jpg", now),
    "private, max-age=1800",
  );
});

test("截图缓存：字节响应的 Cache-Control 按图龄分档", async () => {
  const originalSecret = process.env.SCREENSHOT_GRANT_SECRET;
  const originalEnabled = process.env.SCREENSHOT_GRANT_ENABLED;
  process.env.SCREENSHOT_GRANT_SECRET = "route-test-secret";
  process.env.SCREENSHOT_GRANT_ENABLED = "1";
  try {
    const grant = buildGrantValue({ v: 1, u: "viewer-1", allow: ["user-1"], exp: 2_000_000_000 }, process.env)!;
    const response = await buildSubmissionScreenshotFileResponse(
      new Request(
        "https://dydata.cc/api/submission-screenshots/file?path=user-1%2Fscreenshot_1%2F2026-05-18T06-52-59-583Z-abc.jpg",
        { headers: { cookie: `shot_grant=${grant}` } },
      ),
      {
        getUser: async () => ({ id: "viewer-1" }),
        getVisibleUserIds: async () => ["user-1"],
        createSignedUrl: async () => ({ signedUrl: null, error: { message: "unused" } }),
        readScreenshot: async () => ({ kind: "bytes", backend: "cos", body: new Uint8Array([1]), contentType: "image/jpeg", etag: "etag", fellBack: false }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, max-age=2592000");
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

async function withVideoContextGrant(run: (cookie: string) => Promise<void>) {
  const oldSecret = process.env.SCREENSHOT_GRANT_SECRET;
  const oldEnabled = process.env.SCREENSHOT_GRANT_ENABLED;
  process.env.SCREENSHOT_GRANT_SECRET = "route-test-secret";
  process.env.SCREENSHOT_GRANT_ENABLED = "1";
  try {
    const grant = buildGrantValue({ v: 1, u: "viewer", allow: ["viewer"], exp: 2_000_000_000 }, process.env)!;
    await run(`shot_grant=${grant}`);
  } finally {
    if (oldSecret === undefined) delete process.env.SCREENSHOT_GRANT_SECRET;
    else process.env.SCREENSHOT_GRANT_SECRET = oldSecret;
    if (oldEnabled === undefined) delete process.env.SCREENSHOT_GRANT_ENABLED;
    else process.env.SCREENSHOT_GRANT_ENABLED = oldEnabled;
  }
}

const contextVideoId = "11111111-1111-4111-8111-111111111111";
const contextImageUrl = `https://dydata.cc/api/submission-screenshots/file?path=other%2Fa.png&videoId=${contextVideoId}`;
const imageBytes = async () => ({ kind: "bytes" as const, backend: "cos" as const, body: new Uint8Array([1]), contentType: "image/png", etag: null, fellBack: false });

for (const hasGrant of [true, false]) {
  test(`作品关联截图在${hasGrant ? "有效但未含作者的grant" : "无grant"}时经精确授权可读`, async () => {
    await withVideoContextGrant(async (cookie) => {
      let exactChecks = 0;
      const response = await buildSubmissionScreenshotFileResponse(
        new Request(contextImageUrl, hasGrant ? { headers: { cookie } } : undefined),
        {
          getUser: async () => ({ id: "viewer" }),
          getVisibleUserIds: async () => {
            assert.equal(hasGrant, false, "有效但拒绝的grant不能退回粗粒度owner列表");
            return ["viewer"];
          },
          canReadVideoScreenshot: async (input) => {
            exactChecks++;
            assert.deepEqual(input, { userId: "viewer", videoId: contextVideoId, path: "other/a.png" });
            return true;
          },
          readScreenshot: imageBytes,
        },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-screenshot-mode"), "slow");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(exactChecks, 1);
    });
  });
}

test("伪造作品上下文被拒绝时不读取存储，也不以owner慢路径绕过grant", async () => {
  await withVideoContextGrant(async (cookie) => {
    let storageRead = false;
    const response = await buildSubmissionScreenshotFileResponse(new Request(contextImageUrl, { headers: { cookie } }), {
      getUser: async () => ({ id: "viewer" }),
      getVisibleUserIds: async () => { throw new Error("不得走粗粒度owner回退"); },
      canReadVideoScreenshot: async () => false,
      readScreenshot: async () => { storageRead = true; return imageBytes(); },
    });
    assert.equal(response.status, 403);
    assert.equal(storageRead, false);
  });
});

test("作品关联例外仍要求真实登录", async () => {
  await withVideoContextGrant(async (cookie) => {
    const response = await buildSubmissionScreenshotFileResponse(new Request(contextImageUrl, { headers: { cookie } }), {
      getUser: async () => null,
      getVisibleUserIds: async () => [],
      canReadVideoScreenshot: async () => { throw new Error("未登录不得调用关联检查"); },
      readScreenshot: async () => { throw new Error("未登录不得读存储"); },
    });
    assert.equal(response.status, 401);
  });
});

test("关联授权服务失败明确503，不伪装成功或读图", async () => {
  await withVideoContextGrant(async (cookie) => {
    const response = await buildSubmissionScreenshotFileResponse(new Request(contextImageUrl, { headers: { cookie } }), {
      getUser: async () => ({ id: "viewer" }),
      getVisibleUserIds: async () => [],
      canReadVideoScreenshot: async () => { throw new Error("database unavailable"); },
      readScreenshot: async () => { throw new Error("授权失败不得读存储"); },
    });
    assert.equal(response.status, 503);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

test("拒绝来自其他站点的 API 写请求", async () => {
  const request = new NextRequest("https://dydata.cc/api/video-submit", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
  });

  const response = await middleware(request);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "请求来源不可信" });
});

test("允许同源 API 写请求", async () => {
  const request = new NextRequest("https://dydata.cc/api/video-submit", {
    method: "POST",
    headers: {
      origin: "https://dydata.cc",
      "sec-fetch-site": "same-origin",
    },
  });

  const response = await middleware(request);
  assert.notEqual(response.status, 403);
});

test("无 Origin 的定时任务请求保持兼容", async () => {
  const request = new NextRequest("https://dydata.cc/api/notifications/cleanup", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  });

  const response = await middleware(request);
  assert.notEqual(response.status, 403);
});

test("API 路由纳入 middleware 匹配范围", async () => {
  const { config } = await import("./middleware");
  assert.ok(config.matcher.includes("/api/:path*"));
});

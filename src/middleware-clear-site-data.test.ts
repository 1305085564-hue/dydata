import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

function buildRequest(url: string, cookie = "") {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

test("普通首次访问不会触发 Clear-Site-Data 跳转", async () => {
  const request = buildRequest("https://dydata.cc/login");
  const response = await middleware(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Clear-Site-Data"), null);
  assert.equal(response.headers.get("location"), null);
});

test("显式恢复参数会清站点数据并跳回干净网址", async () => {
  const request = buildRequest("https://dydata.cc/login?__clear_site_data=1");
  const response = await middleware(request);

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("Clear-Site-Data"), "\"cache\", \"storage\"");
  assert.equal(response.headers.get("location"), "https://dydata.cc/login");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("未登录访问避坑案例会跳转登录并保留回跳路径", async () => {
  const request = buildRequest(
    "https://dydata.cc/violations",
  );
  const response = await middleware(request);

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://dydata.cc/login?next=%2Fviolations");
});

test("避坑案例路径被 middleware matcher 覆盖", async () => {
  const { config } = await import("./middleware");

  assert.ok(config.matcher.includes("/violations/:path*"));
});

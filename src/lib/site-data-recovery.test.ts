import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";

test("普通首次访问不触发清缓存跳转", async () => {
  const response = await middleware(new NextRequest("https://dydata.cc/"));

  assert.equal(response.headers.get("clear-site-data"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.status, 200);
});

test("显式清缓存完成后回到无恢复参数的网址", async () => {
  const response = await middleware(new NextRequest("https://dydata.cc/?__clear_site_data=1&keep=1"));

  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.searchParams.get("__clear_site_data"), null, "恢复参数必须被摘掉，否则会无限跳转");
  assert.equal(location.searchParams.get("keep"), "1", "其余查询参数必须原样保留");
  assert.equal(response.headers.get("clear-site-data"), "\"cache\", \"storage\"");
});

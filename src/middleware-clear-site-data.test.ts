import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

function buildRequest(url: string, cookie = "") {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

test("首轮访问会触发一次性 Clear-Site-Data 跳转", async () => {
  const request = buildRequest("https://dydata.cc/login");
  const response = await middleware(request);

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("Clear-Site-Data"), "\"cache\", \"storage\"");
  assert.match(response.headers.get("location") ?? "", /__clear_site_data=1/);
  assert.match(response.headers.get("set-cookie") ?? "", /dydata-site-cleared=1/);
});

test("已带一次性标记时不再重复清站点数据", async () => {
  const request = buildRequest(
    "https://dydata.cc/login?__clear_site_data=1",
    "dydata-site-cleared=1",
  );
  const response = await middleware(request);

  assert.equal(response.headers.get("Clear-Site-Data"), null);
});


import test from "node:test";
import assert from "node:assert/strict";

import { getCallbackNextPath } from "@/lib/auth-password";
import { GET } from "./route";

function createRequest(url: string) {
  return new Request(url);
}

test("auth callback 缺少 code 和 token_hash 时回登录页 expired", async () => {
  const response = await GET(createRequest("https://dydata.cc/auth/callback?next=/reset-password"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://dydata.cc/login?reset=expired");
});

test("recovery 回调缺少或携带错误 next 时仍进入设置新密码页", () => {
  assert.equal(getCallbackNextPath("recovery", null), "/reset-password");
  assert.equal(getCallbackNextPath("recovery", "/dashboard"), "/reset-password");
  assert.equal(getCallbackNextPath("recovery", "https://evil.example"), "/reset-password");
});

test("recovery 回调保留重置页内部的安全 next", () => {
  assert.equal(
    getCallbackNextPath("recovery", "/reset-password?next=%2Fdashboard"),
    "/reset-password?next=%2Fdashboard",
  );
});

test("非 recovery 回调缺少 next 时仍回登录页", () => {
  assert.equal(getCallbackNextPath("signup", null), "/login");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAccountBlockedResponse, buildMembershipUnavailableResponse } from "./middleware";
import { CLOUD_BASE_SESSION_COOKIE } from "./lib/cloudbase/core";

const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");

test("middleware 对已有会话的页面和 API 统一走 CloudBase 会话校验", () => {
  assert.match(source, /handleCloudBaseSession/);
  assert.match(source, /validateCloudBaseSession/);
  assert.match(source, /账号已归档，请联系 owner 恢复/);
  assert.doesNotMatch(source, /createServerClient/);
});

test("middleware 不拦截无认证 cookie 的公共 API", () => {
  assert.match(source, /!hasAuthCookie && isProtectedAppRoute/);
  assert.doesNotMatch(source, /!hasAuthCookie && \(isProtectedAppRoute \|\| isApiRoute\)/);
});

test("生命周期核验暂时失败返回 503 并保留认证 Cookie", () => {
  const request = new NextRequest("http://localhost:3000/api/dashboard/operator-members", {
    headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=test-token` },
  });

  const response = buildMembershipUnavailableResponse(request, { api: true });

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("页面核验暂时失败返回带重试按钮的 HTML 503 且不清 Cookie", async () => {
  const request = new NextRequest("http://localhost:3000/dashboard?tab=today", {
    headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=test-token` },
  });

  const response = buildMembershipUnavailableResponse(request, { api: false });
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(response.headers.get("Retry-After"), "15");
  assert.match(body, /暂时无法确认账号状态，请稍后重试/);
  assert.match(body, /<button[^>]*>重试<\/button>/);
  assert.match(body, /__membership_retry=1/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("页面第二次失败不再自动刷新，仍保留手动重试", async () => {
  const request = new NextRequest("http://localhost:3000/dashboard?tab=today&__membership_retry=1", {
    headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=test-token` },
  });

  const response = buildMembershipUnavailableResponse(request, { api: false });
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.doesNotMatch(body, /http-equiv=["']refresh/i);
  assert.match(body, /<button[^>]*>重试<\/button>/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("明确归档返回 403 并清理认证 Cookie", () => {
  const request = new NextRequest("http://localhost:3000/api/dashboard/operator-members", {
    headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=test-token` },
  });

  const response = buildAccountBlockedResponse(request, { api: true, archived: true });

  assert.equal(response.status, 403);
  assert.match(response.headers.get("set-cookie") ?? "", new RegExp(CLOUD_BASE_SESSION_COOKIE));
});

test("页面拦截归档会话时跳转到带 archived 提示的登录页", () => {
  const request = new NextRequest("http://localhost:3000/dashboard?tab=today", {
    headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=test-token` },
  });

  const response = buildAccountBlockedResponse(request, { api: false, archived: true });

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?archived=1&next=%2Fdashboard%3Ftab%3Dtoday",
  );
});

test("已失效会话页面仍跳转登录页并清理 Cookie", () => {
  const request = new NextRequest("http://localhost:3000/dashboard?tab=today", {
    headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=test-token` },
  });

  const response = buildAccountBlockedResponse(request, { api: false, archived: false });

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?expired=1&next=%2Fdashboard%3Ftab%3Dtoday",
  );
  assert.match(response.headers.get("set-cookie") ?? "", new RegExp(CLOUD_BASE_SESSION_COOKIE));
});

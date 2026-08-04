import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAccountBlockedResponse, buildMembershipUnavailableResponse } from "./middleware";

const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");

test("middleware 对已有会话的页面和 API 统一校验 membership_status", () => {
  assert.match(source, /hasAuthCookie && \(isProtectedAppRoute \|\| isApiRoute\)/);
  assert.match(source, /\.from\("profiles"\)[\s\S]*\.select\("membership_status"\)/);
  assert.match(source, /membershipStatus === "archived"[\s\S]*buildAccountBlockedResponse/);
  assert.match(source, /账号已归档，请联系 owner 恢复/);
});

test("middleware 不拦截无认证 cookie 的公共 API", () => {
  assert.match(source, /!hasAuthCookie && isProtectedAppRoute/);
  assert.doesNotMatch(source, /!hasAuthCookie && \(isProtectedAppRoute \|\| isApiRoute\)/);
});

test("生命周期核验暂时失败返回 503 并保留认证 Cookie", () => {
  const request = new NextRequest("http://localhost:3000/api/dashboard/operator-members", {
    headers: { cookie: "sb-gcrhhxaopomtposmahsw-auth-token=test-token" },
  });

  const response = buildMembershipUnavailableResponse(request, { api: true });

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("明确归档返回 403 并清理认证 Cookie", () => {
  const request = new NextRequest("http://localhost:3000/api/dashboard/operator-members", {
    headers: { cookie: "sb-gcrhhxaopomtposmahsw-auth-token=test-token" },
  });

  const response = buildAccountBlockedResponse(request, { api: true, archived: true });

  assert.equal(response.status, 403);
  assert.match(response.headers.get("set-cookie") ?? "", /sb-gcrhhxaopomtposmahsw-auth-token/);
});

test("页面拦截归档会话时跳转到带 archived 提示的登录页", () => {
  const request = new NextRequest("http://localhost:3000/dashboard?tab=today", {
    headers: { cookie: "sb-gcrhhxaopomtposmahsw-auth-token=test-token" },
  });

  const response = buildAccountBlockedResponse(request, { api: false, archived: true });

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?archived=1&next=%2Fdashboard%3Ftab%3Dtoday",
  );
});

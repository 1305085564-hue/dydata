import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as proxy, PATCH as proxyWrite } from "./cloudbase/rdb/rest/[...segments]/route";
import { CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession } from "@/lib/cloudbase/core";
import { buildExportResponse } from "./export/route";
import { buildDashboardActivityResponse } from "./dashboard/activity/route";
import { fixedPermissionsForRole } from "@/lib/company-permissions";

const userId = "123e4567-e89b-42d3-a456-426614174001";
const ownClient = { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } };

test("数据库代理：无会话、归档、跨站和非法路径在转发前拦截；成功与失败响应保持安全契约", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnv = process.env.CLOUDBASE_ENV_ID;
  const previousOrigin = process.env.SITE_ORIGIN;
  process.env.CLOUDBASE_ENV_ID = "security-matrix-test";
  process.env.SITE_ORIGIN = "https://dydata.cc";
  let state = "active";
  let upstreamStatus = 200;
  const forwarded: Array<{ url: string; authorization: string | null; serviceKey: string | null }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/user/me")) return Response.json({ sub: userId });
    if (url.endsWith("/rpc/cloudbase_session_status")) return Response.json(state);
    const headers = new Headers(init?.headers);
    forwarded.push({ url, authorization: headers.get("authorization"), serviceKey: headers.get("x-api-key") });
    if (upstreamStatus === 304) return new Response(null, { status: 304, headers: { etag: "synthetic-etag" } });
    return Response.json(upstreamStatus === 200 ? [{ id: "visible-row" }] : {
      code: "42703", message: "column private_profiles.secret does not exist", details: "SQL SELECT /internal/path", hint: "private-host",
    }, { status: upstreamStatus });
  }) as typeof fetch;
  const cookie = serializeCloudBaseSession({ accessToken: "synthetic-user-access", refreshToken: "synthetic-refresh", expiresAt: Date.now() + 120000, subject: userId });
  const request = (withCookie = true, method = "GET", origin?: string) => new NextRequest("https://dydata.cc/api/cloudbase/rdb/rest/profiles?select=id", {
    method, headers: { ...(withCookie ? { cookie: `${CLOUD_BASE_SESSION_COOKIE}=${cookie}` } : {}), ...(origin ? { origin } : {}), authorization: "Bearer attacker-token" },
  });
  const context = { params: Promise.resolve({ segments: ["profiles"] }) };
  try {
    assert.equal((await proxy(request(false), context)).status, 401);
    state = "archived";
    assert.equal((await proxy(request(), context)).status, 401);
    state = "active";
    assert.equal((await proxyWrite(request(true, "PATCH", "https://attacker.invalid"), context)).status, 403);
    assert.equal((await proxy(request(), { params: Promise.resolve({ segments: ["..", "auth"] }) })).status, 400);
    assert.equal(forwarded.length, 0);
    const success = await proxy(request(), context);
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), [{ id: "visible-row" }]);
    assert.equal(forwarded[0].authorization, "Bearer synthetic-user-access");
    assert.equal(forwarded[0].serviceKey, null);
    assert.equal(forwarded[0].url, "https://security-matrix-test.api.tcloudbasegateway.com/v1/rdb/rest/profiles?select=id");
    upstreamStatus = 304;
    const unchanged = await proxy(request(), context);
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), "");
    assert.equal(unchanged.headers.get("etag"), "synthetic-etag");
    for (upstreamStatus of [400, 403, 500]) {
      const rejected = await proxy(request(), context);
      assert.equal(rejected.status, upstreamStatus);
      assert.deepEqual(await rejected.json(), { code: "DATA_REQUEST_FAILED", message: "数据请求失败，请稍后重试", details: null, hint: null });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv === undefined) delete process.env.CLOUDBASE_ENV_ID; else process.env.CLOUDBASE_ENV_ID = previousEnv;
    if (previousOrigin === undefined) delete process.env.SITE_ORIGIN; else process.env.SITE_ORIGIN = previousOrigin;
  }
});

test("导出：注入字符、非法日期和倒置范围拒绝；正常日期仍可导出本人数据", async () => {
  const filters: Array<[string, unknown]> = [];
  let reads = 0;
  const admin = { from(table: string) {
    reads++;
    assert.equal(table, "daily_reports");
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      in: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      or: (value: string) => { filters.push(["or", value]); return query; },
      then: (done: (result: unknown) => void) => done({ count: 0, error: null }),
    };
    return query;
  } };
  const deps = { createClient: async () => ownClient, createAdminClient: () => admin,
    getUserPermissions: async () => ({ userId, role: "member", companyRole: "member", teamId: "own-team", permissions: fixedPermissionsForRole("member"), dataScope: "self", membershipStatus: "active" }),
  } as unknown as Parameters<typeof buildExportResponse>[1];
  for (const params of ["from=invalid", "from=2026-02-30", "from=2026-11-03&to=2026-11-01", "from=2026-11-01%29%2Cor%28id.neq.null"]) {
    assert.equal((await buildExportResponse(new NextRequest(`https://dydata.cc/api/export?${params}`), deps)).status, 400);
  }
  assert.equal(reads, 0);
  const response = await buildExportResponse(new NextRequest("https://dydata.cc/api/export?from=2026-11-01&to=2026-11-02&teamId=foreign-team&userId=foreign-user"), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal((await response.arrayBuffer()).byteLength > 0, true);
  assert.deepEqual(filters.find(([column]) => column === "user_id"), ["user_id", [userId]]);
});

test("填报记录：分页异常拒绝且不查询，正常请求固定为本人", async () => {
  const calls: Array<{ userId: string; page: number; pageSize: number }> = [];
  const deps = { createClient: async () => ownClient, loadDashboardActivityData: async (input: { userId: string; page: number; pageSize: number }) => { calls.push(input); return { history: [] }; } } as unknown as Parameters<typeof buildDashboardActivityResponse>[1];
  for (const params of ["page=-1", "pageSize=1000000000", "page=NaN", "pageSize=1.5", "page=1oops"]) {
    assert.equal((await buildDashboardActivityResponse(new NextRequest(`https://dydata.cc/api/dashboard/activity?${params}`), deps)).status, 400);
  }
  assert.equal(calls.length, 0);
  assert.equal((await buildDashboardActivityResponse(new NextRequest("https://dydata.cc/api/dashboard/activity?page=2&pageSize=30&userId=foreign-user"), deps)).status, 200);
  assert.equal(calls[0].userId, userId);
  assert.equal(calls[0].page, 2);
  assert.equal(calls[0].pageSize, 30);
});

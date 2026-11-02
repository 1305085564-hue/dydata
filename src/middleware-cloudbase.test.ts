import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession, type CloudBaseSession } from "@/lib/cloudbase/core";
import { middleware } from "./middleware";

const originalFetch = globalThis.fetch;

for (const status of ['archived', 'blocked', 'pending', 'missing', 'outage']) {
  test(`CloudBase middleware classifies ${status} without an RLS-filtered profile lookup`, async () => {
    const oldEnv = { backend: process.env.DYDATA_BACKEND, envId: process.env.CLOUDBASE_ENV_ID };
    process.env.DYDATA_BACKEND = 'cloudbase';
    process.env.CLOUDBASE_ENV_ID = 'env-test';
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path.endsWith('/user/me')) return Response.json({ sub: 'stable-uuid' });
      if (path.endsWith('/rpc/cloudbase_session_status')) return status === 'outage' ? Response.json({}, { status: 503 }) : Response.json(status);
      throw new Error('Unexpected profile lookup or refresh');
    }) as typeof fetch;
    try {
      const cookie = serializeCloudBaseSession(session('old'));
      const response = await middleware(new NextRequest('https://dydata.cc/api/admin/content/list', { headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=${cookie}` } }));
      assert.equal(response.status, status === 'archived' ? 403 : status === 'outage' ? 503 : 401);
      if (status === 'outage') assert.equal(response.headers.get('set-cookie'), null);
      else assert.match(response.headers.get('set-cookie') ?? '', /dydata-cloudbase-session=;/);
      assert.deepEqual(calls, ['/auth/v1/user/me', '/v1/rdb/rest/rpc/cloudbase_session_status']);
    } finally {
      globalThis.fetch = originalFetch;
      if (oldEnv.backend === undefined) delete process.env.DYDATA_BACKEND; else process.env.DYDATA_BACKEND = oldEnv.backend;
      if (oldEnv.envId === undefined) delete process.env.CLOUDBASE_ENV_ID; else process.env.CLOUDBASE_ENV_ID = oldEnv.envId;
    }
  });
}

function session(accessToken: string, refreshToken = "refresh-old"): CloudBaseSession {
  return { accessToken, refreshToken, expiresAt: Date.now() + 120_000, subject: "stable-uuid" };
}

for (const state of ['archived', 'blocked', 'active', 'outage']) {
  test(`Auth blocked plus trusted ${state} is only used to classify rejection`, async () => {
    const oldEnv = { backend: process.env.DYDATA_BACKEND, envId: process.env.CLOUDBASE_ENV_ID };
    process.env.DYDATA_BACKEND = 'cloudbase';
    process.env.CLOUDBASE_ENV_ID = 'env-test';
    const paths: string[] = [];
    globalThis.fetch = (async input => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path.endsWith('/user/me')) return Response.json({ error_code: 4013, error: 'user_blocked' }, { status: 400 });
      if (path.endsWith('/rpc/cloudbase_session_status')) return state === 'outage' ? Response.json({}, { status: 503 }) : Response.json(state);
      throw new Error('A blocked identity must never refresh');
    }) as typeof fetch;
    try {
      const value = serializeCloudBaseSession(session('offline-access'));
      const response = await middleware(new NextRequest('https://dydata.cc/api/admin/content/list', { headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=${value}` } }));
      assert.equal(response.status, state === 'archived' ? 403 : 401);
      assert.match(response.headers.get('set-cookie') ?? '', /dydata-cloudbase-session=;/);
      assert.deepEqual(paths, ['/auth/v1/user/me', '/v1/rdb/rest/rpc/cloudbase_session_status']);
    } finally {
      globalThis.fetch = originalFetch;
      if (oldEnv.backend === undefined) delete process.env.DYDATA_BACKEND; else process.env.DYDATA_BACKEND = oldEnv.backend;
      if (oldEnv.envId === undefined) delete process.env.CLOUDBASE_ENV_ID; else process.env.CLOUDBASE_ENV_ID = oldEnv.envId;
    }
  });
}

test("CloudBase middleware validates user/me, checks membership and persists rotated HttpOnly cookie", async () => {
  const oldBackend = process.env.DYDATA_BACKEND;
  const oldEnvId = process.env.CLOUDBASE_ENV_ID;
  const oldPublicEnvId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  process.env.DYDATA_BACKEND = "cloudbase";
  process.env.CLOUDBASE_ENV_ID = "env-test";
  process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID = "env-test";
  let userCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/auth/v1/user/me") {
      userCalls += 1;
      return userCalls === 1
        ? Response.json({ error_code: 401 }, { status: 401 })
        : Response.json({ sub: "stable-uuid", user_id: 9001 });
    }
    if (url.pathname === "/auth/v1/token") {
      return Response.json({ access_token: "access-new", refresh_token: "refresh-new", expires_in: 600, sub: "stable-uuid" });
    }
    if (url.pathname === "/v1/rdb/rest/rpc/cloudbase_session_status") {
      assert.equal(new Headers(input instanceof Request ? input.headers : init?.headers).get("authorization"), "Bearer access-new");
      return Response.json("active");
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  }) as typeof fetch;
  try {
    const encoded = serializeCloudBaseSession(session("access-old"));
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/user", { headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=${encoded}` } });
    const response = await middleware(request);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(userCalls, 2);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /dydata-cloudbase-session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(setCookie, /access-old|refresh-old/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldBackend === undefined) delete process.env.DYDATA_BACKEND; else process.env.DYDATA_BACKEND = oldBackend;
    if (oldEnvId === undefined) delete process.env.CLOUDBASE_ENV_ID; else process.env.CLOUDBASE_ENV_ID = oldEnvId;
    if (oldPublicEnvId === undefined) delete process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID; else process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID = oldPublicEnvId;
  }
});

test("CloudBase session handler consumes the already classified protected route", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function handleCloudBaseSession"), source.indexOf("export async function middleware"));
  assert.match(handler, /isProtectedAppRoute: boolean/);
  assert.doesNotMatch(handler, /["']\/dashboard["']/);
  assert.match(source, /handleCloudBaseSession\(request, \{ pathname, isApiRoute, hasAuthCookie, isProtectedAppRoute \}\)/);
});

// Exercise the actual middleware for every statically matched app root; adding a
// matcher without classifying it must fail this matrix instead of silently passing.
test("all protected matcher roots share CloudBase checks for root and child paths", async () => {
  const { config } = await import("./middleware");
  const roots = config.matcher.filter(path => path.endsWith("/:path*") && path !== "/api/:path*").map(path => path.replace("/:path*", ""));
  assert.equal(roots.length, 5);
  const keys = ["DYDATA_BACKEND", "NEXT_PUBLIC_DYDATA_BACKEND", "CLOUDBASE_ENV_ID"];
  const previous = keys.map(key => process.env[key]);
  process.env.DYDATA_BACKEND = "cloudbase";
  process.env.NEXT_PUBLIC_DYDATA_BACKEND = "cloudbase";
  process.env.CLOUDBASE_ENV_ID = "env-test";
  try {
    let requestIndex = 0;
    for (const root of roots) for (const path of [root, `${root}/nested`]) {
      for (const state of ["missing", "invalid", "active", "archived"] as const) {
        const calls: string[] = [];
        globalThis.fetch = (async input => {
          const pathname = new URL(String(input)).pathname;
          calls.push(pathname);
          if (pathname === "/auth/v1/user/me") return Response.json({ sub: "stable-uuid" });
          if (pathname.endsWith("/rpc/cloudbase_session_status")) return Response.json(state);
          throw new Error("Unexpected middleware request");
        }) as typeof fetch;
        const cookie = state === "missing" ? undefined : `${CLOUD_BASE_SESSION_COOKIE}=${state === "invalid" ? "not-a-session" : serializeCloudBaseSession(session("access"))}`;
        const headers: Record<string, string> = { "x-forwarded-for": `127.0.1.${++requestIndex}` };
        if (cookie) headers.cookie = cookie;
        const response = await middleware(new NextRequest(`https://dydata.cc${path}`, { headers }));
        if (state === "active") assert.equal(response.headers.get("x-middleware-next"), "1", path);
        else {
          assert.equal(response.status, 307, `${path}/${state}`);
          const location = new URL(response.headers.get("location")!);
          assert.equal(location.pathname, "/login");
          assert.equal(location.searchParams.get("next"), path);
          if (state === "archived") assert.equal(location.searchParams.get("archived"), "1");
        }
        assert.equal(calls.length, ["active", "archived"].includes(state) ? 2 : 0);
      }
    }
    globalThis.fetch = async () => { throw new Error("Public paths must not request authentication"); };
    for (const path of ["/login", "/register", "/forgot-password", "/dashboard-extra", "/admin-extra", "/api/health"]) {
      const response = await middleware(new NextRequest(`https://dydata.cc${path}`, { headers: { "x-forwarded-for": `127.0.1.${++requestIndex}` } }));
      assert.equal(response.headers.get("x-middleware-next"), "1", path);
    }
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});

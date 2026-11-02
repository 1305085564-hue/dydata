import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { POST as signin } from "./auth/signin/route";
import { POST as refresh } from "./auth/refresh/route";
import { POST as signout } from "./auth/signout/route";
import { GET as getUser } from "./auth/user/route";
import { CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession } from "@/lib/cloudbase/core";
import { isTrustedCloudBaseWrite } from "./_shared";

const oldFetch = globalThis.fetch;

for (const [name, handler] of [['signin', signin], ['refresh', refresh], ['user', getUser]] as const) {
  for (const state of ['archived', 'pending', 'outage']) {
    test(`${name} preserves trusted ${state} classification and only clears invalid cookies`, async () => {
      process.env.CLOUDBASE_ENV_ID = 'env-test';
      globalThis.fetch = (async input => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/user/me')) return Response.json({ sub: 'subject' });
        if (path.endsWith('/rpc/cloudbase_session_status')) return state === 'outage' ? Response.json({}, { status: 503 }) : Response.json(state);
        return Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 300, sub: 'subject' });
      }) as typeof fetch;
      try {
        const cookie = serializeCloudBaseSession({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() + 120000, subject: 'subject' });
        const request = new NextRequest(`https://dydata.cc/api/cloudbase/auth/${name}`, {
          method: name === 'user' ? 'GET' : 'POST',
          headers: { origin: 'https://dydata.cc', 'content-type': 'application/json', cookie: `${CLOUD_BASE_SESSION_COOKIE}=${cookie}` },
          ...(name === 'signin' ? { body: JSON.stringify({ username: 'synthetic@example.invalid', password: 'unused' }) } : {}),
        });
        const response = await handler(request);
        assert.equal(response.status, state === 'outage' ? 503 : 401);
        const body = await response.json();
        if (state === 'outage') assert.equal(response.headers.get('set-cookie'), null);
        else {
          assert.equal(body.code, `account_${state}`);
          assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
        }
        assert.doesNotMatch(JSON.stringify(body), /private-access|private-refresh|old-access|old-refresh/);
      } finally { globalThis.fetch = oldFetch; }
    });
  }
}

test("CloudBase API writes reject cross-site origins before contacting auth", async () => {
  let called = false;
  globalThis.fetch = (async () => { called = true; return Response.json({}); }) as typeof fetch;
  try {
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/signin", {
      method: "POST", headers: { origin: "https://attacker.invalid", "content-type": "application/json" }, body: JSON.stringify({ username: "x", password: "x" }),
    });
    const response = await signin(request);
    assert.equal(response.status, 403);
    assert.equal(called, false);
    assert.equal(isTrustedCloudBaseWrite(request), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("wrong password stays an explicit failed sign-in without setting a session cookie", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  globalThis.fetch = (async () => Response.json({ error_code: 401 }, { status: 401 })) as typeof fetch;
  try {
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/signin", {
      method: "POST", headers: { origin: "https://dydata.cc", "content-type": "application/json" }, body: JSON.stringify({ username: "person@example.com", password: "wrong" }),
    });
    const response = await signin(request);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally { globalThis.fetch = oldFetch; }
});

test("same-origin sign-in preserves the existing archived-account message for user_blocked", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  globalThis.fetch = (async () => Response.json({
    error_code: 4013, error: "user_blocked", error_description: "User is blocked.",
  }, { status: 400 })) as typeof fetch;
  try {
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/signin", {
      method: "POST", headers: { origin: "https://dydata.cc", "content-type": "application/json" }, body: JSON.stringify({ username: "person@example.com", password: "irrelevant" }),
    });
    const response = await signin(request);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "账号已归档，请联系 owner 恢复", code: "user_blocked" });
    assert.equal(response.headers.get("set-cookie"), null);
  } finally { globalThis.fetch = oldFetch; }
});

test("user verification preserves the archived-account message and does not refresh a blocked user", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const paths: string[] = [];
  globalThis.fetch = (async (input) => {
    paths.push(new URL(String(input)).pathname);
    return Response.json({ error_code: 4013, error: "user_blocked", error_description: "User is blocked." }, { status: 400 });
  }) as typeof fetch;
  try {
    const cookie = serializeCloudBaseSession({
      accessToken: "blocked-access", refreshToken: "blocked-refresh", expiresAt: Date.now() + 120_000, subject: "subject",
    });
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/user", {
      headers: { cookie: `${CLOUD_BASE_SESSION_COOKIE}=${cookie}` },
    });
    const response = await getUser(request);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "账号已归档，请联系 owner 恢复", code: "blocked" });
    assert.deepEqual(paths, ["/auth/v1/user/me", "/v1/rdb/rest/rpc/cloudbase_session_status"]);
  } finally { globalThis.fetch = oldFetch; }
});

test("temporary refresh outage preserves the HttpOnly session cookie", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
  try {
    const cookie = serializeCloudBaseSession({ accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 0, subject: "subject" });
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/refresh", {
      method: "POST", headers: { origin: "https://dydata.cc", cookie: `${CLOUD_BASE_SESSION_COOKIE}=${cookie}` },
    });
    const response = await refresh(request);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally { globalThis.fetch = oldFetch; }
});

test("same-origin sign-in returns user only in JSON and logout clears the HttpOnly cookie", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  let currentPath = "";
  globalThis.fetch = (async (input, init) => {
    currentPath = new URL(String(input)).pathname;
    if (currentPath === "/auth/v1/signin") return Response.json({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 300, sub: "subject" });
    if (currentPath === "/auth/v1/user/me") return Response.json({ sub: "subject", email: "person@example.com" });
    if (currentPath === "/v1/rdb/rest/rpc/cloudbase_session_status") return Response.json("active");
    if (currentPath === "/auth/v1/user/signout") {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer private-access");
      return Response.json({});
    }
    throw new Error(`Unexpected path ${currentPath}`);
  }) as typeof fetch;
  try {
    const request = new NextRequest("https://dydata.cc/api/cloudbase/auth/signin", {
      method: "POST", headers: { origin: "https://dydata.cc", "content-type": "application/json" }, body: JSON.stringify({ username: "person@example.com", password: "secret" }),
    });
    const loginResponse = await signin(request);
    assert.equal(loginResponse.status, 200);
    assert.deepEqual(await loginResponse.json(), { user: { id: "subject", email: "person@example.com", user_metadata: {}, app_metadata: {}, aud: "authenticated", role: "authenticated" } });
    assert.doesNotMatch(loginResponse.headers.get("set-cookie") ?? "", /secret/);
    assert.match(loginResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);

    const cookieValue = serializeCloudBaseSession({ accessToken: "private-access", refreshToken: "private-refresh", expiresAt: 1000, subject: "subject" });
    const logoutRequest = new NextRequest("https://dydata.cc/api/cloudbase/auth/signout", {
      method: "POST", headers: { origin: "https://dydata.cc", cookie: `${CLOUD_BASE_SESSION_COOKIE}=${cookieValue}` },
    });
    const logoutResponse = await signout(logoutRequest);
    assert.equal(logoutResponse.status, 200);
    assert.deepEqual(await logoutResponse.json(), { ok: true });
    assert.equal(currentPath, "/auth/v1/user/signout");
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Max-Age=0/i);
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /shot_grant=;/);
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Path=\/api\/submission-screenshots/);
  } finally { globalThis.fetch = oldFetch; }
});

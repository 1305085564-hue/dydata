import test from "node:test";
import assert from "node:assert/strict";

import { createCloudBaseBrowserAuth, createCloudBaseServerAuth } from "./auth-client";
import { CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession } from "./core";

const oldFetch = globalThis.fetch;

for (const status of ['active', 'archived', 'blocked', 'pending', 'missing', 'outage']) {
  test(`raw JWT getUser respects trusted account status ${status}`, async () => {
    process.env.CLOUDBASE_ENV_ID = 'env-test';
    const calls: string[] = [];
    globalThis.fetch = (async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer raw-jwt');
      return path.endsWith('/user/me') ? Response.json({ sub: 'subject' }) : status === 'outage' ? Response.json({}, { status: 503 }) : Response.json(status);
    }) as typeof fetch;
    try {
      const auth = createCloudBaseServerAuth({ get: () => undefined, set: () => { throw new Error('raw JWT must not write cookies'); } }, false);
      const result = await auth.getUser('raw-jwt');
      if (status === 'active') {
        assert.equal(result.data.user?.id, 'subject');
        assert.equal(result.error, null);
      } else {
        assert.equal(result.data.user, null);
        assert.equal(result.error?.status, status === 'outage' ? 503 : 401);
        assert.equal(result.error?.code, status === 'outage' ? 'cloudbase_session_status_unavailable' : `account_${status}`);
      }
      assert.deepEqual(calls, ['/auth/v1/user/me', '/v1/rdb/rest/rpc/cloudbase_session_status']);
    } finally { globalThis.fetch = oldFetch; }
  });
}

test("server logout calls the CloudBase signout endpoint and clears HttpOnly session cookie", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const values = new Map<string, string>();
  values.set(CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession({ accessToken: "access", refreshToken: "refresh", expiresAt: 10, subject: "u" }));
  let headers: Headers | undefined;
  globalThis.fetch = (async (_url, init) => {
    headers = new Headers(init?.headers);
    return Response.json({});
  }) as typeof fetch;
  try {
    const cookieStore = {
      get(name: string) { const value = values.get(name); return value ? { value } : undefined; },
      set(name: string, value: string) { values.set(name, value); },
    };
    const auth = createCloudBaseServerAuth(cookieStore, true);
    const result = await auth.signOut();
    assert.equal(result.error, null);
    assert.match(headers?.get("authorization") ?? "", /^Bearer access$/);
    assert.equal(values.get(CLOUD_BASE_SESSION_COOKIE), "");
  } finally { globalThis.fetch = oldFetch; }
});

test("browser login only returns verified user and never returns tokens", async () => {
  let path = "";
  globalThis.fetch = (async (input, init) => {
    path = String(input);
    assert.equal(init?.credentials, "same-origin");
    return Response.json({ user: { id: "subject" }, access_token: "must-not-return", refresh_token: "must-not-return" });
  }) as typeof fetch;
  try {
    const auth = createCloudBaseBrowserAuth();
    const result = await auth.signInWithPassword({ email: "a@example.com", password: "secret" });
    assert.equal(path, "/api/cloudbase/auth/signin");
    assert.deepEqual(result.data, { user: { id: "subject" }, session: null });
    assert.doesNotMatch(JSON.stringify(result), /must-not-return|secret/);
  } finally { globalThis.fetch = oldFetch; }
});

test("read-only Server Component cookies do not cause false logout on getUser", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const value = serializeCloudBaseSession({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 120_000, subject: "subject", deviceId: "f0cba501-2026-4111-a001-000000000001" });
  let writes = 0;
  globalThis.fetch = (async (input) => String(input).endsWith("/rpc/cloudbase_session_status") ? Response.json("active") : Response.json({ sub: "subject", password: "never exposed" })) as typeof fetch;
  try {
    const auth = createCloudBaseServerAuth({
      get: () => ({ value }),
      set() { writes += 1; throw new Error("read-only cookie store"); },
    }, false);
    const result = await auth.getUser();
    assert.equal(result.data.user?.id, "subject");
    assert.equal(result.error, null);
    assert.equal("password" in (result.data.user ?? {}), false);
    assert.equal(writes, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test("successful refresh remains authenticated when a read-only cookie store cannot persist it", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const value = serializeCloudBaseSession({ accessToken: "expired", refreshToken: "refresh", expiresAt: 0, subject: "subject" });
  let userCalls = 0;
  let refreshCalls = 0;
  let writes = 0;
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rpc/cloudbase_session_status")) return Response.json("active");
    if (url.pathname.endsWith("/user/me")) {
      userCalls += 1;
      return Response.json({ sub: "subject" });
    }
    refreshCalls += 1;
    return Response.json({ access_token: "renewed", refresh_token: "rotated", expires_in: 600, sub: "subject" });
  }) as typeof fetch;
  try {
    const auth = createCloudBaseServerAuth({
      get: () => ({ value }),
      set() { writes += 1; throw new Error("read-only cookie store"); },
    }, false);
    const result = await auth.getUser();
    assert.equal(result.data.user?.id, "subject");
    assert.equal(result.error, null);
    assert.equal(writes, 1);
    assert.equal(refreshCalls, 1);
    assert.equal(userCalls, 1);
  } finally { globalThis.fetch = oldFetch; }
});

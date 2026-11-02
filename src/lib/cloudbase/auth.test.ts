import test from "node:test";
import assert from "node:assert/strict";

import { getLoginErrorMessage } from "@/lib/auth-password";
import { refreshCloudBaseSession, signInCloudBase, signOutCloudBase, validateCloudBaseSession, verifyCloudBaseAccessToken } from "./auth";

function json(value: unknown, status = 200) { return Response.json(value, { status }); }

test("each login owns its device marker and refresh/signout preserve that marker", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const deviceCalls: Array<{ path: string; device: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    deviceCalls.push({ path, device: new Headers(init?.headers).get("x-device-id") });
    if (path.endsWith("/user/me")) return json({ sub: "subject" });
    if (path.endsWith("/rpc/cloudbase_session_status")) return json("active");
    return json({ access_token: "access", refresh_token: "refresh", expires_in: 3600, sub: "subject" });
  };
  const a = (await signInCloudBase("synthetic", "unused", fetcher)).session;
  const b = (await signInCloudBase("synthetic", "unused", fetcher)).session;
  assert.match(a.deviceId!, /^[a-f0-9-]{36}$/);
  assert.notEqual(a.deviceId, b.deviceId);
  const refreshed = (await refreshCloudBaseSession(a, fetcher)).session;
  assert.equal(refreshed.deviceId, a.deviceId);
  await signOutCloudBase(refreshed, fetcher);
  assert.deepEqual(deviceCalls.filter(c => c.path.endsWith("/signin") || c.path.endsWith("/token") || c.path.endsWith("/signout")).map(c => c.device), [a.deviceId, b.deviceId, a.deviceId, a.deviceId]);
});

for (const operation of ['signin', 'refresh', 'validate', 'raw-jwt'] as const) {
  for (const state of ['archived', 'blocked', 'active', 'outage']) {
    test(`${operation}: user/me blocked plus ${state} status stays denied without a refresh retry`, async () => {
      process.env.CLOUDBASE_ENV_ID = 'env-test';
      const calls: string[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        if (path.endsWith('/user/me')) return json({ error_code: 4013, error: 'user_blocked' }, 400);
        if (path.endsWith('/rpc/cloudbase_session_status')) {
          assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access');
          assert.equal(init?.method, 'POST');
          assert.deepEqual(JSON.parse(String(init?.body)), {});
          return state === 'outage' ? json({}, 503) : json(state);
        }
        return json({ access_token: 'access', refresh_token: 'rotated', expires_in: 300, sub: 'subject' });
      };
      const previous = { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 120000, subject: 'subject' };
      const action = operation === 'signin' ? () => signInCloudBase('synthetic@example.invalid', 'unused', fetcher)
        : operation === 'refresh' ? () => refreshCloudBaseSession(previous, fetcher)
          : operation === 'raw-jwt' ? () => verifyCloudBaseAccessToken('access', fetcher)
            : () => validateCloudBaseSession(previous, fetcher);
      await assert.rejects(action, (error: Error & { status?: number; code?: string }) =>
        error.status === 401 && error.code === (state === 'archived' ? 'account_archived' : 'user_blocked'));
      assert.equal(calls.filter(path => path.endsWith('/token')).length, operation === 'refresh' ? 1 : 0);
      assert.deepEqual(calls.slice(-2), ['/auth/v1/user/me', '/v1/rdb/rest/rpc/cloudbase_session_status']);
    });
  }
}

for (const state of ['archived', 'blocked', 'pending', 'missing']) {
  test(`a valid old token does not authenticate a ${state} account`, async () => {
    process.env.CLOUDBASE_ENV_ID = 'env-test';
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push(String(input));
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer old');
      return String(input).endsWith('/rpc/cloudbase_session_status') ? json(state) : json({sub:'stable-uuid'});
    };
    await assert.rejects(() => validateCloudBaseSession({accessToken:'old',refreshToken:'old-refresh',expiresAt:Date.now()+120000,subject:'stable-uuid'},fetcher),
      (error: Error & {status?: number; code?: string}) => error.status === 401 && error.code === `account_${state}`);
    assert.equal(calls.length, 2, 'inactive accounts must not be retried with a refresh token');
  });
}
test('a database status outage stays unavailable instead of becoming permission denial', async()=> {
  process.env.CLOUDBASE_ENV_ID = 'env-test';
  await assert.rejects(() => validateCloudBaseSession({accessToken:'old',refreshToken:'refresh',expiresAt:Date.now()+120000,subject:'stable-uuid'}, async input =>
    String(input).endsWith('/rpc/cloudbase_session_status') ? json({},503) : json({sub:'stable-uuid'})),
    (error: Error & {status?: number})=>error.status===503);
});

test('active status is requested only after user/me subject confirmation, with the same JWT and no subject override', async () => {
  process.env.CLOUDBASE_ENV_ID = 'env-test';
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer old');
    if (path.endsWith('/user/me')) return json({ sub: 'stable-uuid' });
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {});
    return json('active');
  };
  const result = await validateCloudBaseSession({accessToken:'old',refreshToken:'refresh',expiresAt:Date.now()+120000,subject:'stable-uuid'}, fetcher);
  assert.equal(result.user.id, 'stable-uuid');
  assert.deepEqual(calls, ['/auth/v1/user/me', '/v1/rdb/rest/rpc/cloudbase_session_status']);
  calls.length = 0;
  await assert.rejects(() => validateCloudBaseSession({accessToken:'old',refreshToken:'refresh',expiresAt:Date.now()+120000,subject:'forged-subject'}, fetcher),
    (error: Error & { code?: string }) => error.code === 'subject_mismatch');
  assert.deepEqual(calls, ['/auth/v1/user/me']);
});

for (const operation of ['signin', 'refresh'] as const) {
  test(`${operation} denies a token whose trusted account status is archived`, async () => {
    process.env.CLOUDBASE_ENV_ID = 'env-test';
    const fetcher: typeof fetch = async input => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/user/me')) return json({ sub: 'stable-uuid' });
      if (path.endsWith('/rpc/cloudbase_session_status')) return json('archived');
      return json({ access_token: 'new', refresh_token: 'rotated', expires_in: 300, sub: 'stable-uuid' });
    };
    const action = operation === 'signin'
      ? () => signInCloudBase('synthetic@example.invalid', 'unused', fetcher)
      : () => refreshCloudBaseSession({accessToken:'old',refreshToken:'refresh',expiresAt:0,subject:'stable-uuid'}, fetcher);
    await assert.rejects(action, (error: Error & { status?: number; code?: string }) => error.status === 401 && error.code === 'account_archived');
  });
}

test("login rejects wrong password without creating a session", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  await assert.rejects(
    () => signInCloudBase("user@example.com", "wrong", async () => json({ error_code: 1 }, 401)),
    (error: Error & { status?: number }) => error.status === 401 && getLoginErrorMessage(error.message) === "邮箱或密码不正确",
  );
});

test("login maps subject and validates it against user/me before returning session", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/rpc/cloudbase_session_status")) return json("active");
    calls += 1;
    if (calls === 1) {
      assert.deepEqual(JSON.parse(String(init?.body)), { username: "person@example.com", password: "password" });
      return json({ access_token: "a", refresh_token: "r", expires_in: 300, sub: "stable-uuid" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer a");
    return json({ sub: "stable-uuid", user_id: 1003, email: "person@example.com" });
  };
  const result = await signInCloudBase("person@example.com", "password", fetcher);
  assert.equal(result.user.id, "stable-uuid");
  assert.equal(result.session.subject, "stable-uuid");
  assert.equal(calls, 2);
});

test("refresh rotates tokens and still verifies user/me", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/rpc/cloudbase_session_status")) return json("active");
    calls += 1;
    if (calls === 1) {
      assert.deepEqual(JSON.parse(String(init?.body)), { grant_type: "refresh_token", refresh_token: "old-refresh" });
      return json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 600, sub: "stable-uuid" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer new-access");
    return json({ sub: "stable-uuid", user_id: 1003 });
  };
  const result = await refreshCloudBaseSession({ accessToken: "old", refreshToken: "old-refresh", expiresAt: 0, subject: "stable-uuid" }, fetcher);
  assert.equal(result.session.refreshToken, "new-refresh");
  assert.equal(result.user.id, "stable-uuid");
});

test("invalid refresh grant becomes an expired session, distinct from a service outage", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const previous = { accessToken: "old", refreshToken: "revoked", expiresAt: 0, subject: "stable-uuid" };
  await assert.rejects(
    () => refreshCloudBaseSession(previous, async () => json({ error_code: 4001 }, 400)),
    (error: Error & { status?: number }) => error.status === 401,
  );
  await assert.rejects(
    () => refreshCloudBaseSession(previous, async () => json({}, 503)),
    (error: Error & { status?: number }) => error.status === 503,
  );
});

test("get user refreshes reactively when a still-dated token is rejected with 401", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/rpc/cloudbase_session_status")) return json("active");
    calls += 1;
    if (calls === 1) return json({ error_code: 401 }, 401);
    if (calls === 2) return json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 300, sub: "stable-uuid" });
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer new-access");
    return json({ sub: "stable-uuid" });
  };
  const result = await validateCloudBaseSession({ accessToken: "old", refreshToken: "refresh", expiresAt: Date.now() + 120_000, subject: "stable-uuid" }, fetcher);
  assert.equal(result.user.id, "stable-uuid");
  assert.equal(result.session?.accessToken, "new-access");
  assert.equal(calls, 3);
});

test("token within 30 seconds of expiry refreshes before calling user/me", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname.endsWith("/rpc/cloudbase_session_status")) return json("active");
    if (url.pathname.endsWith("/token")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { grant_type: "refresh_token", refresh_token: "old-refresh" });
      return json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 600, sub: "stable-uuid" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer new-access");
    return json({ sub: "stable-uuid" });
  };
  const result = await validateCloudBaseSession({
    accessToken: "old-access", refreshToken: "old-refresh", expiresAt: Date.now() + 20_000, subject: "stable-uuid",
  }, fetcher);
  assert.deepEqual(calls, ["/auth/v1/token", "/auth/v1/user/me", "/v1/rdb/rest/rpc/cloudbase_session_status"]);
  assert.equal(result.user.id, "stable-uuid");
  assert.equal(result.session.refreshToken, "new-refresh");
});

test("real code 9 expired-token reply refreshes, then verifies the subject", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname.endsWith("/rpc/cloudbase_session_status")) return json("active");
    if (url.pathname.endsWith("/user/me") && calls.length === 1) {
      return json({
        error: "failed_precondition", error_code: 9,
        error_description: "token expiry at: 2026-11-01T04:38:13+08:00",
      }, 400);
    }
    if (url.pathname.endsWith("/token")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { grant_type: "refresh_token", refresh_token: "refresh" });
      return json({ access_token: "new-access", refresh_token: "rotated", expires_in: 600, sub: "stable-uuid" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer new-access");
    return json({ sub: "stable-uuid" });
  };
  const result = await validateCloudBaseSession({
    accessToken: "expired-access", refreshToken: "refresh", expiresAt: Date.now() + 120_000, subject: "stable-uuid",
  }, fetcher);
  assert.deepEqual(calls, ["/auth/v1/user/me", "/auth/v1/token", "/auth/v1/user/me", "/v1/rdb/rest/rpc/cloudbase_session_status"]);
  assert.equal(result.user.id, "stable-uuid");
  assert.equal(result.session.refreshToken, "rotated");
});

test("blocked user_me response is not retried with a refresh token", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const paths: string[] = [];
  await assert.rejects(
    () => validateCloudBaseSession({
      accessToken: "blocked-token", refreshToken: "refresh", expiresAt: Date.now() + 120_000, subject: "stable-uuid",
    }, async (input) => {
      paths.push(new URL(String(input)).pathname);
      return json({ error_code: 4013, error: "user_blocked", error_description: "User is blocked." }, 400);
    }),
    (error: Error & { status?: number; code?: string }) => error.status === 401 && error.code === "user_blocked" && error.message === "账号已归档，请联系 owner 恢复",
  );
  assert.deepEqual(paths, ["/auth/v1/user/me", "/v1/rdb/rest/rpc/cloudbase_session_status"]);
});

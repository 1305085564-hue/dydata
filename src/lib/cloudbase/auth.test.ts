import test from "node:test";
import assert from "node:assert/strict";

import { getLoginErrorMessage } from "@/lib/auth-password";
import { refreshCloudBaseSession, signInCloudBase, validateCloudBaseSession } from "./auth";

function json(value: unknown, status = 200) { return Response.json(value, { status }); }

test("login rejects wrong password without creating a session", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  await assert.rejects(
    () => signInCloudBase("user@example.com", "wrong", async () => json({ error_code: 1 }, 401)),
    (error: Error & { status?: number }) => error.status === 401 && getLoginErrorMessage(error.message) === "邮箱或密码不正确",
  );
});

test("login maps subject and validates it against user/me before returning session", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
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
  const fetcher: typeof fetch = async (_input, init) => {
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
  const fetcher: typeof fetch = async (_input, init) => {
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
  assert.deepEqual(calls, ["/auth/v1/token", "/auth/v1/user/me"]);
  assert.equal(result.user.id, "stable-uuid");
  assert.equal(result.session.refreshToken, "new-refresh");
});

test("real code 9 expired-token reply refreshes, then verifies the subject", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
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
  assert.deepEqual(calls, ["/auth/v1/user/me", "/auth/v1/token", "/auth/v1/user/me"]);
  assert.equal(result.user.id, "stable-uuid");
  assert.equal(result.session.refreshToken, "rotated");
});

test("blocked user_me response is not retried with a refresh token", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  let calls = 0;
  await assert.rejects(
    () => validateCloudBaseSession({
      accessToken: "blocked-token", refreshToken: "refresh", expiresAt: Date.now() + 120_000, subject: "stable-uuid",
    }, async () => {
      calls += 1;
      return json({ error_code: 4013, error: "user_blocked", error_description: "User is blocked." }, 400);
    }),
    (error: Error & { status?: number; code?: string }) => error.status === 401 && error.code === "user_blocked" && error.message === "账号已归档，请联系 owner 恢复",
  );
  assert.equal(calls, 1);
});

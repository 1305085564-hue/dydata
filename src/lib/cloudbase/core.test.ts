import test from "node:test";
import assert from "node:assert/strict";

import {
  CLOUD_BASE_SESSION_COOKIE,
  cloudBaseAuthRequest,
  cloudBaseCookieOptions,
  parseCloudBaseSession,
  serializeCloudBaseSession,
  mapCloudBaseUser,
  makeCloudBaseSession,
  cloudBaseRestUrl,
  isCloudBaseBackend,
} from "./core";

test("backend is opt-in and builds CloudBase endpoints without exposing credentials", () => {
  const old = process.env.DYDATA_BACKEND;
  process.env.DYDATA_BACKEND = "supabase";
  assert.equal(isCloudBaseBackend(), false);
  process.env.DYDATA_BACKEND = "cloudbase";
  assert.equal(isCloudBaseBackend(), true);
  process.env.CLOUDBASE_ENV_ID = "env-test";
  assert.equal(cloudBaseRestUrl("/rest/v1/profiles?select=id"), "https://env-test.api.tcloudbasegateway.com/v1/rdb/rest/profiles?select=id");
  if (old === undefined) delete process.env.DYDATA_BACKEND;
  else process.env.DYDATA_BACKEND = old;
  delete process.env.CLOUDBASE_ENV_ID;
});

test("session stores opaque tokens privately and cookie lifetime follows keep logged in", () => {
  const session = makeCloudBaseSession({ access_token: "a", refresh_token: "r", expires_in: 120, sub: "user-1" });
  assert.deepEqual(session, { accessToken: "a", refreshToken: "r", expiresAt: session.expiresAt, subject: "user-1" });
  assert.deepEqual(parseCloudBaseSession(serializeCloudBaseSession(session)), session);
  assert.equal(CLOUD_BASE_SESSION_COOKIE, "dydata-cloudbase-session");
  assert.equal(cloudBaseCookieOptions(true, false).maxAge, 30 * 24 * 60 * 60);
  assert.equal("maxAge" in cloudBaseCookieOptions(false, false), false);
  assert.equal(cloudBaseCookieOptions(true, true).secure, true);
});

test("CloudBase user identity is the stable sub, never user_id", () => {
  assert.deepEqual(mapCloudBaseUser({ sub: "original-uuid", user_id: 9981, email: "a@example.com", name: "A" }), {
    id: "original-uuid", email: "a@example.com", user_metadata: { name: "A" }, app_metadata: {}, aud: "authenticated", role: "authenticated",
  });
  assert.throws(() => mapCloudBaseUser({ user_id: 9981 }), /subject/i);
});

test("auth request sends only the requested bearer and strips tokens from public errors", async () => {
  const oldEnvId = process.env.CLOUDBASE_ENV_ID;
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const request: { url?: string; authorization?: string; body?: string } = {};
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    request.url = String(input);
    request.authorization = new Headers(init?.headers).get("authorization") ?? undefined;
    request.body = typeof init?.body === "string" ? init.body : undefined;
    return Response.json({ access_token: "secret-token", sub: "u" });
  };
  await cloudBaseAuthRequest("/auth/v1/signin", { method: "POST", body: { username: "a", password: "secret" }, fetcher });
  assert.match(request.url ?? "", /\/auth\/v1\/signin$/);
  assert.equal(request.authorization, undefined);
  assert.equal(request.body, JSON.stringify({ username: "a", password: "secret" }));

  await assert.rejects(() => cloudBaseAuthRequest("/auth/v1/user/me", {
    token: "private-jwt", fetcher: async () => Response.json({ error: "token rejected", access_token: "must-not-leak" }, { status: 401 }),
  }), (error: Error) => !error.message.includes("private-jwt") && !error.message.includes("must-not-leak"));
  if (oldEnvId === undefined) delete process.env.CLOUDBASE_ENV_ID;
  else process.env.CLOUDBASE_ENV_ID = oldEnvId;
});

test("only documented expired-user and invalid-password replies normalize to authentication 401", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  await assert.rejects(() => cloudBaseAuthRequest("/auth/v1/user/me", {
    token: "expired",
    fetcher: async () => Response.json({
      error: "failed_precondition",
      error_code: 9,
      error_description: "token expiry at: 2026-11-01T04:38:13+08:00",
    }, { status: 400 }),
  }), (error: Error & { status?: number }) => error.status === 401);

  await assert.rejects(() => cloudBaseAuthRequest("/auth/v1/user/me", {
    token: "valid",
    fetcher: async () => Response.json({ error: "failed_precondition", error_code: 9, error_description: "permission check failed" }, { status: 400 }),
  }), (error: Error & { status?: number }) => error.status === 400);

  await assert.rejects(() => cloudBaseAuthRequest("/auth/v1/signin", {
    method: "POST", body: { username: "person@example.com", password: "wrong" },
    fetcher: async () => Response.json({ error_code: 4043, error: "invalid_username_or_password", error_description: "Username or password incorrect." }, { status: 400 }),
  }), (error: Error & { status?: number }) => error.status === 401);

  await assert.rejects(() => cloudBaseAuthRequest("/auth/v1/token", {
    method: "POST", body: { grant_type: "refresh_token", refresh_token: "bad" },
    fetcher: async () => Response.json({ error_code: 9, error_description: "token expiry at: now" }, { status: 400 }),
  }), (error: Error & { status?: number }) => error.status === 400);

  const archivedMessage = "账号已归档，请联系 owner 恢复";
  for (const path of ["/auth/v1/signin", "/auth/v1/user/me"]) {
    await assert.rejects(() => cloudBaseAuthRequest(path, {
      method: path.endsWith("signin") ? "POST" : "GET",
      body: path.endsWith("signin") ? { username: "person@example.com", password: "password" } : undefined,
      token: path.endsWith("signin") ? undefined : "blocked-token",
      fetcher: async () => Response.json({ error_code: 4013, error: "user_blocked", error_description: "User is blocked." }, { status: 400 }),
    }), (error: Error & { status?: number; code?: string }) => error.status === 401 && error.code === "user_blocked" && error.message === archivedMessage);
  }
});

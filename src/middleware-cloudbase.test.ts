import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession, type CloudBaseSession } from "@/lib/cloudbase/core";
import { middleware } from "./middleware";

const originalFetch = globalThis.fetch;

function session(accessToken: string, refreshToken = "refresh-old"): CloudBaseSession {
  return { accessToken, refreshToken, expiresAt: Date.now() + 120_000, subject: "stable-uuid" };
}

test("CloudBase middleware validates user/me, checks membership and persists rotated HttpOnly cookie", async () => {
  const oldBackend = process.env.DYDATA_BACKEND;
  const oldEnvId = process.env.CLOUDBASE_ENV_ID;
  const oldPublicEnvId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  process.env.DYDATA_BACKEND = "cloudbase";
  process.env.CLOUDBASE_ENV_ID = "env-test";
  process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID = "env-test";
  let userCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
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
    if (url.pathname === "/v1/rdb/rest/profiles") {
      assert.equal(new Headers(input instanceof Request ? input.headers : undefined).get("authorization"), "Bearer access-new");
      return Response.json([{ membership_status: "active" }]);
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

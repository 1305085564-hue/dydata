import test from "node:test";
import assert from "node:assert/strict";

import { reviewExemptionRequestAtomically } from "@/lib/exemption-review";
import { createCloudBaseDataClient, createCloudBaseFetch } from "./data-client";

test("user server data client forwards only the CloudBase user JWT", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  let captured: Request | undefined;
  const fetcher = createCloudBaseFetch({
    role: "user",
    userToken: "cloudbase-user-jwt",
    fetcher: async (input, init) => { captured = new Request(input, init); return Response.json({ ok: true }); },
  });
  await fetcher("https://adapter.invalid/rest/v1/profiles?select=id", {
    headers: { authorization: "Bearer caller-controlled-token", apikey: "supabase-key" },
  });
  assert.equal(new URL(captured!.url).pathname, "/v1/rdb/rest/profiles");
  assert.equal(new URL(captured!.url).search, "?select=id");
  assert.equal(captured!.headers.get("authorization"), "Bearer cloudbase-user-jwt");
  assert.equal(captured!.headers.get("apikey"), null);

  process.env.CLOUDBASE_SERVICE_API_KEY = "must-not-fallback";
  await assert.rejects(() => createCloudBaseFetch({ role: "user", userToken: null })("https://adapter.invalid/rest/v1/profiles"), /未登录/);
  delete process.env.CLOUDBASE_SERVICE_API_KEY;
});

test("admin data client uses only CloudBase service API key and browser user calls use same origin", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID = "env-test";
  process.env.CLOUDBASE_SERVICE_API_KEY = "service-api-key";
  let admin: Request | undefined;
  const adminFetch = createCloudBaseFetch({ role: "admin", fetcher: async (input, init) => { admin = new Request(input, init); return Response.json({}); } });
  await adminFetch("https://adapter.invalid/rest/v1/profiles", { headers: { authorization: "Bearer untrusted" } });
  assert.equal(admin!.headers.get("authorization"), "Bearer service-api-key");
  delete process.env.CLOUDBASE_SERVICE_API_KEY;
  delete process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;

  let browserUrl = "";
  let browserAuthorization: string | null = "set";
  const browserFetch = createCloudBaseFetch({ role: "browser", fetcher: async (input, init) => { browserUrl = String(input); browserAuthorization = new Headers(init?.headers).get("authorization"); return Response.json({}); } });
  await browserFetch("https://adapter.invalid/rest/v1/profiles?select=id");
  assert.equal(browserUrl, "/api/cloudbase/rdb/rest/profiles?select=id");
  assert.equal(browserAuthorization, null);
});

test("supabase-js builders retain from/rpc while auth is delegated", () => {
  const client = createCloudBaseDataClient({ role: "user", userToken: "jwt", fetcher: fetch });
  assert.equal(typeof client.from, "function");
  assert.equal(typeof client.rpc, "function");
  assert.equal(typeof client.auth.getUser, "function");
});

test("data requests preserve other preferences and use the source database UTC timestamp contract", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  let preference: string | null = null;
  const send = createCloudBaseFetch({
    role: "user", userToken: "jwt",
    fetcher: async (input, init) => {
      preference = new Request(input, init).headers.get("prefer");
      return Response.json([]);
    },
  });
  await send("https://adapter.invalid/rest/v1/videos", {
    headers: { Prefer: "count=exact, return=representation, timezone=Asia/Shanghai" },
  });
  assert.match(preference ?? "", /count=exact/);
  assert.match(preference ?? "", /return=representation/);
  assert.match(preference ?? "", /timezone=UTC/);
  assert.doesNotMatch(preference ?? "", /timezone=Asia/);
});

test("admin auth reads CloudBase auth projections only and rejects unsupported writes", async () => {
  process.env.CLOUDBASE_ENV_ID = "env-test";
  process.env.CLOUDBASE_SERVICE_API_KEY = "service-api-key";
  const client = createCloudBaseDataClient({
    role: "admin",
    fetcher: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const request = input instanceof Request ? await input.clone().json() : {};
      if (url.pathname.endsWith("/rpc/cloudbase_auth_user_by_subject")) return Response.json({ id: request.p_subject, email: "team@example.com" });
      if (url.pathname.endsWith("/rpc/cloudbase_auth_users_page")) return Response.json({ users: [{ id: "u1" }], total: 1, page: 1, per_page: 50 });
      throw new Error(`Unexpected RPC ${url.pathname}`);
    },
  });
  const byId = await client.auth.admin.getUserById("stable-sub");
  assert.equal(byId.data.user?.id, "stable-sub");
  const page = await client.auth.admin.listUsers({ page: 1, perPage: 50 });
  assert.equal(page.data.users[0].id, "u1");
  const write = await client.auth.admin.deleteUser("stable-sub");
  assert.equal(write.error?.code, "unsupported_operation");
  delete process.env.CLOUDBASE_SERVICE_API_KEY;
});

test("database adapter unwraps known SQLSTATE codes without turning real faults into permission denials", async () => {
  const previousEnvId = process.env.CLOUDBASE_ENV_ID;
  process.env.CLOUDBASE_ENV_ID = "env-test";
  const clientForError = (code: string, status: number) => createCloudBaseDataClient({
    role: "user",
    userToken: "test-jwt",
    fetcher: async () => Response.json({ code, message: `database response ${code}` }, { status }),
  });

  try {
    const denied = await clientForError("DATABASE_42501", 403).rpc("probe_permission", {});
    assert.equal(denied.error?.code, "42501");

    const duplicate = await clientForError("DATABASE_23505", 409).rpc("probe_duplicate", {});
    assert.equal(duplicate.error?.code, "23505");

    const faultyResult = await reviewExemptionRequestAtomically({
      supabase: clientForError("DATABASE_42P01", 500) as never,
      requestId: "request-1",
      decision: "rejected",
    });
    assert.equal(faultyResult.ok, false);
    if (faultyResult.ok) throw new Error("expected database failure");
    assert.equal(faultyResult.status, 500, "真实数据库故障仍按系统错误处理");
    assert.equal(faultyResult.message, "豁免操作失败");
  } finally {
    if (previousEnvId === undefined) delete process.env.CLOUDBASE_ENV_ID;
    else process.env.CLOUDBASE_ENV_ID = previousEnvId;
  }
});

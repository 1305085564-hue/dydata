import assert from "node:assert/strict";
import test from "node:test";
import { createAdminClient } from "./supabase/admin";
import { createCloudBaseDataClient } from "./cloudbase/data-client";

const IDENTITY_RPCS = [
  "review_exemption_request_dates_atomically",
  "reopen_exemption_request_atomically",
  "set_permanent_exemption_owner_atomically",
  "clear_permanent_exemption_owner_atomically",
  "handle_fulfillment_appeal",
  "reopen_fulfillment_appeal_atomically",
  "review_team_join_request",
  "get_leaderboard_rows",
  "count_remind_logs_for_user",
];

for (const backend of ["supabase", "cloudbase"] as const) {
  for (const rpc of IDENTITY_RPCS) {
    test(`${backend} 管理员连接立即拦截依赖本人身份的 ${rpc} 并留日志`, (t) => {
      const previous = { ...process.env };
      t.after(() => { process.env = previous; });
      process.env.DYDATA_BACKEND = backend;
      process.env.NEXT_PUBLIC_DYDATA_BACKEND = backend;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://guard-test.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-test-service-role";
      process.env.CLOUDBASE_ENV_ID = "guard-test";
      process.env.CLOUDBASE_SERVICE_API_KEY = "guard-test-service-key";
      const logs = t.mock.method(console, "error", () => {});
      const client = createAdminClient();
      assert.throws(() => client.rpc(rpc, {}), /必须使用本人身份连接/);
      assert.equal(logs.mock.calls.length, 1);
      const entry = JSON.parse(String(logs.mock.calls[0].arguments[0]));
      assert.equal(entry.detail.rpc, rpc);
      assert.equal(entry.detail.backend, backend);
      assert.ok(entry.requestId);
    });
  }
}

test("CloudBase 直接创建的管理员连接也不能绕过身份拦截", () => {
  const client = createCloudBaseDataClient({ role: "admin" });
  assert.throws(() => client.rpc("get_leaderboard_rows", {}), /必须使用本人身份连接/);
});

test("本人身份连接仍可调用身份函数，普通管理函数保持可用", async (t) => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  process.env.CLOUDBASE_ENV_ID = "guard-test";
  process.env.CLOUDBASE_SERVICE_API_KEY = "guard-test-service-key";
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests += 1; return Response.json([]); };
  const user = createCloudBaseDataClient({ role: "user", userToken: "test-jwt", fetcher });
  assert.equal((await user.rpc("get_leaderboard_rows", {})).error, null);
  const admin = createCloudBaseDataClient({ role: "admin", fetcher });
  assert.equal((await admin.rpc("cloudbase_auth_users_page", {})).error, null);
  assert.equal(requests, 2);
});

for (const backend of ["supabase", "cloudbase"] as const) {
  test(`${backend} 仅服务端可执行的履约函数保留管理员连接与可信操作者`, async (t) => {
    const previous = { ...process.env };
    t.after(() => { process.env = previous; });
    process.env.DYDATA_BACKEND = backend;
    process.env.NEXT_PUBLIC_DYDATA_BACKEND = backend;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://guard-test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-test-service-role";
    process.env.CLOUDBASE_ENV_ID = "guard-test";
    process.env.CLOUDBASE_SERVICE_API_KEY = "guard-test-service-key";
    const called: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("authorization"), `Bearer ${backend === "cloudbase" ? "guard-test-service-key" : "guard-test-service-role"}`);
      assert.equal((await request.json()).p_marker_id, "trusted-actor");
      called.push(new URL(request.url).pathname.split("/").at(-1)!);
      return Response.json({ ok: true });
    });
    const client = createAdminClient();
    const names = ["mark_fulfillment_status", "mark_fulfillment_status_batch", "remove_fulfillment_mark"];
    for (const name of names) {
      assert.equal((await client.rpc(name, { p_marker_id: "trusted-actor" })).error, null);
    }
    assert.deepEqual(called, names);
  });
}

import test from "node:test";
import assert from "node:assert/strict";

import {
  emit,
  listOpenTodoSummaryForUser,
  markDone,
  markRead,
} from "./server";

test("空接收者直接成功且不创建数据库客户端", async () => {
  assert.deepEqual(await emit({ recipients: [], type: "test", category: "todo", title: "" }), { ok: true, inserted: 0 });
  assert.deepEqual(await emit({ recipients: ["", ""], type: "test", category: "todo", title: "" }), { ok: true, inserted: 0 });
});

test("非空操作在缺少服务端配置时明确抛错", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(() => emit({ recipients: ["u1"], type: "test", category: "todo", title: "通知" }), /Missing/);
    await assert.rejects(() => markRead("n1", "u1"), /Missing/);
    await assert.rejects(() => markDone("n1", "u1", "ignored"), /Missing/);
    await assert.rejects(() => listOpenTodoSummaryForUser("u1"), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test("markRead: 本人已读重复调用成功，但他人通知没有匹配行时不能返回成功", async () => {
  const previousEnv = {
    backend: process.env.DYDATA_BACKEND,
    envId: process.env.CLOUDBASE_ENV_ID,
    serviceKey: process.env.CLOUDBASE_SERVICE_API_KEY,
  };
  const previousFetch = globalThis.fetch;
  const requests: Array<{ method: string; id: string | null; userId: string | null; status: string | null }> = [];
  const notifications: Record<string, { userId: string; status: "unread" | "read" | "done" }> = {
    "own-read": { userId: "user-1", status: "read" },
    "other-user-read": { userId: "user-2", status: "unread" },
    "own-done": { userId: "user-1", status: "done" },
  };
  process.env.DYDATA_BACKEND = "cloudbase";
  process.env.CLOUDBASE_ENV_ID = "notification-test";
  process.env.CLOUDBASE_SERVICE_API_KEY = "notification-test-key";
  globalThis.fetch = (async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requests.push({
      method: request.method,
      id: url.searchParams.get("id"),
      userId: url.searchParams.get("user_id"),
      status: url.searchParams.get("status"),
    });
    const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
    const userId = url.searchParams.get("user_id")?.replace(/^eq\./, "") ?? "";
    if (request.method === "PATCH") {
      const row = notifications[id];
      const body = await request.clone().json() as { status?: string };
      const matched = Boolean(row && row.userId === userId && row.status === "unread" && body.status === "read");
      if (matched) row!.status = "read";
      return Response.json(matched ? [{ id }] : [], { status: 200 });
    }
    if (request.method === "GET") {
      const row = notifications[id];
      return Response.json(row && row.userId === userId && row.status === "read" ? [{ id }] : [], { status: 200 });
    }
    throw new Error(`Unexpected notifications request ${request.method}`);
  }) as typeof fetch;

  try {
    assert.equal(await markRead("own-read", "user-1"), true);
    assert.equal(await markRead("other-user-read", "user-1"), false);
    assert.equal(await markRead("own-done", "user-1"), false);
    assert.equal(notifications["other-user-read"].status, "unread", "不能把他人通知误标为已读");
    assert.equal(notifications["own-done"].status, "done", "标读不能把已完成通知改回已读");
    assert.ok(requests.every((request) => request.userId === "eq.user-1"), "所有读写都按可信 user_id 限定");
    assert.ok(requests.filter((request) => request.method === "PATCH").every((request) => request.status === "eq.unread"));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnv.backend === undefined) delete process.env.DYDATA_BACKEND;
    else process.env.DYDATA_BACKEND = previousEnv.backend;
    if (previousEnv.envId === undefined) delete process.env.CLOUDBASE_ENV_ID;
    else process.env.CLOUDBASE_ENV_ID = previousEnv.envId;
    if (previousEnv.serviceKey === undefined) delete process.env.CLOUDBASE_SERVICE_API_KEY;
    else process.env.CLOUDBASE_SERVICE_API_KEY = previousEnv.serviceKey;
  }
});

for (const failingMethod of ["PATCH", "GET"]) {
  test(`markRead: ${failingMethod} 数据库故障不能伪装成无匹配通知`, async () => {
    const old = { backend: process.env.DYDATA_BACKEND, envId: process.env.CLOUDBASE_ENV_ID, serviceKey: process.env.CLOUDBASE_SERVICE_API_KEY };
    const oldFetch = globalThis.fetch;
    Object.assign(process.env, { DYDATA_BACKEND: "cloudbase", CLOUDBASE_ENV_ID: "notification-test", CLOUDBASE_SERVICE_API_KEY: "test-only-key" });
    globalThis.fetch = (async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      return request.method === failingMethod
        ? Response.json({ code: "DATABASE_XX000", message: "database unavailable" }, { status: 500 })
        : Response.json([]);
    }) as typeof fetch;
    try { await assert.rejects(() => markRead("n1", "u1"), /通知/); }
    finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries({ DYDATA_BACKEND: old.backend, CLOUDBASE_ENV_ID: old.envId, CLOUDBASE_SERVICE_API_KEY: old.serviceKey })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
}

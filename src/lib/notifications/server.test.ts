import test from "node:test";
import assert from "node:assert/strict";

import { emit, listForUser, markAllRead, markDone, markRead } from "./server";

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
    await assert.rejects(() => markAllRead("u1"), /Missing/);
    await assert.rejects(() => markDone("n1", "u1", "ignored"), /Missing/);
    await assert.rejects(() => listForUser("u1", { statuses: [], limit: 0 }), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildSupabaseKeepaliveResponse } from "./route";

test("supabase keepalive 未授权时返回 401", async () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;

  const response = await buildSupabaseKeepaliveResponse(
    new NextRequest("https://dydata.cc/api/supabase-keepalive"),
  );

  assert.equal(response.status, 401);
});

test("supabase keepalive 授权后执行轻量查询", async () => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.REMIND_SECRET = "cron-secret";

  try {
    const response = await buildSupabaseKeepaliveResponse(
      new NextRequest("https://dydata.cc/api/supabase-keepalive?secret=cron-secret"),
      {
        runKeepalive: async () => ({
          table: "profiles",
          rowCount: 0,
          checkedAt: "2026-06-08T00:00:00.000Z",
        }),
      },
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.table, "profiles");
    assert.equal(payload.rowCount, 0);
    assert.equal(payload.checkedAt, "2026-06-08T00:00:00.000Z");
  } finally {
    delete process.env.CRON_SECRET;
    delete process.env.REMIND_SECRET;
  }
});

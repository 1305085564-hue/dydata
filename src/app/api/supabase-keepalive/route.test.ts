import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildSupabaseKeepaliveResponse } from "./route";
import type { SupabaseKeepaliveResult } from "@/lib/supabase/keepalive";

const KEEPALIVE_DEPS = {
  runKeepalive: async (): Promise<SupabaseKeepaliveResult> => ({
    table: "profiles",
    rowCount: 0,
    checkedAt: "2026-06-08T00:00:00.000Z",
  }),
};

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

test("轮换后：Vercel Cron Bearer 头可用，旧泄露密钥仍返回 401", async () => {
  process.env.CRON_SECRET = "rotated-new-secret";
  delete process.env.REMIND_SECRET;

  try {
    // Vercel cron 自动携带的标准头 → 放行
    const bearerResponse = await buildSupabaseKeepaliveResponse(
      new NextRequest("https://dydata.cc/api/supabase-keepalive", {
        headers: { authorization: "Bearer rotated-new-secret" },
      }),
      KEEPALIVE_DEPS,
    );
    assert.equal(bearerResponse.status, 200);

    // 泄露过的旧明文 secret（query 与 Bearer）→ 仍然 401
    const oldQueryResponse = await buildSupabaseKeepaliveResponse(
      new NextRequest("https://dydata.cc/api/supabase-keepalive?secret=dydata-remind-2026"),
      KEEPALIVE_DEPS,
    );
    assert.equal(oldQueryResponse.status, 401);

    const oldBearerResponse = await buildSupabaseKeepaliveResponse(
      new NextRequest("https://dydata.cc/api/supabase-keepalive", {
        headers: { authorization: "Bearer dydata-remind-2026" },
      }),
      KEEPALIVE_DEPS,
    );
    assert.equal(oldBearerResponse.status, 401);

    // 无任何凭据 → 401
    const noAuthResponse = await buildSupabaseKeepaliveResponse(
      new NextRequest("https://dydata.cc/api/supabase-keepalive"),
      KEEPALIVE_DEPS,
    );
    assert.equal(noAuthResponse.status, 401);
  } finally {
    delete process.env.CRON_SECRET;
    delete process.env.REMIND_SECRET;
  }
});

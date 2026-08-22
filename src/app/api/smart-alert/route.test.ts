import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "./route";

test("smart-alert 缺 service role 配置时明确失败（禁止回退 anon key）", async () => {
  process.env.CRON_SECRET = "cron-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const response = await GET(
      new NextRequest("https://dydata.cc/api/smart-alert?secret=cron-secret"),
    );

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.match(String(payload.error), /SUPABASE_SERVICE_ROLE_KEY|配置缺失/);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("smart-alert 未授权时返回 401", async () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;

  const response = await GET(new NextRequest("https://dydata.cc/api/smart-alert"));

  assert.equal(response.status, 401);
});

test("smart-alert 支持 Bearer 头鉴权后进入缺配置分支", async () => {
  process.env.CRON_SECRET = "cron-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const response = await GET(
      new NextRequest("https://dydata.cc/api/smart-alert", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    // 鉴权通过，但缺 service key → 明确 500 而不是静默用 anon key
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.match(String(payload.error), /SUPABASE_SERVICE_ROLE_KEY|配置缺失/);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

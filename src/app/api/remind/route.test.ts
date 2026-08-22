import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "./route";

test("remind 缺 service role 配置时明确失败（禁止回退 anon key）", async () => {
  process.env.CRON_SECRET = "cron-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // 客户端创建已提前到节假日判断之前，工作日/周末都会走到同一分支
    const response = await GET(
      new NextRequest("https://dydata.cc/api/remind?secret=cron-secret"),
    );

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.match(String(payload.error), /SUPABASE_SERVICE_ROLE_KEY|配置缺失/);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("remind 未授权时返回 401", async () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;

  const response = await GET(new NextRequest("https://dydata.cc/api/remind"));

  assert.equal(response.status, 401);
});

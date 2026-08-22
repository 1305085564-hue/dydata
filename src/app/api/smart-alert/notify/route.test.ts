import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "./route";

test("smart-alert/notify 缺 service role 配置时明确失败（禁止回退 anon key）", async () => {
  process.env.CRON_SECRET = "cron-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const response = await GET(
      new NextRequest("https://dydata.cc/api/smart-alert/notify?secret=cron-secret"),
    );

    // 客户端创建先于 FEISHU_WEBHOOK_URL 检查 → 缺配置时是配置错误而非 webhook 错误
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.match(String(payload.error), /SUPABASE_SERVICE_ROLE_KEY|配置缺失/);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("smart-alert/notify 未授权时返回 401", async () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;

  const response = await GET(new NextRequest("https://dydata.cc/api/smart-alert/notify"));

  assert.equal(response.status, 401);
});

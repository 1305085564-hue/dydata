import test from "node:test";
import assert from "node:assert/strict";

import { clearCache, retryContentBreakdown, retryDailyReview } from "./task-management";

test("缺少任务参数时在连接数据库前返回错误", async () => {
  assert.deepEqual(await retryContentBreakdown({}, false), { success: false, error: "缺少 contentItemId" });
  assert.deepEqual(await clearCache({}, false), { success: false, error: "缺少 cacheType" });
});

test("日报重跑即使空数组也会要求服务端配置", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { await assert.rejects(() => retryDailyReview({ videoIds: [] }, true), /Missing/); }
  finally { process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl; process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; }
});

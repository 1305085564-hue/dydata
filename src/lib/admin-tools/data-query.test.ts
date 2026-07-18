import test from "node:test";
import assert from "node:assert/strict";

import { getAnomalousData, getTaskStatus, getUserInfo } from "./data-query";

test("请求上下文外的数据查询明确失败", async () => {
  await assert.rejects(() => getUserInfo({}), /outside a request scope|request scope|cookies/i);
  await assert.rejects(() => getAnomalousData({ type: "" }), /outside a request scope|request scope|cookies/i);
});

test("任务状态查询在缺服务端配置时明确失败", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { await assert.rejects(() => getTaskStatus({ taskType: "" }), /Missing/); }
  finally { process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl; process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; }
});

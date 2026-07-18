import assert from "node:assert/strict";
import test from "node:test";

import { fetchDashboardActivity } from "./video-submit-panel";

test("数据台活动接口失败时抛出错误，避免弹窗永久停在加载中", async () => {
  await assert.rejects(
    () =>
      fetchDashboardActivity(async () =>
        new Response(JSON.stringify({ error: "活动记录暂不可用" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /活动记录暂不可用/,
  );
});

test("数据台活动接口返回无效结构时明确失败", async () => {
  await assert.rejects(
    () =>
      fetchDashboardActivity(async () =>
        new Response(JSON.stringify({ monthReports: null, history: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /活动记录格式无效/,
  );
});

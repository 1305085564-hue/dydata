import assert from "node:assert/strict";
import test from "node:test";

import { fetchDashboardActivity } from "./video-submit-panel-v2";

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

test("历史活动请求支持分页参数并保留服务端继续加载标记", async () => {
  let requestedUrl = "";
  const result = await fetchDashboardActivity(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ history: [], page: 2, pageSize: 30, hasMore: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, { page: 2, pageSize: 30 });

  assert.equal(requestedUrl, "/api/dashboard/activity?page=2&pageSize=30");
  assert.equal(result.hasMore, true);
  assert.equal(result.page, 2);
});

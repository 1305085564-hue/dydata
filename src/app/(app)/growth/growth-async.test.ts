import assert from "node:assert/strict";
import test from "node:test";

import { fetchGrowthLeaderboard, fetchGrowthTrend } from "./growth-client";

test("成长趋势与榜单接口失败时抛错，不伪装成暂无数据", async () => {
  const failingRequest = async () =>
    new Response(JSON.stringify({ error: "统计服务不可用" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(() => fetchGrowthTrend(failingRequest), /统计服务不可用/);
  await assert.rejects(() => fetchGrowthLeaderboard(failingRequest), /统计服务不可用/);
});

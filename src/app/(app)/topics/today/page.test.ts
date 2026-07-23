import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchActiveTopicsResponse,
  fetchTodayClaimsResponse,
  type ActiveData
} from "./today-helpers";

test("今日选题接口失败时抛错，避免显示成暂无活跃选题", async () => {
  await assert.rejects(
    () =>
      fetchActiveTopicsResponse(async () =>
        new Response(JSON.stringify({ error: "活跃选题服务不可用" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /活跃选题服务不可用/,
  );
});

test("今日页认领状态失败时抛错，不把未知状态当成零认领", async () => {
  await assert.rejects(
    () =>
      fetchTodayClaimsResponse(async () =>
        new Response(JSON.stringify({ error: "认领状态读取失败" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /认领状态读取失败/,
  );
});

test("值得再做接口能够正确解析 summary 对象内的字段与整体均值", async () => {
  const mockActiveData: ActiveData = {
    overallAveragePlayCount: 12000,
    worthRedoing: [
      {
        id: "sub-1",
        title: "爆款洗发水复刻",
        hook: "三秒抓牢受众",
        summary: {
          qualifiedWorkCount: 3,
          averagePlayCount: 18000,
          bestCopy: "经典文案片段"
        }
      }
    ],
    recentlyClaimed: [],
    recentlyWorked: [],
    recentlyCreated: []
  };

  const res = await fetchActiveTopicsResponse(async () =>
    new Response(JSON.stringify(mockActiveData), { status: 200 })
  );

  assert.equal(res.overallAveragePlayCount, 12000);
  assert.equal(res.worthRedoing?.[0].summary?.qualifiedWorkCount, 3);
  assert.equal(res.worthRedoing?.[0].summary?.averagePlayCount, 18000);
});

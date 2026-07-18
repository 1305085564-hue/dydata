import assert from "node:assert/strict";
import test from "node:test";

import { fetchActiveTopicsResponse, fetchTodayClaimsResponse } from "./page";

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

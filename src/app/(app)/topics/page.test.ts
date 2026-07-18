import assert from "node:assert/strict";
import test from "node:test";

import { fetchTopicPoolResponse, resolvePageAfterLoad } from "./page";

test("选题池接口失败时抛错，避免显示成暂无选题", async () => {
  await assert.rejects(
    () =>
      fetchTopicPoolResponse("/api/topics/pool", async () =>
        new Response(JSON.stringify({ error: "选题服务不可用" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /选题服务不可用/,
  );
});

test("加载更多失败时保留当前页，成功后才前进", () => {
  assert.equal(resolvePageAfterLoad(2, false), 2);
  assert.equal(resolvePageAfterLoad(2, true), 3);
});

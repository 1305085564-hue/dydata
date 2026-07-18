import assert from "node:assert/strict";
import test from "node:test";

import { fetchFeedbackCards } from "./feedback-card-section";

test("复盘卡接口失败时抛出错误，避免静默显示为空", async () => {
  await assert.rejects(
    () =>
      fetchFeedbackCards(async () =>
        new Response(JSON.stringify({ error: "服务不可用" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /服务不可用/,
  );
});

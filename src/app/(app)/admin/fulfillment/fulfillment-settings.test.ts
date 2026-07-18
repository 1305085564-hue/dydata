import assert from "node:assert/strict";
import test from "node:test";

import { fetchFulfillmentSettings } from "./fulfillment-workbench";

test("催交设置接口失败时抛错，避免把未知状态显示为关闭", async () => {
  await assert.rejects(
    () =>
      fetchFulfillmentSettings(async () =>
        new Response(JSON.stringify({ error: "设置读取失败" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /设置读取失败/,
  );
});

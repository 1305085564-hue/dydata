import assert from "node:assert/strict";
import test from "node:test";

import { fetchFulfillmentAppeals } from "./fulfillment-workbench";

test("申诉接口失败时抛错，避免显示成零条申诉", async () => {
  await assert.rejects(
    () =>
      fetchFulfillmentAppeals(async () =>
        new Response(JSON.stringify({ error: "无权读取申诉" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /无权读取申诉/,
  );
});

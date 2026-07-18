import assert from "node:assert/strict";
import test from "node:test";

import { fetchViolationDetail } from "./case-detail-dialog";

test("话术详情 404 与网络失败使用不同提示", async () => {
  await assert.rejects(
    () =>
      fetchViolationDetail("missing", async () =>
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /可能已被下架/,
  );

  await assert.rejects(
    () => fetchViolationDetail("network", async () => Promise.reject(new Error("网络已断开"))),
    /网络已断开/,
  );
});

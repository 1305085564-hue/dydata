import test from "node:test";
import assert from "node:assert/strict";

import { deleteMetrics, fillMissingData, grantExemption } from "./data-correction";

test("数据修正缺参数时返回明确错误且不连接数据库", async () => {
  assert.deepEqual(await deleteMetrics({}, false), { success: false, error: "缺少 metricsId" });
  assert.deepEqual(await fillMissingData({ userId: "u1", date: null }), { success: false, error: "缺少 userId 或 date" });
  assert.deepEqual(await grantExemption({ userIds: [], userId: null }, true), { success: false, error: "缺少 userId/userIds" });
});

import test from "node:test";
import assert from "node:assert/strict";

import { buildBatchResponse, resolveBatchRequest } from "./批量诊断";

test("resolveBatchRequest 使用默认参数", () => {
  const result = resolveBatchRequest({});

  assert.deepEqual(result, {
    userId: null,
    accountId: null,
    days: 7,
    limit: 20,
  });
});

test("resolveBatchRequest 保留指定筛选", () => {
  const result = resolveBatchRequest({ user_id: "u1", account_id: "a1", days: 3, limit: 5 });

  assert.deepEqual(result, {
    userId: "u1",
    accountId: "a1",
    days: 3,
    limit: 5,
  });
});

test("buildBatchResponse 返回候选与执行汇总", () => {
  const result = buildBatchResponse({
    candidates: ["v1", "v2", "v3"],
    summary: {
      total: 3,
      diagnosed: 2,
      failed: [{ video_id: "v2", error: "AI 超时" }],
    },
  });

  assert.deepEqual(result, {
    candidate_count: 3,
    total: 3,
    diagnosed: 2,
    failed: [{ video_id: "v2", error: "AI 超时" }],
  });
});

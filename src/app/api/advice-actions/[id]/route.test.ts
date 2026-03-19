import test from "node:test";
import assert from "node:assert/strict";

import { buildAdviceUpdatePayload } from "./更新建议";

test("buildAdviceUpdatePayload 生成下发更新字段", () => {
  const result = buildAdviceUpdatePayload({
    action: "assign",
    actorUserId: "admin-1",
  });

  assert.deepEqual(result, {
    assigned_by: "admin-1",
    status: "待执行",
  });
});

test("buildAdviceUpdatePayload 生成复核更新字段", () => {
  const result = buildAdviceUpdatePayload({
    action: "review",
    actorUserId: "admin-2",
    reviewResult: "有效",
  });

  assert.deepEqual(result, {
    review_result: "有效",
    reviewed_by: "admin-2",
    status: "已复核",
  });
});

test("buildAdviceUpdatePayload 支持直接更新状态", () => {
  const result = buildAdviceUpdatePayload({
    action: "status",
    actorUserId: "admin-3",
    status: "已执行",
  });

  assert.deepEqual(result, {
    status: "已执行",
  });
});

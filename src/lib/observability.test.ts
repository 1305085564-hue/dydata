import assert from "node:assert/strict";
import test from "node:test";
import { observeOperation } from "./observability";
import { createRequestContext } from "./request-context";

test("observeOperation 记录耗时、状态和上下文", async () => {
  const logs: Array<Record<string, unknown>> = [];
  let now = 100;
  const context = createRequestContext({ route: "/dashboard", operation: "load", startedAt: 50 });
  const result = await observeOperation(context, async () => ({ value: "ok", status: 200 }), { now: () => now += 25, log: (entry) => logs.push(entry as unknown as Record<string, unknown>) });
  assert.equal(result.metrics.durationMs, 75);
  assert.equal(result.metrics.outcome, "success");
  assert.equal(logs[0]?.requestId, context.requestId);
});

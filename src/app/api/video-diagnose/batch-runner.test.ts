import test from "node:test";
import assert from "node:assert/strict";

import { runTasksWithConcurrency } from "./batch-runner.ts";

test("批量诊断按并发上限执行，而不是完全串行", async () => {
  let running = 0;
  let maxRunning = 0;

  await runTasksWithConcurrency([1, 2, 3, 4], 2, async (value) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running -= 1;
    return value * 2;
  });

  assert.equal(maxRunning, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./errors";
import { withRetry } from "./retry";

test("withRetry 最多尝试三次并使用有限退避", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const value = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new AppError({ code: "TIMEOUT", message: "timeout" });
    return "ok";
  }, { baseDelayMs: 2, sleep: async (delay) => { delays.push(delay); } });
  assert.equal(value, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [2, 4]);
});

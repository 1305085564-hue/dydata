import assert from "node:assert/strict";
import test from "node:test";
import { withTimeout } from "./timeout";
import { AppError } from "./errors";

test("withTimeout 在超时后中止任务并返回稳定错误", async () => {
  await assert.rejects(
    () => withTimeout(() => new Promise<never>(() => {}), { timeoutMs: 5, operation: "slow-read" }),
    (error: unknown) => error instanceof AppError && error.code === "TIMEOUT" && error.publicMessage === "请求超时，请稍后重试",
  );
});

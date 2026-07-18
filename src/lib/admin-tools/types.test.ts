import test from "node:test";
import assert from "node:assert/strict";

import type { ToolExecutionInput, ToolExecutionResult } from "./types";

test("管理工具合同支持空参数、dry-run 和空快照", () => {
  const input = { toolName: "noop", params: {}, dryRun: true } as ToolExecutionInput;
  const result: ToolExecutionResult = { success: false, error: "失败", beforeSnapshot: null, afterSnapshot: null };
  assert.deepEqual(input.params, {});
  assert.equal(input.dryRun, true);
  assert.equal(result.success, false);
  assert.equal(result.beforeSnapshot, null);
});

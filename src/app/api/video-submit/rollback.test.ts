import assert from "node:assert/strict";
import test from "node:test";

import { assertVideoSubmissionRollbackResult } from "./route";

test("视频提交回滚只接受服务端明确的 deleted 或 trashed 结果", () => {
  assert.doesNotThrow(() => assertVideoSubmissionRollbackResult("deleted", null));
  assert.doesNotThrow(() => assertVideoSubmissionRollbackResult("trashed", null));
  assert.throws(() => assertVideoSubmissionRollbackResult("missing_or_unsafe", null), /视频回滚未完成/);
  assert.throws(() => assertVideoSubmissionRollbackResult(null, { message: "rpc failed" }), /rpc failed/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubmissionVideoWriteMode } from "./submission-video-lifecycle";

test("回收站中的同编号视频会先恢复再更新", () => {
  assert.equal(resolveSubmissionVideoWriteMode("trashed"), "restore_then_update");
});

test("活跃视频更新，不存在时新增", () => {
  assert.equal(resolveSubmissionVideoWriteMode("active"), "update");
  assert.equal(resolveSubmissionVideoWriteMode(null), "insert");
});

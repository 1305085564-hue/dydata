import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_REPORT_WRITE_SELECT,
  SNAPSHOT_WRITE_SELECT,
  VIDEO_SUBMIT_RESPONSE_SELECT,
} from "./response-fields";

test("视频提交写入只返回后续流程需要的固定字段", () => {
  assert.doesNotMatch(VIDEO_SUBMIT_RESPONSE_SELECT, /\*/);
  assert.match(VIDEO_SUBMIT_RESPONSE_SELECT, /\bid\b/);
  assert.match(VIDEO_SUBMIT_RESPONSE_SELECT, /\buser_id\b/);
  assert.equal(SNAPSHOT_WRITE_SELECT, "id");
  assert.equal(DAILY_REPORT_WRITE_SELECT, "id");
});

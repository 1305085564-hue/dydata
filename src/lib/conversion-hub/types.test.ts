import assert from "node:assert/strict";
import test from "node:test";

import {
  APPEAL_STATUSES,
  SCRIPT_FORMATS,
  SCRIPT_USAGE_SOURCES,
  VIOLATION_EVENT_TYPES,
} from "./types";

test("转化中枢枚举保持数据库约定顺序", () => {
  assert.deepEqual(SCRIPT_FORMATS, ["oral", "visual", "mixed"]);
  assert.deepEqual(SCRIPT_USAGE_SOURCES, ["daily_report", "manual"]);
  assert.equal(VIOLATION_EVENT_TYPES.at(-1), "其他");
  assert.equal(APPEAL_STATUSES[0], "未申诉");
});

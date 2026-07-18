import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_STATUSES,
  type EmitInput,
} from "./types";

test("通知运行时枚举包含业务约定值", () => {
  assert.deepEqual(NOTIFICATION_CATEGORIES, ["todo", "feed"]);
  assert.ok(NOTIFICATION_STATUSES.includes("done"));
  assert.ok(NOTIFICATION_SEVERITIES.includes("critical"));
});

test("空接收者和 null 正文仍符合通知输入合同", () => {
  const input: EmitInput = { recipients: [], type: "test", category: "todo", title: "", body: null };
  assert.deepEqual(input.recipients, []);
  assert.equal(input.body, null);
});

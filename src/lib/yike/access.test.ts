import test from "node:test";
import assert from "node:assert/strict";

import { canUseYike, YIKE_ALLOWED_EMAIL } from "./access";

test("此刻只允许指定邮箱使用", () => {
  assert.equal(canUseYike(YIKE_ALLOWED_EMAIL), true);
  assert.equal(canUseYike(` ${YIKE_ALLOWED_EMAIL.toUpperCase()} `), true);
  assert.equal(canUseYike("other@example.com"), false);
  assert.equal(canUseYike(null), false);
});

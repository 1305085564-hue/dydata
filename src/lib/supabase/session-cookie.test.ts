// 实际连接腾讯云 CloudBase，目录名是历史遗留。
import test from "node:test";
import assert from "node:assert/strict";

import {
  isKeepLoggedInCookieValue,
  KEEP_LOGGED_IN_COOKIE_VALUE,
  KEEP_LOGGED_IN_MAX_AGE,
} from "./session-cookie";

test("KEEP_LOGGED_IN_MAX_AGE 固定为 30 天", () => {
  assert.equal(KEEP_LOGGED_IN_MAX_AGE, 30 * 24 * 60 * 60);
});

test("isKeepLoggedInCookieValue 只接受明确的保持登录标记", () => {
  assert.equal(isKeepLoggedInCookieValue(KEEP_LOGGED_IN_COOKIE_VALUE), true);
  assert.equal(isKeepLoggedInCookieValue("true"), false);
  assert.equal(isKeepLoggedInCookieValue(null), false);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAuthCookieLifetime,
  isKeepLoggedInCookieValue,
  KEEP_LOGGED_IN_COOKIE_VALUE,
  KEEP_LOGGED_IN_MAX_AGE,
} from "./session-cookie";

test("applyAuthCookieLifetime 勾选保持登录时将认证 cookie 固定为 30 天", () => {
  assert.deepEqual(
    applyAuthCookieLifetime({ httpOnly: false, maxAge: 400 * 24 * 60 * 60, path: "/" }, true),
    { httpOnly: false, maxAge: KEEP_LOGGED_IN_MAX_AGE, path: "/" },
  );
});

test("applyAuthCookieLifetime 未勾选保持登录时移除持久化生命周期", () => {
  assert.deepEqual(
    applyAuthCookieLifetime({ expires: new Date("2030-01-01T00:00:00.000Z"), maxAge: 400, path: "/" }, false),
    { path: "/" },
  );
});

test("isKeepLoggedInCookieValue 只接受明确的保持登录标记", () => {
  assert.equal(isKeepLoggedInCookieValue(KEEP_LOGGED_IN_COOKIE_VALUE), true);
  assert.equal(isKeepLoggedInCookieValue("true"), false);
  assert.equal(isKeepLoggedInCookieValue(null), false);
});

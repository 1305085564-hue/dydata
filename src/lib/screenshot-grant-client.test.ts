import assert from "node:assert/strict";
import test from "node:test";

import { parseCachedScreenshotGrant, shouldRenewGrant } from "./screenshot-grant-client";

test("截图授权缓存必须绑定当前用户且在有效期内才可复用", () => {
  const exp = 2_000_000_000;
  const value = JSON.stringify({ userId: "user-1", exp, mode: "fast" });
  assert.deepEqual(parseCachedScreenshotGrant(value, "user-1"), { userId: "user-1", exp, mode: "fast" });
  assert.equal(parseCachedScreenshotGrant(value, "user-2"), null);
  assert.equal(parseCachedScreenshotGrant(JSON.stringify({ userId: "user-1", exp, mode: "slow" }), "user-1"), null);
  assert.equal(shouldRenewGrant(exp, exp - 301), false);
  assert.equal(shouldRenewGrant(exp, exp - 299), true);
});

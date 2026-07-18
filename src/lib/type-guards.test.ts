import test from "node:test";
import assert from "node:assert/strict";

import { toBoolean, toObject, toTrimmedString } from "./type-guards";

test("基础类型守卫会清理合法值", () => {
  assert.equal(toTrimmedString("  报告  "), "报告");
  assert.equal(toBoolean(true), true);
  assert.deepEqual(toObject({ count: 0 }), { count: 0 });
});

test("null、数组和错误类型返回安全空值", () => {
  assert.equal(toTrimmedString(null), "");
  assert.equal(toBoolean(0), false);
  assert.equal(toBoolean(null, true), true);
  assert.deepEqual(toObject(null), {});
  assert.deepEqual(toObject([]), {});
});

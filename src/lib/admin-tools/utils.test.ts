import test from "node:test";
import assert from "node:assert/strict";

import { toBoolean, toDateString, toOptionalString, toSafeString, toStringArray } from "./utils";

test("管理工具参数会清理字符串、数组和日期", () => {
  assert.equal(toSafeString(" 名称 "), "名称");
  assert.equal(toOptionalString(" 值 "), "值");
  assert.deepEqual(toStringArray([" A ", 0, "", "B"]), ["A", "B"]);
  assert.equal(toDateString("2026-07-18"), "2026-07-18");
  assert.equal(toBoolean(true), true);
});

test("null、空数组和非法日期返回空值", () => {
  assert.equal(toOptionalString(null), null);
  assert.deepEqual(toStringArray(null), []);
  assert.equal(toDateString("2026/07/18"), "");
  assert.equal(toDateString(0), "");
});

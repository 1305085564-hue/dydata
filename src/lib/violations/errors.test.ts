import test from "node:test";
import assert from "node:assert/strict";

import { getApiErrorMessage } from "./errors";

test("接口错误读取字符串或结构化 message", () => {
  assert.equal(getApiErrorMessage({ error: " 无权限 " }, "失败"), " 无权限 ");
  assert.equal(getApiErrorMessage({ error: { message: "记录不存在" } }, "失败"), "记录不存在");
});

test("null、空错误和错误结构返回兜底文案", () => {
  assert.equal(getApiErrorMessage(null, "失败"), "失败");
  assert.equal(getApiErrorMessage({ error: "" }, "失败"), "失败");
  assert.equal(getApiErrorMessage([], "失败"), "失败");
});

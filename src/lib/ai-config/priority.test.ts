import assert from "node:assert/strict";
import test from "node:test";

import { toChannelPriority, toPriority } from "./priority";

test("toPriority 截断有限数字，并保留字符串 parseInt 的宽松行为", () => {
  assert.equal(toPriority(12.9), 12);
  assert.equal(toPriority(-3.8), -3);
  assert.equal(toPriority("12abc"), 12);
});

test("toPriority 对 NaN、Infinity 和无效输入使用 fallback", () => {
  assert.equal(toPriority(Number.NaN, 7), 7);
  assert.equal(toPriority(Number.POSITIVE_INFINITY, 7), 7);
  assert.equal(toPriority("   ", 7), 7);
  assert.equal(toPriority({}, 7), 7);
});

test("渠道优先级拒绝 0、越界和非整数", () => {
  assert.equal(toChannelPriority(undefined), 50);
  assert.equal(toChannelPriority("12"), 12);
  assert.throws(() => toChannelPriority(0), /1-999/);
  assert.throws(() => toChannelPriority(1000), /1-999/);
  assert.throws(() => toChannelPriority("12abc"), /1-999/);
});

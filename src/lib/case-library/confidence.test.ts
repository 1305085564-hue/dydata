import test from "node:test";
import assert from "node:assert/strict";

import {
  calcConversionRate,
  formatConversionRate,
  resolveConfidence,
} from "./confidence";

test("流量阈值映射正确的置信度档", () => {
  assert.equal(resolveConfidence(60_000).tier, "high");
  assert.equal(resolveConfidence(50_000).tier, "high");
  assert.equal(resolveConfidence(49_999).tier, "medium");
  assert.equal(resolveConfidence(25_000).tier, "medium");
  assert.equal(resolveConfidence(24_999).tier, "low");
  assert.equal(resolveConfidence(15_000).tier, "low");
  assert.equal(resolveConfidence(14_999).tier, "insufficient");
  assert.equal(resolveConfidence(0).tier, "insufficient");
});

test("calcConversionRate 处理 0 / 负数 / 正常", () => {
  assert.equal(calcConversionRate(0, 10), null);
  assert.equal(calcConversionRate(-1, 10), null);
  assert.equal(calcConversionRate(1000, -1), null);
  assert.equal(calcConversionRate(1000, 5), 0.005);
});

test("formatConversionRate 处理 null 与百分比格式", () => {
  assert.equal(formatConversionRate(null), "—");
  assert.equal(formatConversionRate(0.005), "0.50%");
  assert.equal(formatConversionRate(0.012345), "1.23%");
});

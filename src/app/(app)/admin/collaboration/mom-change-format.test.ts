import assert from "node:assert/strict";
import test from "node:test";

import { formatMomChange } from "./types";

/**
 * 环比展示口径：常规涨跌用百分比，涨幅跨过 1000% 改用倍数。
 * 起因：管理看板上出现「+2462.6%」，管理员第一反应是数据出错
 * （UX 审计 2026-09-23 · 发现 L1）。改倍数后量级一眼可读，信息不丢。
 */

test("常规涨跌仍用百分比，保留 1 位小数", () => {
  assert.equal(formatMomChange(0), "0.0%");
  assert.equal(formatMomChange(0.043), "4.3%");
  assert.equal(formatMomChange(0.5), "50.0%");
  assert.equal(formatMomChange(-0.953), "-95.3%");
});

test("涨幅达到 1000% 改用倍数，避免四位数增幅被当成脏数据", () => {
  assert.equal(formatMomChange(9.999), "999.9%", "边界内仍是百分比");
  assert.equal(formatMomChange(10), "10.0 倍");
  assert.equal(formatMomChange(24.626), "24.6 倍");
});

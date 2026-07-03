import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultPublishedAtValue,
  normalizePublishedAtInputValue,
} from "./日报";

test("新建日报时发布时间默认昨天 19:00", () => {
  const now = new Date(2026, 2, 17, 9, 30, 0);

  assert.equal(getDefaultPublishedAtValue(now), "2026-03-16T19:00");
});

test("已有发布时间会被格式化为 datetime-local 可回填值", () => {
  assert.equal(
    normalizePublishedAtInputValue("2026-03-16T14:25:30.000Z"),
    "2026-03-16T14:25"
  );
});

test("没有已有发布时间时返回空字符串", () => {
  assert.equal(normalizePublishedAtInputValue(null), "");
});

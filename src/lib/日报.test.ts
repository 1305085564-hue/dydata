import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultPublishedAtValue,
  getDefaultPublishedAtForBizDate,
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

test("历史日报没有发布时间时按归属日前一天默认 19:00", () => {
  assert.equal(
    getDefaultPublishedAtForBizDate(
      "2026-07-30",
      "2026-08-29",
      new Date(2026, 7, 29, 9, 30, 0),
    ),
    "2026-07-29T19:00",
  );
});

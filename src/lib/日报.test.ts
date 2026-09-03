import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultPublishedAtValue,
  getDefaultPublishedAtForBizDate,
  normalizePublishedAtForStorage,
  normalizePublishedAtInputValue,
} from "./日报";

test("新建日报时发布时间默认昨天 19:00", () => {
  const now = new Date(2026, 2, 17, 9, 30, 0);

  assert.equal(getDefaultPublishedAtValue(now), "2026-03-16T19:00");
});

test("UTC 环境北京时间凌晨默认发布时间是上海昨天 19:00", () => {
  const now = new Date("2026-03-16T20:30:00.000Z");
  assert.equal(now.toISOString().slice(0, 10), "2026-03-16");
  assert.equal(getDefaultPublishedAtValue(now), "2026-03-16T19:00");
});

test("UTC 环境年末跨年默认发布时间落在上海昨天", () => {
  const now = new Date("2026-12-31T16:30:00.000Z");
  assert.equal(getDefaultPublishedAtValue(now), "2026-12-31T19:00");
  assert.equal(
    getDefaultPublishedAtForBizDate("2027-01-01", "2027-01-01", now),
    "2026-12-31T19:00",
  );
});

test("上海 19:00 发布时间按 UTC 存储，回填仍显示 19:00", () => {
  assert.equal(
    normalizePublishedAtForStorage("2026-03-16T19:00"),
    "2026-03-16T11:00:00.000Z",
  );
  assert.equal(
    normalizePublishedAtInputValue("2026-03-16T11:00:00.000Z"),
    "2026-03-16T19:00",
  );
});

test("已有 UTC 发布时间回填为上海 datetime-local", () => {
  assert.equal(
    normalizePublishedAtInputValue("2026-03-16T14:25:30.000Z"),
    "2026-03-16T22:25",
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

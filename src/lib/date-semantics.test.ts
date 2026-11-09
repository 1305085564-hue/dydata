import test from "node:test";
import assert from "node:assert/strict";
import { buildPublishedDateRangeFilter, getPublishedDateForStats, getPublishedDateKey, getPublishedDateLabel, getPublishedTimestamp } from "./date-semantics";

test("发布日期筛选按上海整日边界，并只让无发布日期的历史行回退 report_date", () => {
  assert.equal(buildPublishedDateRangeFilter(null, null), null);
  assert.equal(
    buildPublishedDateRangeFilter("2026-10-08", "2026-10-08"),
    "and(published_at.is.null,report_date.gte.2026-10-08,report_date.lte.2026-10-08),and(published_at.gte.2026-10-07T16:00:00.000Z,published_at.lt.2026-10-08T16:00:00.000Z)",
  );
});

test("发布日优先真实发布时间，不受上传日影响", () => {
  assert.equal(
    getPublishedDateForStats({
      published_at: "2026-10-03T16:00:00.000Z",
      report_date: "2026-10-08",
    }),
    "2026-10-04",
  );
});

test("UTC 与上海跨日边界按上海自然日归属", () => {
  assert.equal(getPublishedDateForStats({ published_at: "2026-10-08T15:59:59.999Z" }), "2026-10-08");
  assert.equal(getPublishedDateForStats({ published_at: "2026-10-08T16:00:00.000Z" }), "2026-10-09");
});

test("缺少发布时间时回退日报归属日，不回退上传时间", () => {
  assert.equal(getPublishedDateForStats({ published_at: null, report_date: "2026-09-15" }), "2026-09-15");
  assert.equal(getPublishedDateForStats({ report_date: "2026-03-16" }), "2026-03-16");
  assert.equal(getPublishedDateForStats({ published_at: "invalid", report_date: "2026-10-08" }), "2026-10-08");
  assert.equal(getPublishedDateLabel({ report_date: null }), "发布日期未知");
});

test("旧展示入口继续使用统一发布日期规则", () => {
  assert.equal(getPublishedDateKey({ published_at: "2026-10-08T16:00:00.000Z", report_date: "2026-10-08" }), "2026-10-09");
});

test("发布日时间戳缺失时按归属日零点排序", () => {
  assert.equal(
    getPublishedTimestamp({ report_date: "2026-10-08" }),
    new Date("2026-10-08T00:00:00+08:00").getTime(),
  );
});

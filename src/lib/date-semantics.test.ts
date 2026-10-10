import test from "node:test";
import assert from "node:assert/strict";
import { getPublishedDateKey, getPublishedDateLabel, getPublishedTimestamp } from "./date-semantics";

test("发布日优先真实发布时间，不受上传日影响", () => {
  assert.equal(
    getPublishedDateKey({
      published_at: "2026-10-03T16:00:00.000Z",
      report_date: "2026-10-08",
    }),
    "2026-10-04",
  );
});

test("缺少发布时间时回退日报归属日，不回退上传时间", () => {
  assert.equal(getPublishedDateKey({ report_date: "2026-10-08" }), "2026-10-08");
  assert.equal(getPublishedDateLabel({ report_date: null }), "发布日期未知");
});

test("发布日时间戳缺失时按归属日零点排序", () => {
  assert.equal(
    getPublishedTimestamp({ report_date: "2026-10-08" }),
    new Date("2026-10-08T00:00:00+08:00").getTime(),
  );
});

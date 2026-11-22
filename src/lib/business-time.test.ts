import assert from "node:assert/strict";
import test from "node:test";

import {
  addShanghaiDateOnly,
  buildPublishedDateRangeFilter,
  buildValidatedShanghaiDateTimeIso,
  formatShanghaiDateOnly,
  formatShanghaiDateOnlyParts,
  formatShanghaiDateTimeLocal,
  formatShanghaiOffsetDateTime,
  getPublishedDateForStats,
  getPublishedDateKey,
  getPublishedDateLabel,
  getPublishedTimestamp,
  getShanghaiDaysInMonth,
  getShanghaiWeekday,
  getShanghaiYearMonth,
  parseBusinessDateTime,
  parseBusinessDateTimeIso,
  parseShanghaiDateOnly,
  shanghaiDateRangeToUtc,
  shanghaiDayStartIso,
  shanghaiDayStartOffset,
  shanghaiDayWindowUtc,
  shiftDateOnly,
} from "./business-time";

test("日期工具按日期与上海时区稳定格式化", () => {
  const date = new Date("2026-07-17T16:30:00.000Z");
  assert.equal(formatShanghaiDateOnly(date), "2026-07-18");
  assert.equal(shiftDateOnly(new Date("2026-07-18T00:00:00.000Z"), 0), "2026-07-18");
});

test("shiftDateOnly 以上海业务日为基准，避免 UTC+8 凌晨少一天", () => {
  const nearMidnight = new Date("2026-08-31T16:30:00.000Z");
  assert.equal(formatShanghaiDateOnly(nearMidnight), "2026-09-01");
  assert.equal(shiftDateOnly(nearMidnight, -60), "2026-07-03");
  assert.equal(shiftDateOnly(nearMidnight, -1), "2026-08-31");
  assert.equal(shiftDateOnly(nearMidnight, 0), "2026-09-01");
  assert.equal(shiftDateOnly(nearMidnight, 7), "2026-09-08");
  assert.equal(shiftDateOnly(new Date("2026-03-01T00:00:00.000Z"), -1), "2026-02-28");
});

test("月份边界统一按上海时区计算", () => {
  assert.deepEqual(getShanghaiYearMonth(new Date("2026-08-31T16:30:00.000Z")), { year: 2026, month: 9 });
  assert.deepEqual(getShanghaiYearMonth(new Date("2026-09-30T15:30:00.000Z")), { year: 2026, month: 9 });
  assert.deepEqual(getShanghaiYearMonth(new Date("2026-12-31T16:30:00.000Z")), { year: 2027, month: 1 });
});

test("日历拆分、加减与边界校验不依赖宿主机时区", () => {
  assert.deepEqual(parseShanghaiDateOnly("2026-09-01"), { year: 2026, month: 9, day: 1 });
  assert.throws(() => parseShanghaiDateOnly("2026-02-30"));
  assert.equal(formatShanghaiDateOnlyParts(2026, 3, 5), "2026-03-05");
  assert.equal(getShanghaiDaysInMonth(2024, 2), 29);
  assert.equal(getShanghaiDaysInMonth(2026, 2), 28);
  assert.equal(getShanghaiWeekday(2026, 11, 22), 0);
  assert.equal(addShanghaiDateOnly("2026-09-01", -1), "2026-08-31");
  assert.equal(shanghaiDayStartOffset("2026-10-03"), "2026-10-03T00:00:00+08:00");
  assert.equal(shanghaiDayStartIso("2026-10-03"), "2026-10-02T16:00:00.000Z");
  assert.equal(formatShanghaiOffsetDateTime("2026-03-05", "20:42:00"), "2026-03-05T20:42:00+08:00");
  assert.deepEqual(shanghaiDateRangeToUtc("2026-10-08", "2026-10-08"), {
    startUtc: "2026-10-07T16:00:00.000Z",
    endUtc: "2026-10-08T16:00:00.000Z",
  });
  assert.deepEqual(shanghaiDayWindowUtc("2026-10-08"), {
    start: "2026-10-07T16:00:00.000Z",
    end: "2026-10-08T16:00:00.000Z",
  });
  assert.equal(shanghaiDayWindowUtc("invalid"), null);
  assert.equal(
    buildValidatedShanghaiDateTimeIso({ year: 2026, month: 11, day: 19, hour: 18, minute: 41 }),
    "2026-11-19T10:41:00.000Z",
  );
  assert.equal(
    buildValidatedShanghaiDateTimeIso({ year: 2026, month: 2, day: 30, hour: 12, minute: 0 }),
    null,
  );
  assert.equal(formatShanghaiDateTimeLocal(new Date("2026-03-16T11:00:00.000Z")), "2026-03-16T19:00");
});

test("parseBusinessDateTime：带时区按原时区，无时区按北京时间，非法返回 null", () => {
  const originalTz = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Shanghai", "America/Los_Angeles"]) {
      process.env.TZ = tz;

      // 带明确时区
      assert.equal(parseBusinessDateTimeIso("2026-03-16T11:00:00.000Z"), "2026-03-16T11:00:00.000Z");
      assert.equal(parseBusinessDateTimeIso("2026-03-16T19:00:00+08:00"), "2026-03-16T11:00:00.000Z");
      assert.equal(parseBusinessDateTimeIso("2026-03-16T19:00:00+09:00"), "2026-03-16T10:00:00.000Z");

      // 标准无时区格式（与旧实现完全一致）
      assert.equal(parseBusinessDateTimeIso("2026-03-16T19:00"), "2026-03-16T11:00:00.000Z");
      assert.equal(parseBusinessDateTimeIso("2026-03-16 19:00:30"), "2026-03-16T11:00:30.000Z");
      assert.equal(parseBusinessDateTimeIso("2026-03-16"), "2026-03-15T16:00:00.000Z");

      // 非标准无时区格式：一律按北京时间解释，不受 UTC 服务器时区影响
      assert.equal(parseBusinessDateTimeIso("2026/03/16 19:00"), "2026-03-16T11:00:00.000Z");
      assert.equal(parseBusinessDateTimeIso("2026/3/5 8:05"), "2026-03-05T00:05:00.000Z");
      assert.equal(parseBusinessDateTimeIso("2026.03.16 19:00"), "2026-03-16T11:00:00.000Z");
      assert.equal(parseBusinessDateTimeIso("2026年3月5日 20:42"), "2026-03-05T12:42:00.000Z");

      // 不可解析或非法日历：严格返回 null，不猜
      assert.equal(parseBusinessDateTime("2026-02-30T12:00"), null);
      assert.equal(parseBusinessDateTime("2026-02-30T12:00:00Z"), null);
      assert.equal(parseBusinessDateTime("not-a-date"), null);
      assert.equal(parseBusinessDateTime("19点"), null);
      assert.equal(parseBusinessDateTime(""), null);
      assert.equal(parseBusinessDateTime(null), null);
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

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

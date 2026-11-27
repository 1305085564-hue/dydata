import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  addShanghaiDateOnly, diffShanghaiDays, formatShanghaiDateOnly,
  getShanghaiWeekday, parseBusinessDateTime,
} from "../business-time";
import { summarizeMonthFulfillment } from "../dashboard-panel-header";
import { resolveDashboardFulfillmentMarks } from "../loaders/dashboard-fulfillment-marks";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { getBatchDateStatus, getDateStatus, getMonthDates, getMonthStatistics } from "./submission-status";

// 2026-11-28 阿禅确认：现行按自然日履约，周末/节假日不自动免交。
// 不虚构仓库不存在的中国工作日历；是否改成工作日口径仍待产品确认。
const today = "2026-11-10";
const options = {
  today,
  submittedDates: ["2026-10-31", "2026-11-02", "2026-11-02", "2026-11-03"],
  waiveDates: ["2026-11-04"],
  leaveDates: ["2026-11-05"],
  pendingDates: ["2026-11-06"],
};

function calendarButtons(patch: Partial<Parameters<typeof SubmissionCalendar>[0]> = {}) {
  const html = renderToStaticMarkup(createElement(SubmissionCalendar, {
    ...options, absentDates: ["2026-11-07"], showLegend: false, ...patch,
  }));
  return new Map([...html.matchAll(/<button\b[^>]*aria-label="11月(\d+)日[^>]*>/g)]
    .map(([button, day]) => [`2026-11-${day.padStart(2, "0")}`, button]));
}

test("北京时间日界线：UTC 前一天仍属于上海当天", () => {
  assert.equal(formatShanghaiDateOnly(new Date("2026-11-09T15:59:59.999Z")), "2026-11-09");
  assert.equal(formatShanghaiDateOnly(new Date("2026-11-09T16:00:00.000Z")), "2026-11-10");
  assert.equal(parseBusinessDateTime("2026-11-10 00:00:00")?.toISOString(), "2026-11-09T16:00:00.000Z");
});

test("业务日期跨月、跨年和闰日移动不受本机时区影响", () => {
  assert.equal(addShanghaiDateOnly("2026-11-01", -1), "2026-10-31");
  assert.equal(addShanghaiDateOnly("2026-12-31", 1), "2027-01-01");
  assert.equal(addShanghaiDateOnly("2024-02-28", 1), "2024-02-29");
  assert.equal(diffShanghaiDays("2026-10-31", "2026-11-02"), 2);
});

test("现行自然日规则：周六、周日也要履约，不自动免交", () => {
  assert.equal(getShanghaiWeekday(2026, 11, 7), 6);
  assert.equal(getShanghaiWeekday(2026, 11, 8), 0);
  assert.deepEqual(summarizeMonthFulfillment({
    today: "2026-11-09", joinedDate: "2026-11-07", submittedDates: [], exemptDates: [],
  }), { submittedCount: 0, missedCount: 2 });
});

test("全月状态互斥且完整：已交、请假、免交、审批、漏交、今日、未来恰好覆盖30天", () => {
  assert.deepEqual(getMonthStatistics(2026, 10, options), {
    total: 30, submitted: 2, waived: 1, onLeave: 1, pending: 1,
    missing: 4, unsubmitted: 1, future: 20, completed: 4,
  });
  const states = getBatchDateStatus(getMonthDates(2026, 10), options);
  assert.equal(Object.keys(states).length, 30);
  assert.equal(states["2026-11-10"].canBackfill, true);
  assert.equal(states["2026-11-11"].canBackfill, false);
});

test("月度摘要对重复提交去重，忽略上月记录，今天与未来不计漏交", () => {
  assert.deepEqual(summarizeMonthFulfillment({
    today, submittedDates: [...options.submittedDates, "2026-11-11"],
    exemptDates: [...options.waiveDates, ...options.leaveDates, ...options.pendingDates],
  }), { submittedCount: 2, missedCount: 4 });
});

test("入职前不算漏交，人工请假/免交/确认已发剔除，人工缺勤仍算漏交", () => {
  const marks = resolveDashboardFulfillmentMarks([
    { record_date: "2026-11-05", status: "leave", reason: null },
    { record_date: "2026-11-06", status: "waived", reason: null },
    { record_date: "2026-11-07", status: "absent", reason: "未发" },
    { record_date: "2026-11-08", status: "confirmed_published", reason: null },
  ], "2026-11-03T16:00:00.000Z");
  assert.deepEqual(marks.absentDates, ["2026-11-07"]);
  assert.equal(marks.monthFulfillmentBasis.joinedDate, "2026-11-04");
  assert.deepEqual(summarizeMonthFulfillment({
    today, submittedDates: ["2026-11-04"], exemptDates: [], ...marks.monthFulfillmentBasis,
  }), { submittedCount: 1, missedCount: 2 });
});

test("真实月历展示与月度统计对账：缺勤保留独立展示但计入未履约", () => {
  const buttons = calendarButtons();
  assert.equal(buttons.size, 30);
  const states = getBatchDateStatus(getMonthDates(2026, 10), options);
  const titleByState = { submitted: "已提交", waived: "已豁免", on_leave: "已请假", pending: "申请审批中" };
  let missing = 0;
  for (const [date, button] of buttons) {
    const state = states[date].status;
    if (state in titleByState) {
      assert.ok(button.includes(`title="${titleByState[state as keyof typeof titleByState]}"`), date);
    } else if (date === "2026-11-07") {
      assert.ok(button.includes('title="缺勤"'));
    } else {
      assert.equal(button.includes("title="), false, date);
    }
    assert.equal(button.includes('disabled=""'), state === "future", date);
    if (state === "missing") missing += 1;
  }
  assert.equal(missing, 4);
  assert.equal(summarizeMonthFulfillment({
    today, submittedDates: options.submittedDates,
    exemptDates: [...options.waiveDates, ...options.leaveDates, ...options.pendingDates],
  }).missedCount, missing);
});

test("整月长期免交不会产生漏交，今天已交仍计入已交数", () => {
  assert.deepEqual(summarizeMonthFulfillment({
    today, submittedDates: [today], exemptDates: [],
    exemptionProfile: {
      id: "synthetic", status: "exempt", exempt_type: "permanent",
      exempt_start_date: null, exempt_end_date: null, exempt_reason: null,
    },
  }), { submittedCount: 1, missedCount: 0 });
});

// BUG_FOUND：submission-status 的请假/免交优先级与真实月历不同；保留可执行待修断言。
test.todo("同一天同时存在请假和免交时，统计应与月历展示同一状态", () => {
  const patch = { waiveDates: ["2026-11-05"], leaveDates: ["2026-11-05"] };
  assert.ok(calendarButtons(patch).get("2026-11-05")?.includes('title="已豁免"'));
  assert.equal(getDateStatus({ ...options, ...patch, date: "2026-11-05" }).status, "waived");
});

// BUG_FOUND：月历优先显示未来日期，统计却先计入未来日期上的请假/免交记录。
test.todo("未来日期上的提前豁免记录不应被统计为已经完成", () => {
  const patch = { leaveDates: ["2026-11-11"] };
  assert.ok(calendarButtons(patch).get("2026-11-11")?.includes('disabled=""'));
  assert.equal(getDateStatus({ ...options, ...patch, date: "2026-11-11" }).status, "future");
});

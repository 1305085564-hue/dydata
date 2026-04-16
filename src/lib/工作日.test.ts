import test from "node:test";
import assert from "node:assert/strict";

import { getChinaWorkingDayReason, getShanghaiYear, hasChinaHolidayPlan, isChinaWorkingDay } from "./工作日";

test("法定节假日会被识别为非工作日", () => {
  assert.equal(isChinaWorkingDay(new Date("2026-05-01T03:15:00.000Z")), false);
  assert.equal(getChinaWorkingDayReason(new Date("2026-05-01T03:15:00.000Z")), "法定节假日");
});

test("调休上班日即使落在周末也会被识别为工作日", () => {
  assert.equal(isChinaWorkingDay(new Date("2026-05-09T03:15:00.000Z")), true);
  assert.equal(getChinaWorkingDayReason(new Date("2026-05-09T03:15:00.000Z")), "调休工作日");
});

test("普通周末会被识别为非工作日", () => {
  assert.equal(isChinaWorkingDay(new Date("2026-04-12T03:15:00.000Z")), false);
  assert.equal(getChinaWorkingDayReason(new Date("2026-04-12T03:15:00.000Z")), "周末");
});

test("普通工作日会继续推送", () => {
  assert.equal(isChinaWorkingDay(new Date("2026-04-13T03:15:00.000Z")), true);
  assert.equal(getChinaWorkingDayReason(new Date("2026-04-13T03:15:00.000Z")), "工作日");
});

test("已配置年份和未配置年份可以被识别出来", () => {
  assert.equal(getShanghaiYear(new Date("2026-12-31T16:00:00.000Z")), 2027);
  assert.equal(hasChinaHolidayPlan(2026), true);
  assert.equal(hasChinaHolidayPlan(2027), false);
});

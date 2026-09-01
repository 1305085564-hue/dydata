import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvailableExemptionDates,
  isDateAvailable,
  mergeSubmittedDates,
  addShanghaiDateOnly,
} from "./use-exemption-calendar";

test("上海时区日期加减跨月计算准确", () => {
  assert.equal(addShanghaiDateOnly("2026-09-01", -1), "2026-08-31");
  assert.equal(addShanghaiDateOnly("2026-09-01", -6), "2026-08-26");
  assert.equal(addShanghaiDateOnly("2026-03-01", -1), "2026-02-28");
});

test("9月1日月初支持申请8月31日等历史漏交日期（跨月申请）", () => {
  const isAug31Available = isDateAvailable("2026-08-31", {
    today: "2026-09-01",
    submittedDates: ["2026-08-30"],
  });
  const isAug30Available = isDateAvailable("2026-08-30", {
    today: "2026-09-01",
    submittedDates: ["2026-08-30"],
  });
  const isFutureAvailable = isDateAvailable("2026-09-02", {
    today: "2026-09-01",
    submittedDates: [],
  });

  assert.equal(isAug31Available, true, "8月31日未交应允许申请豁免");
  assert.equal(isAug30Available, false, "8月30日已提交不可申请豁免");
  assert.equal(isFutureAvailable, false, "未来日期不可申请豁免");

  const availableDates = getAvailableExemptionDates({
    today: "2026-09-01",
    submittedDates: ["2026-08-30"],
    daysInPast: 7,
  });

  assert.ok(availableDates.includes("2026-08-31"));
  assert.ok(availableDates.includes("2026-09-01"));
  assert.equal(availableDates.includes("2026-08-30"), false);
  assert.equal(availableDates.includes("2026-09-02"), false);
});

test("首屏提交日期会和异步活动日期合并去重", () => {
  assert.deepEqual(
    mergeSubmittedDates(
      ["2026-08-03", "2026-08-05"],
      ["2026-08-05", "2026-08-07"],
    ),
    ["2026-08-03", "2026-08-05", "2026-08-07"],
  );
});

test("已提交、已请假、已豁免和未来日期均不可申请", () => {
  const options = {
    today: "2026-08-25",
    submittedDates: ["2026-08-03"],
    additionalSubmittedDates: ["2026-08-04"],
    waiveDates: ["2026-08-05"],
    leaveDates: ["2026-08-06"],
  };

  assert.equal(isDateAvailable("2026-08-03", options), false);
  assert.equal(isDateAvailable("2026-08-04", options), false);
  assert.equal(isDateAvailable("2026-08-05", options), false);
  assert.equal(isDateAvailable("2026-08-06", options), false);
  assert.equal(isDateAvailable("2026-08-26", options), false);
  assert.equal(isDateAvailable("2026-08-07", options), true);
});


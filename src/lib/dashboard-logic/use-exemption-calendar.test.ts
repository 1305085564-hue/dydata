import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvailableExemptionDates,
  mergeSubmittedDates,
} from "./use-exemption-calendar";

test("上海时区日期计算不把月初日期偏移到上个月", () => {
  const availableDates = getAvailableExemptionDates({
    today: "2026-08-25",
    submittedDates: [],
  });

  assert.equal(availableDates[0], "2026-08-01");
  assert.ok(availableDates.includes("2026-08-25"));
  assert.equal(availableDates.includes("2026-07-31"), false);
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
  const availableDates = getAvailableExemptionDates({
    today: "2026-08-25",
    submittedDates: ["2026-08-03"],
    additionalSubmittedDates: ["2026-08-04"],
    waiveDates: ["2026-08-05"],
    leaveDates: ["2026-08-06"],
  });

  assert.equal(availableDates.includes("2026-08-03"), false);
  assert.equal(availableDates.includes("2026-08-04"), false);
  assert.equal(availableDates.includes("2026-08-05"), false);
  assert.equal(availableDates.includes("2026-08-06"), false);
  assert.equal(availableDates.includes("2026-08-26"), false);
  assert.equal(availableDates.includes("2026-08-07"), true);
});

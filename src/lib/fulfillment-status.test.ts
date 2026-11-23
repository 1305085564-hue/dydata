import assert from "node:assert/strict";
import test from "node:test";

import {
  FULFILLED_FULFILLMENT_STATUSES,
  MANUAL_FULFILLMENT_MARK_STATUSES,
  REQUIRED_EXCLUDED_FULFILLMENT_STATUSES,
  WAIVED_FULFILLMENT_STATUSES,
  countsTowardFulfillmentRequirement,
  isFulfilledFulfillmentStatus,
  isManualFulfillmentMarkStatus,
  isWaivedFulfillmentStatus,
} from "./fulfillment-status";

test("履约完成、豁免和应发扣减状态集合来自单一常量", () => {
  assert.deepEqual(FULFILLED_FULFILLMENT_STATUSES, ["published", "confirmed_published"]);
  assert.deepEqual(WAIVED_FULFILLMENT_STATUSES, ["waived", "exempted"]);
  assert.deepEqual(REQUIRED_EXCLUDED_FULFILLMENT_STATUSES, ["leave", "waived", "exempted"]);
  assert.deepEqual(MANUAL_FULFILLMENT_MARK_STATUSES, ["leave", "waived", "absent", "confirmed_published"]);
});

test("履约状态 helper 与月度统计语义一致", () => {
  assert.equal(isFulfilledFulfillmentStatus("published"), true);
  assert.equal(isFulfilledFulfillmentStatus("confirmed_published"), true);
  assert.equal(isWaivedFulfillmentStatus("waived"), true);
  assert.equal(isWaivedFulfillmentStatus("exempted"), true);
  assert.equal(countsTowardFulfillmentRequirement("leave"), false);
  assert.equal(countsTowardFulfillmentRequirement("waived"), false);
  assert.equal(countsTowardFulfillmentRequirement("exempted"), false);
  assert.equal(countsTowardFulfillmentRequirement("absent"), true);
  assert.equal(countsTowardFulfillmentRequirement("unconfirmed"), true);
  assert.equal(isManualFulfillmentMarkStatus("leave"), true);
  assert.equal(isManualFulfillmentMarkStatus("waived"), true);
  assert.equal(isManualFulfillmentMarkStatus("absent"), true);
  assert.equal(isManualFulfillmentMarkStatus("confirmed_published"), true);
  assert.equal(isManualFulfillmentMarkStatus("published"), false);
  assert.equal(isManualFulfillmentMarkStatus("exempted"), false);
});

import { summarizeMonthFulfillment } from "./dashboard-panel-header";
import { resolveDashboardFulfillmentMarks } from "./loaders/dashboard-fulfillment-marks";

test("工作台月度履约漏交统计：已交、请假、免交、确认已发和今日不计漏交，缺勤与未确认计入漏交", () => {
  const { monthFulfillmentBasis } = resolveDashboardFulfillmentMarks(
    [
      { record_date: "2026-11-05", status: "confirmed_published", reason: null },
      { record_date: "2026-11-06", status: "absent", reason: "管理员认定缺勤" },
      { record_date: "2026-11-01", status: "confirmed_published", reason: null },
    ],
    "2026-11-01T00:00:00+08:00",
  );
  const summary = summarizeMonthFulfillment({
    today: "2026-11-10",
    joinedDate: monthFulfillmentBasis.joinedDate,
    submittedDates: ["2026-11-02"],
    exemptDates: ["2026-11-03", "2026-11-04"],
    manualMarkedDates: monthFulfillmentBasis.manualMarkedDates,
  });
  // 11-01 确认已发, 11-02 已交, 11-03/04 豁免, 11-05 确认已发, 11-06 缺勤(漏), 11-07/08/09 未确认(漏), 11-10 今日(不算漏)
  assert.equal(summary.submittedCount, 1);
  assert.equal(summary.missedCount, 4);
});

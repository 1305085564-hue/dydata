import assert from "node:assert/strict";
import test from "node:test";

import { resolveDashboardFulfillmentMarks } from "./dashboard-fulfillment-marks";

test("入职日取上海日期；请假/确认已发归人工标记，缺勤单独成组", () => {
  const result = resolveDashboardFulfillmentMarks(
    [
      { record_date: "2026-11-09", status: "absent", reason: null },
      { record_date: "2026-11-08", status: "leave", reason: null },
      { record_date: "2026-11-07", status: "confirmed_published", reason: null },
    ],
    "2026-11-06T17:30:00Z",
  );
  assert.equal(result.monthFulfillmentBasis.joinedDate, "2026-11-07");
  assert.deepEqual(result.monthFulfillmentBasis.manualMarkedDates, ["2026-11-07", "2026-11-08"]);
  assert.deepEqual(result.absentDates, ["2026-11-09"]);
  assert.deepEqual(result.absentReasons, { "2026-11-09": "管理员认定缺勤" });
});

test("没有入职时间不设下限", () => {
  assert.equal(resolveDashboardFulfillmentMarks([], null).monthFulfillmentBasis.joinedDate, null);
});

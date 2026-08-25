import assert from "node:assert/strict";
import test from "node:test";

import { getMonthDates } from "./submission-status";

test("上海时区月份日期 helper 不把月初偏移到上个月", () => {
  const dates = getMonthDates(2026, 7);

  assert.equal(dates[0], "2026-08-01");
  assert.equal(dates.at(-1), "2026-08-31");
});

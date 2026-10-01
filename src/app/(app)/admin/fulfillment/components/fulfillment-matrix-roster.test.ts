import test from "node:test";
import assert from "node:assert/strict";

import { isDayFocused } from "./fulfillment-matrix-roster";

test("isDayFocused 当 range 为 today 时仅匹配今日", () => {
  const today = "2026-10-01";
  assert.equal(isDayFocused("2026-10-01", today, "today"), true);
  assert.equal(isDayFocused("2026-09-30", today, "today"), false);
  assert.equal(isDayFocused("2026-10-02", today, "today"), false);
});

test("isDayFocused 当 range 为 last7days 时正确匹配最近7天窗口", () => {
  const today = "2026-10-07";
  // 最近7天：2026-10-01 至 2026-10-07
  assert.equal(isDayFocused("2026-10-07", today, "last7days"), true);
  assert.equal(isDayFocused("2026-10-01", today, "last7days"), true);
  assert.equal(isDayFocused("2026-09-30", today, "last7days"), false);
  assert.equal(isDayFocused("2026-10-08", today, "last7days"), false);
});

test("isDayFocused 当 range 为其他预设或为空时返回 false", () => {
  const today = "2026-10-01";
  assert.equal(isDayFocused("2026-10-01", today, "thisMonth"), false);
  assert.equal(isDayFocused("2026-10-01", today, "lastMonth"), false);
  assert.equal(isDayFocused("2026-10-01", today, "custom"), false);
  assert.equal(isDayFocused("2026-10-01", today, undefined), false);
});

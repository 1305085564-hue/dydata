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

test("getTooltipPlacement 空间充足时放在上方，空间不足时优雅降级到下方", async () => {
  const { getTooltipPlacement } = await import("./fulfillment-matrix-roster");
  
  // 视口上方空间充足 (top: 300 >= 230)
  const rectAbove = { left: 100, top: 300, width: 22, height: 22, right: 122, bottom: 322 } as DOMRect;
  const posAbove = getTooltipPlacement(rectAbove, 1200, 800);
  assert.equal(posAbove.transform, "translate(-50%, -100%)");
  assert.equal(posAbove.top, 292);

  // 视口上方空间不足 (top: 50 < 230) -> 切换为下方
  const rectBelow = { left: 100, top: 50, width: 22, height: 22, right: 122, bottom: 72 } as DOMRect;
  const posBelow = getTooltipPlacement(rectBelow, 1200, 800);
  assert.equal(posBelow.transform, "translate(-50%, 0)");
  assert.equal(posBelow.top, 80);
});


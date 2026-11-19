import test from "node:test";
import assert from "node:assert/strict";

import { getCellTone, getTooltipPlacement } from "./fulfillment-matrix-roster";

test("格子只分四种底：已发 · 请假/豁免 · 缺勤 · 未确认；不在考核内留空", () => {
  assert.equal(getCellTone("published"), "published");
  assert.equal(getCellTone("confirmed_published"), "published");
  assert.equal(getCellTone("leave"), "excused");
  assert.equal(getCellTone("waived"), "excused");
  assert.equal(getCellTone("exempted"), "excused");
  assert.equal(getCellTone("absent"), "absent");
  assert.equal(getCellTone("unconfirmed"), "unconfirmed");
  assert.equal(getCellTone(undefined), "none");
});

test("getTooltipPlacement 空间充足时放在上方，空间不足时优雅降级到下方", () => {
  const rectAbove = { left: 100, top: 300, width: 22, height: 22, right: 122, bottom: 322 } as DOMRect;
  const posAbove = getTooltipPlacement(rectAbove, 1200, 800);
  assert.equal(posAbove.transform, "translate(-50%, -100%)");
  assert.equal(posAbove.top, 292);

  const rectBelow = { left: 100, top: 50, width: 22, height: 22, right: 122, bottom: 72 } as DOMRect;
  const posBelow = getTooltipPlacement(rectBelow, 1200, 800);
  assert.equal(posBelow.transform, "translate(-50%, 0)");
  assert.equal(posBelow.top, 80);
});

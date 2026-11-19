import assert from "node:assert/strict";
import test from "node:test";

import { averagePlayOf, CALIBER } from "@/lib/metrics/caliber";

test("平均播放只纳入达到有效播放线的作品", () => {
  assert.equal(averagePlayOf([100, 5_000, 20_000]), 12_500);
  assert.equal(averagePlayOf([100, 1_999]), 0);
  assert.equal(CALIBER.effectiveMinPlay, 2_000);
});

import test from "node:test";
import assert from "node:assert/strict";

import { calcInteractionScore } from "./metrics";

test("互动质量分按既定权重计算", () => {
  const score = calcInteractionScore(100, 20, 10, 5);

  assert.equal(score, 35.25);
});

test("互动质量分会保留两位小数避免浮点误差", () => {
  const score = calcInteractionScore(11, 7, 3, 2);

  assert.equal(score, 6.25);
});

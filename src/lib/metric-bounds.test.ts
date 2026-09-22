import test from "node:test";
import assert from "node:assert/strict";

import {
  RATIO_LOWER_BOUND,
  RATIO_UPPER_BOUND,
  describeImpossibleRatio,
  isImpossibleRatio,
  toSortableRatio,
} from "./metric-bounds";

test("越界判定：生产库真实脏值 4773 必须被判为不可能", () => {
  // 生产库 video_metrics_snapshots 里真实存在 completion_rate_5s = 4773 的一条脏数据
  assert.equal(isImpossibleRatio(4773), true);
  assert.equal(isImpossibleRatio(100.1), true);
  assert.equal(isImpossibleRatio(-0.1), true);
});

test("越界判定：合法比率与缺数不误伤", () => {
  assert.equal(isImpossibleRatio(0), false);
  assert.equal(isImpossibleRatio(4.3), false);
  assert.equal(isImpossibleRatio(100), false);
  assert.equal(isImpossibleRatio(null), false);
  assert.equal(isImpossibleRatio(undefined), false);
  assert.equal(isImpossibleRatio(Number.NaN), false);
});

test("排序用值：越界比率按缺数处理（沉底），不参与「谁最差」判定", () => {
  assert.equal(toSortableRatio(4773), null);
  assert.equal(toSortableRatio(4.3), 4.3);
  assert.equal(toSortableRatio(0), 0);
  assert.equal(toSortableRatio(null), null);
});

test("脏值说明文案包含物理边界", () => {
  const text = describeImpossibleRatio();
  assert.ok(text.includes(String(RATIO_LOWER_BOUND)));
  assert.ok(text.includes(String(RATIO_UPPER_BOUND)));
});

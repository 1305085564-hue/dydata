import test from "node:test";
import assert from "node:assert/strict";

import {
  BREAKOUT_TARGETS,
  breakoutAchievement,
  breakoutGrade,
  breakoutRating,
  breakoutTargetsFor,
  formatAchievement,
} from "./breakout-rating";

test("标准线：干货与复盘仅互动率不同，第四格与转粉率阈值一致", () => {
  assert.equal(BREAKOUT_TARGETS.dry_goods.interaction, 0.03);
  assert.equal(BREAKOUT_TARGETS.review.interaction, 0.025);
  assert.equal(BREAKOUT_TARGETS.dry_goods.fourth, 0.02);
  assert.equal(BREAKOUT_TARGETS.review.fourth, 0.02);
  assert.equal(BREAKOUT_TARGETS.dry_goods.follower, 0.01);
  assert.equal(BREAKOUT_TARGETS.review.follower, 0.01);
});

test("标准线选取：干货走干货，复盘与无标签同走复盘", () => {
  assert.equal(breakoutTargetsFor("dry_goods").interaction, 0.03);
  assert.equal(breakoutTargetsFor("review").interaction, 0.025);
  assert.equal(breakoutTargetsFor("other").interaction, 0.025);
  assert.equal(breakoutTargetsFor(null).interaction, 0.025);
  assert.equal(breakoutTargetsFor(undefined).interaction, 0.025);
});

test("达成率：实际 ÷ 标准 × 100，超过 100 不封顶", () => {
  assert.equal(breakoutAchievement(0.03, 0.03), 100);
  assert.equal(breakoutAchievement(0.015, 0.03), 50);
  assert.equal(breakoutAchievement(0.0306, 0.03), 102);
  assert.equal(breakoutAchievement(0.06, 0.03), 200);
});

test("达成率：无实际值或标准非法时返回 null", () => {
  assert.equal(breakoutAchievement(null, 0.03), null);
  assert.equal(breakoutAchievement(undefined, 0.03), null);
  assert.equal(breakoutAchievement(Number.NaN, 0.03), null);
  assert.equal(breakoutAchievement(0.03, 0), null);
  assert.equal(breakoutAchievement(0.03, Number.NaN), null);
});

test("评级边界：100 优、85 良、70 普、70 以下劣", () => {
  assert.equal(breakoutGrade(102), "优");
  assert.equal(breakoutGrade(100), "优");
  assert.equal(breakoutGrade(99.9), "良");
  assert.equal(breakoutGrade(85), "良");
  assert.equal(breakoutGrade(84.9), "普");
  assert.equal(breakoutGrade(70), "普");
  assert.equal(breakoutGrade(69.9), "劣");
  assert.equal(breakoutGrade(0), "劣");
  assert.equal(breakoutGrade(-5), "劣");
  assert.equal(breakoutGrade(null), null);
});

test("单项评级：无值时不产出标签", () => {
  const cases: Array<[number | null, number, string | null, number | null]> = [
    [0.023, 0.025, "良", 92],
    [0.013, 0.02, "劣", 65],
    [0.003, 0.01, "劣", 30],
    [0.011, 0.01, "优", 110],
    [null, 0.01, null, null],
  ];
  for (const [actual, target, grade, achievement] of cases) {
    const rating = breakoutRating(actual, target);
    assert.equal(rating?.grade ?? null, grade);
    if (achievement === null) {
      assert.equal(rating, null);
    } else {
      assert.ok(
        Math.abs((rating?.achievement ?? Number.NaN) - achievement) < 1e-9,
        `期望达成率约 ${achievement}，实际 ${rating?.achievement}`,
      );
    }
  }
});

test("达成率文案：整数百分比，缺值显示占位符", () => {
  assert.equal(formatAchievement(91.6), "92%");
  assert.equal(formatAchievement(102.2), "102%");
  assert.equal(formatAchievement(0), "0%");
  assert.equal(formatAchievement(null), "—");
});

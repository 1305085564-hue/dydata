import test from "node:test";
import assert from "node:assert/strict";

import type { BreakoutRating } from "./breakout-rating";

import {
  BREAKOUT_TARGETS,
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
  breakoutAchievement,
  breakoutGrade,
  breakoutRating,
  breakoutTargetsFor,
  formatAchievement,
  hasKnownTopicKind,
  overallBreakoutGrade,
} from "./breakout-rating";

test("标准线：干货与复盘仅互动率不同，第四格与转粉率阈值一致", () => {
  assert.equal(BREAKOUT_TARGETS.dry_goods.interaction, 0.032);
  assert.equal(BREAKOUT_TARGETS.review.interaction, 0.027);
  assert.equal(BREAKOUT_TARGETS.dry_goods.fourth, 0.02);
  assert.equal(BREAKOUT_TARGETS.review.fourth, 0.02);
  assert.equal(BREAKOUT_TARGETS.dry_goods.follower, 0.01);
  assert.equal(BREAKOUT_TARGETS.review.follower, 0.01);
});

test("标准线选取：干货走干货，复盘与无标签同走复盘", () => {
  assert.equal(breakoutTargetsFor("dry_goods").interaction, 0.032);
  assert.equal(breakoutTargetsFor("review").interaction, 0.027);
  assert.equal(breakoutTargetsFor("other").interaction, 0.027);
  assert.equal(breakoutTargetsFor(null).interaction, 0.027);
  assert.equal(breakoutTargetsFor(undefined).interaction, 0.027);
});

test("话题是否已识别：三种已知分类为真，null/undefined 为假（不得静默按复盘出数）", () => {
  assert.equal(hasKnownTopicKind("dry_goods"), true);
  assert.equal(hasKnownTopicKind("review"), true);
  assert.equal(hasKnownTopicKind("other"), true);
  assert.equal(hasKnownTopicKind(null), false);
  assert.equal(hasKnownTopicKind(undefined), false);
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

test("评级边界：100 优、80 良、60 普、60 以下劣", () => {
  assert.equal(breakoutGrade(102), "优");
  assert.equal(breakoutGrade(100), "优");
  assert.equal(breakoutGrade(99.9), "良");
  assert.equal(breakoutGrade(80), "良");
  assert.equal(breakoutGrade(79.9), "普");
  assert.equal(breakoutGrade(60), "普");
  assert.equal(breakoutGrade(59.9), "劣");
  assert.equal(breakoutGrade(0), "劣");
  assert.equal(breakoutGrade(-5), "劣");
  assert.equal(breakoutGrade(null), null);
});

test("单项评级：无值时不产出标签", () => {
  const cases: Array<[number | null, number, string | null, number | null]> = [
    [0.023, 0.027, "良", (0.023 / 0.027) * 100],
    [0.013, 0.02, "普", 65],
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

// ---------- 综合评级（两项平均达成率 + 播放封顶，2026-09-30） ----------

const 优: BreakoutRating = { grade: "优", achievement: 100 };
const 良: BreakoutRating = { grade: "良", achievement: 80 };
const 普: BreakoutRating = { grade: "普", achievement: 60 };
const 劣: BreakoutRating = { grade: "劣", achievement: 30 };

test("流量门槛常量：5,000 普线 / 10,000 良线 / 15,000 优线", () => {
  assert.equal(KPI_PLAY_FLOOR, 5000);
  assert.equal(KPI_PLAY_GOOD, 10000);
  assert.equal(KPI_PLAY_EXCELLENT, 15000);
});

test("综合评级：两项全优仍受播放三档门槛限制（含两侧边界）", () => {
  const cases = [
    [0, "劣"], [4999, "劣"], [5000, "普"], [9999, "普"],
    [10000, "良"], [14999, "良"], [15000, "优"],
  ] as const;
  for (const [playCount, grade] of cases) {
    assert.equal(overallBreakoutGrade(playCount, [优, 优]), grade, `播放 ${playCount}`);
  }
});

test("综合评级：按两项原始达成率取平均，超过 100% 不封顶", () => {
  assert.equal(overallBreakoutGrade(15000, [breakoutRating(98, 100), breakoutRating(78, 100)]), "良");
  assert.equal(overallBreakoutGrade(15000, [优, 普]), "良");
  assert.equal(overallBreakoutGrade(15000, [优, 劣]), "普");
  assert.equal(overallBreakoutGrade(15000, [breakoutRating(140, 100), 普]), "优");
});

test("综合评级：平均达成率按 100/80/60 落档，不先四舍五入", () => {
  const cases = [[100, "优"], [99.9, "良"], [80, "良"], [79.9, "普"], [60, "普"], [59.9, "劣"]] as const;
  for (const [achievement, grade] of cases) {
    const item = breakoutRating(achievement, 100);
    assert.equal(overallBreakoutGrade(15000, [item, item]), grade, `平均达成率 ${achievement}%`);
  }
});

test("综合评级：播放只限制上限，不抬高指标评级", () => {
  assert.equal(overallBreakoutGrade(8000, [优, 普]), "普");
  assert.equal(overallBreakoutGrade(12000, [普, 普]), "普");
  assert.equal(overallBreakoutGrade(15000, [良, 良]), "良");
  assert.equal(overallBreakoutGrade(15000, [劣, 劣]), "劣");
});

test("综合评级：干货用收藏、复盘及其他用点赞；转粉率不参与综合", () => {
  const dryGoods = breakoutTargetsFor("dry_goods");
  const interaction = breakoutRating(0.026, dryGoods.interaction);
  const favorite = breakoutRating(0.012, dryGoods.fourth);
  // 样本按当前话题标准线计算为综合普；转粉率仍独立为劣，不影响综合
  assert.equal(breakoutRating(0.003, dryGoods.follower)?.grade, "劣");
  assert.equal(overallBreakoutGrade(12000, [interaction, favorite]), "普");
  for (const kind of ["review", "other"] as const) {
    const targets = breakoutTargetsFor(kind);
    assert.equal(overallBreakoutGrade(15000, [
      breakoutRating(0.03, targets.interaction),
      breakoutRating(0.012, targets.fourth),
    ]), "良");
  }
});

test("综合评级：播放未采或过门槛后任一参与项缺值 → null；低播放仍判劣", () => {
  for (const playCount of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(overallBreakoutGrade(playCount, [优, 优]), null);
  }
  assert.equal(overallBreakoutGrade(12000, [优, null]), null);
  assert.equal(overallBreakoutGrade(12000, [null, 优]), null);
  assert.equal(overallBreakoutGrade(12000, [null, null]), null);
  assert.equal(overallBreakoutGrade(4999, [null, null]), "劣");
  for (const achievement of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(overallBreakoutGrade(15000, [优, { grade: "优", achievement }]), null);
  }
});

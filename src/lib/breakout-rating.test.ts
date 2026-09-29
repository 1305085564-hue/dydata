import test from "node:test";
import assert from "node:assert/strict";

import type { BreakoutRating } from "./breakout-rating";

import {
  BREAKOUT_TARGETS,
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
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

// ---------- 综合评级（KPI 接入复盘抽屉，2026-09-29） ----------

const 优: BreakoutRating = { grade: "优", achievement: 100 };
const 良: BreakoutRating = { grade: "良", achievement: 80 };
const 普: BreakoutRating = { grade: "普", achievement: 60 };
const 劣: BreakoutRating = { grade: "劣", achievement: 30 };

test("流量门槛常量：5,000 硬门槛 / 12,000 优线", () => {
  assert.equal(KPI_PLAY_FLOOR, 5000);
  assert.equal(KPI_PLAY_EXCELLENT, 12000);
});

test("综合评级：播放未过 5,000 硬门槛直接判劣（两侧边界 4,999/5,000）", () => {
  // 4,999：三项全优也判劣（流量硬门槛优先于指标）
  assert.equal(overallBreakoutGrade(4999, [优, 优, 优]), "劣");
  // 5,000：过门槛，走短板原则
  assert.equal(overallBreakoutGrade(5000, [优, 优, 优]), "良");
});

test("综合评级：短板原则——三项取最低（两优一良封顶良、一劣则劣）", () => {
  assert.equal(overallBreakoutGrade(12000, [优, 优, 良]), "良");
  assert.equal(overallBreakoutGrade(12000, [优, 普, 优]), "普");
  assert.equal(overallBreakoutGrade(12000, [优, 优, 劣]), "劣");
  assert.equal(overallBreakoutGrade(12000, [优, 优, 优]), "优");
});

test("综合评级：优需要播放 ≥ 12,000（两侧边界 11,999/12,000），区间内三项全优封顶良", () => {
  assert.equal(overallBreakoutGrade(11999, [优, 优, 优]), "良");
  assert.equal(overallBreakoutGrade(12000, [优, 优, 优]), "优");
  // 非全优不受优线影响：5,000–12,000 之间短板是普就评普
  assert.equal(overallBreakoutGrade(6000, [优, 普, 优]), "普");
});

test("综合评级：缺数据不臆造——播放未采或任一项缺值 → null（不显示徽章）", () => {
  assert.equal(overallBreakoutGrade(null, [优, 优, 优]), null);
  assert.equal(overallBreakoutGrade(undefined, [优, 优, 优]), null);
  assert.equal(overallBreakoutGrade(Number.NaN, [优, 优, 优]), null);
  // 播放已过门槛，但任一项缺值无法评级 → 不评级
  assert.equal(overallBreakoutGrade(12000, [优, null, 优]), null);
  assert.equal(overallBreakoutGrade(12000, [null, null, null]), null);
});

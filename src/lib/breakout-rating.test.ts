import assert from "node:assert/strict";
import test from "node:test";
import { KPI_PLAY_EXCELLENT, KPI_PLAY_FLOOR, KPI_PLAY_GOOD, breakoutGrade, breakoutRating, overallBreakoutGrade, type BreakoutRating } from "./breakout-rating";
const rating = (achievement: number): BreakoutRating => ({ grade: breakoutGrade(achievement)!, achievement });
test("三档评级只返回优、良、普", () => assert.deepEqual([breakoutGrade(100), breakoutGrade(80), breakoutGrade(0)], ["优", "良", "普"]));
test("播放边界和封顶", () => {
  assert.equal(overallBreakoutGrade(0, [rating(150), rating(150)]), null);
  assert.equal(overallBreakoutGrade(1999, [rating(0), rating(0)]), "普");
  assert.equal(overallBreakoutGrade(4999, [rating(150), rating(150)]), "普");
  assert.equal(overallBreakoutGrade(5000, [rating(150), rating(150)]), "良");
  assert.equal(overallBreakoutGrade(14999, [rating(150), rating(150)]), "良");
  assert.equal(overallBreakoutGrade(15000, [rating(150), rating(150)]), "优");
  assert.deepEqual([KPI_PLAY_FLOOR, KPI_PLAY_GOOD, KPI_PLAY_EXCELLENT], [2000, 5000, 15000]);
});
test("偏科保护按弱项 80/60 两条线收口", () => {
  assert.equal(overallBreakoutGrade(15000, [rating(110), rating(90)]), "优");
  assert.equal(overallBreakoutGrade(15000, [rating(130), rating(70)]), "良");
  assert.equal(overallBreakoutGrade(15000, [rating(140), rating(40)]), "普");
  assert.equal(overallBreakoutGrade(15000, [rating(200), rating(0)]), "普");
  assert.equal(overallBreakoutGrade(15000, [rating(60), rating(50)]), "普");
});
test("缺参与项时高播放未评级且达成率不封顶", () => {
  assert.equal(overallBreakoutGrade(15000, [rating(150), null]), null);
  assert.equal(breakoutRating(0.07, 0.035)?.achievement, 200);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildContentQualitySummaryFromWorks, buildWorkContentQualityFromMetrics } from "./content-quality";
import { retentionSubMetricDetails } from "./collaboration/content-quality-contract";
import { DEFAULT_EVALUATION_STANDARDS } from "./evaluation-standards";
const topics = () => ({ state: "ready" as const, tags: new Map([["v", "复盘"]]) });
const snapshot = (overrides: Record<string, unknown> = {}) => ({ playCount: 15000, likes: 525, comments: 0, shares: 0, favorites: 0, bounceRate2s: 25, completionRate5s: 60, avgPlayDuration: 50, avgPlayRatio: 0.25, completionRate: 10, ...overrides });
test("留存完整与历史折算返回方式", () => {
  const complete = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot() }, topics(), DEFAULT_EVALUATION_STANDARDS);
  const durationOnly = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ avgPlayRatio: null }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
  const ratioOnly = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ avgPlayDuration: null }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
  const missingBoth = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ avgPlayDuration: null, avgPlayRatio: null }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
  assert.equal(complete.retentionCalculation, "average");
  assert.equal(durationOnly.retentionCalculation, "avg_play_duration_only");
  assert.equal(ratioOnly.retentionCalculation, "avg_play_ratio_only");
  assert.equal(missingBoth.contentAchievement, null);
});
test("话题读取失败不阻断评级", () => {
  const quality = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot() }, { state: "error", tags: new Map() }, DEFAULT_EVALUATION_STANDARDS);
  assert.equal(quality.status, "rated");
  assert.equal(quality.overallGrade, "优");
});
test("低于 2000 直接评普，质量均值只看 2000 以上", () => {
  const low = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ playCount: 1999, likes: null, comments: null, shares: null, favorites: null, bounceRate2s: null, completionRate5s: null, avgPlayDuration: null, avgPlayRatio: null, completionRate: null }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
  const high = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot() }, topics(), DEFAULT_EVALUATION_STANDARDS);
  const summary = buildContentQualitySummaryFromWorks([low, high]);
  assert.equal(low.overallGrade, "普");
  assert.equal(summary.goodExcellentRate, 0.5);
  assert.equal(summary.interactionSampleCount, 1);
  assert.equal(summary.achievementSampleCount, 1);
});

test("留存子项明细返回各指标实际值、达标率与状态", () => {
  const details = retentionSubMetricDetails(
    {
      bounceRate2s: 50,
      completionRate5s: 60,
      avgPlayDuration: null,
      avgPlayRatio: 25,
      completionRate: 10,
    },
    {
      retentionBands: {
        bounceRate2s: DEFAULT_EVALUATION_STANDARDS.bounceRate2s,
        completionRate5s: DEFAULT_EVALUATION_STANDARDS.completionRate5s,
        avgPlayDuration: DEFAULT_EVALUATION_STANDARDS.avgPlayDuration,
        avgPlayRatio: DEFAULT_EVALUATION_STANDARDS.avgPlayRatio,
        completionRate: DEFAULT_EVALUATION_STANDARDS.completionRate,
      },
    },
  );
  assert.equal(details.length, 5);
  assert.equal(details[0]?.status, "poor");
  assert.equal(details[0]?.actualText, "50%");
  assert.equal(details[1]?.status, "good");
  assert.equal(details[1]?.achievement, 100);
  assert.equal(details[2]?.status, "missing");
  assert.equal(details[2]?.actualText, "—");

  const withInteraction = buildWorkContentQualityFromMetrics(
    { videoId: "v", snapshot: snapshot({ likes: 500, comments: 20, shares: 10, favorites: 30 }) },
    topics(),
    DEFAULT_EVALUATION_STANDARDS,
  );
  assert.deepEqual(withInteraction.interactionMetrics, {
    likes: 500,
    comments: 20,
    shares: 10,
    favorites: 30,
  });
});

test("边界样本：跳出率、播放量档位与缺项口径保持一致", () => {
  for (const bounceRate2s of [25, 30, 30.01]) {
    const q = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ bounceRate2s }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
    assert.equal(q.status, "rated");
    assert.ok(typeof q.contentAchievement === "number");
  }
  for (const playCount of [2000, 4999, 5000, 14999, 15000]) {
    const withRatio = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ playCount }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
    const withoutRatio = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ playCount, avgPlayRatio: null }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
    assert.equal(withRatio.retentionCalculation, "average");
    assert.equal(withoutRatio.retentionCalculation, "avg_play_duration_only");
    assert.equal(withRatio.status, "rated");
    assert.equal(withoutRatio.status, "rated");
  }
  for (const field of ["bounceRate2s", "completionRate5s", "completionRate"] as const) {
    const q = buildWorkContentQualityFromMetrics({ videoId: "v", snapshot: snapshot({ [field]: null }) }, topics(), DEFAULT_EVALUATION_STANDARDS);
    assert.equal(q.contentAchievement, null, `缺少 ${field} 时不应得出综合达标率`);
  }
});

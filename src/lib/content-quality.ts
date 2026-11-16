import {
  BREAKOUT_GRADE_THRESHOLDS,
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
  breakoutAchievement,
  breakoutGrade,
  BREAKOUT_TARGETS,
  overallBreakoutGrade,
  type BreakoutGrade,
} from "@/lib/breakout-rating";
import { classifyVideoTopicKind, type VideoTopicKind } from "@/lib/topics/library";
import { interactionRate } from "@/lib/video-metrics";
import type {
  ContentQualityRules,
  ContentQualityStatus,
  ContentQualitySummary,
  RetentionMetrics,
  WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";
import { avgPlayRatioAsPercentagePoints, DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";

export type ContentQualityTopicContext = {
  state: "ready" | "error";
  /** 成功读取时，缺失标签的 video id 仍应存在并以 null 表示，按 other 口径计算。 */
  tags: Map<string, string | null>;
};

export type ContentQualitySnapshot = {
  playCount: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  /** 留存数据；旧调用方可省略，省略即按缺失处理，不会参与评级。 */
  avgPlayDuration?: number | null;
  avgPlayRatio?: number | null;
  bounceRate2s?: number | null;
  completionRate5s?: number | null;
  completionRate?: number | null;
};

export type ContentQualityWorkInput = {
  videoId: string | null;
  snapshot?: ContentQualitySnapshot;
};

export function contentQualityRules(standards?: EvaluationStandards): ContentQualityRules {
  const evaluation = standards ?? DEFAULT_EVALUATION_STANDARDS;
  return {
    dryGoods: {
      interaction: evaluation.targets.interactionRate / 100,
    },
    review: {
      interaction: evaluation.targets.interactionRate / 100,
    },
    gradeThresholds: { ...BREAKOUT_GRADE_THRESHOLDS },
    playFloors: {
      floor: KPI_PLAY_FLOOR,
      good: KPI_PLAY_GOOD,
      excellent: KPI_PLAY_EXCELLENT,
    },
    retentionBands: {
      bounceRate2s: { ...evaluation.bounceRate2s },
      completionRate5s: { ...evaluation.completionRate5s },
      avgPlayDuration: { ...evaluation.avgPlayDuration },
      avgPlayRatio: { ...evaluation.avgPlayRatio },
      completionRate: { ...evaluation.completionRate },
    },
    retentionWeights: { ...evaluation.retentionWeights },
  };
}

export function emptyWorkContentQuality(status: ContentQualityStatus): WorkContentQuality {
  return {
    topicKind: null,
    snapshotPlayCount: null,
    interactionAchievement: null,
    contentAchievement: null,
    retentionCalculation: null,
    contentGrade: null,
    retentionMetrics: null,
    overallGrade: null,
    status,
  };
}

export function buildWorkContentQualityFromMetrics(
  input: ContentQualityWorkInput,
  topics: ContentQualityTopicContext,
  standards?: EvaluationStandards,
): WorkContentQuality {
  if (!input.videoId) return emptyWorkContentQuality("unlinked");
  const topicReady = topics.state === "ready" && topics.tags.has(input.videoId);
  const topicKind = topicReady ? classifyVideoTopicKind(topics.tags.get(input.videoId)) : null;
  const targets = standards?.targets.interactionRate != null
    ? standards.targets.interactionRate / 100
    : BREAKOUT_TARGETS.review.interaction;
  const base: WorkContentQuality = {
    ...emptyWorkContentQuality("pending_snapshot"),
    topicKind,
  };
  if (!input.snapshot) return base;

  base.snapshotPlayCount = input.snapshot.playCount;
  const play = input.snapshot.playCount;
  if (play === null || !Number.isFinite(play) || play < 0) {
    base.status = "invalid_play";
    return base;
  }
  if (play === 0) {
    base.status = "invalid_play";
    return base;
  }
  if (play < KPI_PLAY_FLOOR) {
    base.overallGrade = "普";
    base.status = "rated";
  }

  const metrics = {
    play_count: input.snapshot.playCount,
    likes: input.snapshot.likes,
    comments: input.snapshot.comments,
    shares: input.snapshot.shares,
    favorites: input.snapshot.favorites,
  };
  const interaction = interactionRate(metrics);
  base.interactionAchievement = breakoutAchievement(interaction, targets);
  base.interactionValue = interaction;

  const retentionMetrics: RetentionMetrics = {
    bounceRate2s: input.snapshot.bounceRate2s ?? null,
    completionRate5s: input.snapshot.completionRate5s ?? null,
    avgPlayDuration: input.snapshot.avgPlayDuration ?? null,
    avgPlayRatio: avgPlayRatioAsPercentagePoints(input.snapshot.avgPlayRatio) ?? null,
    completionRate: input.snapshot.completionRate ?? null,
  };
  base.retentionMetrics = retentionMetrics;

  const evaluation = standards ?? DEFAULT_EVALUATION_STANDARDS;
  const averageDuration = scoreRetentionMetric(input.snapshot.avgPlayDuration, evaluation.avgPlayDuration);
  const averageRatio = scoreRetentionMetric(avgPlayRatioAsPercentagePoints(input.snapshot.avgPlayRatio), evaluation.avgPlayRatio);
  const averagePlayScore = averageDuration != null && averageRatio != null
    ? { score: (averageDuration + averageRatio) / 2, calculation: "average" as const }
    : averageDuration != null
      ? { score: averageDuration, calculation: "avg_play_duration_only" as const }
      : averageRatio != null
        ? { score: averageRatio, calculation: "avg_play_ratio_only" as const }
        : null;
  const bounce = scoreRetentionMetric(input.snapshot.bounceRate2s, evaluation.bounceRate2s, true);
  const completion5s = scoreRetentionMetric(input.snapshot.completionRate5s, evaluation.completionRate5s);
  const completion = scoreRetentionMetric(input.snapshot.completionRate, evaluation.completionRate);
  if (bounce !== null && completion5s !== null && averagePlayScore !== null && completion !== null) {
    const weights = evaluation.retentionWeights;
    base.retentionCalculation = averagePlayScore.calculation;
    base.contentAchievement =
      bounce * (weights.bounceRate2s / 100)
      + completion5s * (weights.completionRate5s / 100)
      + averagePlayScore.score * (weights.avgPlayBundle / 100)
      + completion * (weights.completionRate / 100);
    base.contentGrade = breakoutGrade(base.contentAchievement);
  }
  if (base.interactionAchievement !== null && base.contentAchievement !== null && base.contentGrade !== null) {
    const interactionGrade = breakoutGrade(base.interactionAchievement);
    base.overallGrade = interactionGrade
      ? overallBreakoutGrade(play, [
          { grade: interactionGrade, achievement: base.interactionAchievement },
          { grade: base.contentGrade, achievement: base.contentAchievement },
        ])
      : null;
  }
  if (play === 0) base.status = "invalid_play";
  else if (play < KPI_PLAY_FLOOR) base.status = "rated";
  else if (base.contentAchievement === null || base.interactionAchievement === null) base.status = "missing_metrics";
  else base.status = "rated";
  return base;
}

function scoreRetentionMetric(
  actual: number | null | undefined,
  band: { good: number; poor: number },
  lowerIsBetter = false,
): number | null {
  if (actual == null || !Number.isFinite(actual)) return null;
  if (lowerIsBetter) {
    if (actual === 0) return 200;
    return (band.good / actual) * 100;
  }
  return (actual / band.good) * 100;
}

function incrementGradeCount(
  counts: ContentQualitySummary["overallGradeCounts"],
  grade: BreakoutGrade,
) {
  if (grade === "优") counts.excellent += 1;
  else if (grade === "良") counts.good += 1;
  else counts.fair += 1;
}

export function buildContentQualitySummaryFromWorks(
  works: WorkContentQuality[],
  totalCount = works.length,
): ContentQualitySummary {
  const ratedWorks = works.filter((work) => work.overallGrade !== null);
  const eligibleWorks = works.filter((work) => (work.snapshotPlayCount ?? 0) >= KPI_PLAY_FLOOR);
  const retentionWorks = eligibleWorks.filter((work) => work.contentAchievement !== null);
  const interactionWorks = eligibleWorks.filter((work) => work.interactionAchievement !== null);
  const avg = (
    samples: WorkContentQuality[],
    field: "interactionAchievement" | "contentAchievement",
  ) => {
    return samples.length
      ? samples.reduce((sum, work) => sum + (work[field] ?? 0), 0) / samples.length
      : null;
  };
  const overallGradeCounts = { excellent: 0, good: 0, fair: 0, poor: 0 };
  for (const work of ratedWorks) incrementGradeCount(overallGradeCounts, work.overallGrade!);
  const unratedReasons = {
    unlinked: 0,
    pendingSnapshot: 0,
    invalidPlay: 0,
    missingMetrics: 0,
    topicUnavailable: 0,
  };
  for (const work of works) {
    if (work.overallGrade !== null) continue;
    if (work.status === "unlinked") unratedReasons.unlinked += 1;
    else if (work.status === "pending_snapshot") unratedReasons.pendingSnapshot += 1;
    else if (work.status === "invalid_play") unratedReasons.invalidPlay += 1;
    else if (work.status === "missing_metrics") unratedReasons.missingMetrics += 1;
  }
  const goodCount = overallGradeCounts.excellent + overallGradeCounts.good;
  return {
    totalCount,
    achievementSampleCount: retentionWorks.length,
    interactionSampleCount: interactionWorks.length,
    ratedCount: ratedWorks.length,
    unratedReasons,
    avgInteractionAchievement: avg(interactionWorks, "interactionAchievement"),
    avgContentAchievement: avg(retentionWorks, "contentAchievement"),
    overallGradeCounts,
    goodExcellentRate: ratedWorks.length ? goodCount / ratedWorks.length : null,
  };
}

export function buildContentQualityMap(
  videoIds: string[],
  snapshots: Map<string, ContentQualitySnapshot>,
  topics: ContentQualityTopicContext,
  standards?: EvaluationStandards,
): Map<string, WorkContentQuality> {
  return new Map(videoIds.map((videoId) => [
    videoId,
    buildWorkContentQualityFromMetrics({ videoId, snapshot: snapshots.get(videoId) }, topics, standards),
  ]));
}

/** 对外接口使用 Record，避免 NextResponse JSON.stringify(Map) 后变成空对象。 */
export function buildContentQualityRecord(
  videoIds: string[],
  snapshots: Map<string, ContentQualitySnapshot>,
  topics: ContentQualityTopicContext,
  standards?: EvaluationStandards,
): Record<string, WorkContentQuality> {
  return Object.fromEntries(buildContentQualityMap(videoIds, snapshots, topics, standards));
}

export type { VideoTopicKind };

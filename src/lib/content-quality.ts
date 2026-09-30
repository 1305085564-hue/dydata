import {
  BREAKOUT_GRADE_THRESHOLDS,
  BREAKOUT_TARGETS,
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
  breakoutAchievement,
  breakoutGrade,
  breakoutRating,
  breakoutTargetsFor,
  overallBreakoutGrade,
  type BreakoutGrade,
} from "@/lib/breakout-rating";
import { classifyVideoTopicKind, type VideoTopicKind } from "@/lib/topics/library";
import { favoriteRate, interactionRate, likeRate } from "@/lib/video-metrics";
import type {
  ContentQualityRules,
  ContentQualityStatus,
  ContentQualitySummary,
  WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";

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
};

export type ContentQualityWorkInput = {
  videoId: string | null;
  snapshot?: ContentQualitySnapshot;
};

export function contentQualityRules(): ContentQualityRules {
  return {
    dryGoods: {
      interaction: BREAKOUT_TARGETS.dry_goods.interaction,
      core: BREAKOUT_TARGETS.dry_goods.fourth,
    },
    review: {
      interaction: BREAKOUT_TARGETS.review.interaction,
      core: BREAKOUT_TARGETS.review.fourth,
    },
    gradeThresholds: { ...BREAKOUT_GRADE_THRESHOLDS },
    playFloors: {
      floor: KPI_PLAY_FLOOR,
      good: KPI_PLAY_GOOD,
      excellent: KPI_PLAY_EXCELLENT,
    },
  };
}

export function emptyWorkContentQuality(status: ContentQualityStatus): WorkContentQuality {
  return {
    topicKind: null,
    coreMetric: null,
    snapshotPlayCount: null,
    interactionAchievement: null,
    coreAchievement: null,
    contentAchievement: null,
    contentGrade: null,
    overallGrade: null,
    status,
  };
}

export function buildWorkContentQualityFromMetrics(
  input: ContentQualityWorkInput,
  topics: ContentQualityTopicContext,
): WorkContentQuality {
  if (!input.videoId) return emptyWorkContentQuality("unlinked");
  if (topics.state === "error" || !topics.tags.has(input.videoId)) {
    return emptyWorkContentQuality("topic_unavailable");
  }

  const topicKind = classifyVideoTopicKind(topics.tags.get(input.videoId));
  const targets = breakoutTargetsFor(topicKind);
  const coreMetric = topicKind === "dry_goods" ? "favoriteRate" : "likeRate";
  const base: WorkContentQuality = {
    ...emptyWorkContentQuality("pending_snapshot"),
    topicKind,
    coreMetric,
  };
  if (!input.snapshot) return base;

  base.snapshotPlayCount = input.snapshot.playCount;
  const play = input.snapshot.playCount;
  if (play === null || !Number.isFinite(play) || play < 0) {
    base.status = "invalid_play";
    return base;
  }

  const metrics = {
    play_count: input.snapshot.playCount,
    likes: input.snapshot.likes,
    comments: input.snapshot.comments,
    shares: input.snapshot.shares,
    favorites: input.snapshot.favorites,
  };
  const interaction = interactionRate(metrics);
  const core = topicKind === "dry_goods" ? favoriteRate(metrics) : likeRate(metrics);
  base.interactionAchievement = breakoutAchievement(interaction, targets.interaction);
  base.coreAchievement = breakoutAchievement(core, targets.fourth);

  const interactionRating = breakoutRating(interaction, targets.interaction);
  const coreRating = breakoutRating(core, targets.fourth);
  if (base.interactionAchievement !== null && base.coreAchievement !== null) {
    base.contentAchievement = (base.interactionAchievement + base.coreAchievement) / 2;
    base.contentGrade = breakoutGrade(base.contentAchievement);
  }
  base.overallGrade = overallBreakoutGrade(play, [interactionRating, coreRating]);
  if (play === 0) base.status = "invalid_play";
  else if (!interactionRating || !coreRating) base.status = "missing_metrics";
  else base.status = "rated";
  return base;
}

function incrementGradeCount(
  counts: ContentQualitySummary["overallGradeCounts"],
  grade: BreakoutGrade,
) {
  if (grade === "优") counts.excellent += 1;
  else if (grade === "良") counts.good += 1;
  else if (grade === "普") counts.fair += 1;
  else counts.poor += 1;
}

export function buildContentQualitySummaryFromWorks(
  works: WorkContentQuality[],
  totalCount = works.length,
): ContentQualitySummary {
  const ratedWorks = works.filter((work) => work.overallGrade !== null);
  const achievementWorks = works.filter(
    (work) => work.interactionAchievement !== null
      && work.coreAchievement !== null
      && work.contentAchievement !== null,
  );
  const avg = (field: "interactionAchievement" | "coreAchievement" | "contentAchievement") =>
    achievementWorks.length
      ? achievementWorks.reduce((sum, work) => sum + (work[field] ?? 0), 0) / achievementWorks.length
      : null;
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
    else if (work.status === "topic_unavailable") unratedReasons.topicUnavailable += 1;
  }
  const goodCount = overallGradeCounts.excellent + overallGradeCounts.good;
  return {
    totalCount,
    achievementSampleCount: achievementWorks.length,
    ratedCount: ratedWorks.length,
    unratedReasons,
    avgInteractionAchievement: avg("interactionAchievement"),
    avgCoreAchievement: avg("coreAchievement"),
    avgContentAchievement: avg("contentAchievement"),
    overallGradeCounts,
    goodExcellentRate: ratedWorks.length ? goodCount / ratedWorks.length : null,
  };
}

export function buildContentQualityMap(
  videoIds: string[],
  snapshots: Map<string, ContentQualitySnapshot>,
  topics: ContentQualityTopicContext,
): Map<string, WorkContentQuality> {
  return new Map(videoIds.map((videoId) => [
    videoId,
    buildWorkContentQualityFromMetrics({ videoId, snapshot: snapshots.get(videoId) }, topics),
  ]));
}

/** 对外接口使用 Record，避免 NextResponse JSON.stringify(Map) 后变成空对象。 */
export function buildContentQualityRecord(
  videoIds: string[],
  snapshots: Map<string, ContentQualitySnapshot>,
  topics: ContentQualityTopicContext,
): Record<string, WorkContentQuality> {
  return Object.fromEntries(buildContentQualityMap(videoIds, snapshots, topics));
}

export type { VideoTopicKind };

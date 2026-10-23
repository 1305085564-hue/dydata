import { useMemo } from "react";
import type { ContentReviewReadiness, VideoMetricsSnapshot } from "@/types";
import { VIDEO_REVIEW_RULE_THRESHOLDS } from "@/lib/video-review-thresholds";
import { buildReviewQueue, buildSnapshotMap, type VideoRow } from "@/lib/review-queue";
import { filterContentVideos, type ContentListFilterValue } from "@/app/(app)/admin/content/content-list-filters";
import { isHighlightRuleMapEmpty, rowMatchesAllHighlightRules } from "@/lib/content/domain/content-list-highlight";
import { toSortableRatio } from "@/lib/metric-bounds";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import type { BreakoutGrade } from "@/lib/breakout-rating";
import type { SortField } from "@/lib/content/domain/content-list";

export function buildProcessedContentRows({
  queueRows,
  filters,
  playCountById,
  snapshotMap,
  contentQualityByVideoId,
  sortField,
  sortDir,
  serverPaginated = false,
}: {
  queueRows: VideoRow[];
  filters: ContentListFilterValue;
  playCountById: Map<string, number | null>;
  snapshotMap: Map<string, VideoMetricsSnapshot>;
  contentQualityByVideoId?: Record<string, WorkContentQuality>;
  sortField: SortField;
  sortDir: "asc" | "desc";
  serverPaginated?: boolean;
}) {
    const rowsWithMetrics = (serverPaginated ? queueRows : filterContentVideos(queueRows, filters, playCountById, contentQualityByVideoId)).map((video) => {
      const snapshot = snapshotMap.get(video.id);
      const playCount = snapshot?.play_count ?? null;
      const followerGain = snapshot?.follower_gain ?? null;
      const likes = snapshot?.likes ?? null;
      const comments = snapshot?.comments ?? null;
      const shares = snapshot?.shares ?? null;
      const favorites = snapshot?.favorites ?? null;
      const totalInteraction =
        likes != null && comments != null && shares != null && favorites != null
          ? likes + comments + shares + favorites
          : null;
      const interactionRate =
        playCount && playCount > 0 && totalInteraction != null
          ? (totalInteraction / playCount) * 100
          : null;
      const publishedTime = video.published_at ? new Date(video.published_at).getTime() || 0 : 0;
      // 样本不足：播放量低于复盘达标线（与异常判定规则的 play_count 同源）时，比率类指标是噪音
      const lowSample = playCount != null && playCount < VIDEO_REVIEW_RULE_THRESHOLDS.play_count;

      const quality = contentQualityByVideoId?.[video.id] ?? null;
      const isDryGoods = quality?.topicKind === "dry_goods" || quality?.coreMetric === "favoriteRate";
      const coreMetricRate = isDryGoods
        ? (playCount && playCount > 0 && favorites != null ? (favorites / playCount) * 100 : null)
        : (playCount && playCount > 0 && likes != null ? (likes / playCount) * 100 : null);
      const coreMetricTopicText = isDryGoods
        ? "干货"
        : quality?.topicKind === "review"
          ? "复盘"
          : null;

      return {
        video,
        snapshot,
        publishedTime,
        lowSample,
        playCount,
        followerGain,
        likes,
        comments,
        shares,
        favorites,
        interactionRate,
        bounceRate2s: snapshot?.bounce_rate_2s ?? null,
        completionRate5s: snapshot?.completion_rate_5s ?? null,
        avgPlayDuration: snapshot?.avg_play_duration ?? null,
        completionRate: snapshot?.completion_rate ?? null,
        quality,
        coreMetricRate,
        coreMetricTopicText,
      };
    });

    // 「只看命中高亮的行」：行级数值此时才存在，必须在排序前过滤；
    // 多规则取交集，没设规则时开关不生效（URL 残留 hlOnly 也不改变结果）
    const hitRows = !serverPaginated && filters.highlightOnly && !isHighlightRuleMapEmpty(filters.highlightRules)
      ? rowsWithMetrics.filter((row) => rowMatchesAllHighlightRules(row, filters.highlightRules))
      : rowsWithMetrics;

    if (serverPaginated) return hitRows;
    return hitRows.sort((a, b) => compareContentRows(a, b, sortField, sortDir));

}

/** 排序只依赖行上的数值字段，单独声明以便与行类型解耦（避免相互推导成环） */
type SortableContentRow = {
  publishedTime: number;
  quality?: WorkContentQuality | null;
  coreMetricRate?: number | null;
  playCount?: number | null;
  followerGain?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  favorites?: number | null;
  interactionRate?: number | null;
  bounceRate2s?: number | null;
  completionRate5s?: number | null;
  avgPlayDuration?: number | null;
  completionRate?: number | null;
};

/** 表格行排序比较器：单日视图整页数据都在手上，服务端排序键不来自 URL 时由前端再排一次 */
export function compareContentRows(
  a: SortableContentRow,
  b: SortableContentRow,
  sortField: SortField,
  sortDir: "asc" | "desc",
): number {
  let valA: number | null = null;
  let valB: number | null = null;

  switch (sortField) {
    case "published_at":
      valA = a.publishedTime;
      valB = b.publishedTime;
      break;
    case "overall_grade": {
      const rank = (g: BreakoutGrade | null | undefined) => {
        if (g === "优") return 4;
        if (g === "良") return 3;
        if (g === "普") return 2;
        if (g === "劣") return 1;
        return 0;
      };
      valA = rank(a.quality?.overallGrade);
      valB = rank(b.quality?.overallGrade);
      break;
    }
    case "core_metric":
      valA = toSortableRatio(a.coreMetricRate);
      valB = toSortableRatio(b.coreMetricRate);
      break;
    case "play_count":
      valA = a.playCount ?? null;
      valB = b.playCount ?? null;
      break;
    case "follower_gain":
      valA = a.followerGain ?? null;
      valB = b.followerGain ?? null;
      break;
    case "likes":
      valA = a.likes ?? null;
      valB = b.likes ?? null;
      break;
    case "comments":
      valA = a.comments ?? null;
      valB = b.comments ?? null;
      break;
    case "shares":
      valA = a.shares ?? null;
      valB = b.shares ?? null;
      break;
    case "favorites":
      valA = a.favorites ?? null;
      valB = b.favorites ?? null;
      break;
    case "interaction_rate":
      valA = toSortableRatio(a.interactionRate);
      valB = toSortableRatio(b.interactionRate);
      break;
    case "bounce_rate_2s":
      valA = toSortableRatio(a.bounceRate2s);
      valB = toSortableRatio(b.bounceRate2s);
      break;
    case "completion_rate_5s":
      valA = toSortableRatio(a.completionRate5s);
      valB = toSortableRatio(b.completionRate5s);
      break;
    case "avg_play_duration":
      valA = a.avgPlayDuration ?? null;
      valB = b.avgPlayDuration ?? null;
      break;
    case "completion_rate":
      valA = toSortableRatio(a.completionRate);
      valB = toSortableRatio(b.completionRate);
      break;
    default:
      valA = a.publishedTime;
      valB = b.publishedTime;
  }

  if (valA === null && valB === null) return 0;
  if (valA === null) return 1;
  if (valB === null) return -1;

  return sortDir === "desc" ? valB - valA : valA - valB;
}

export function useContentListData({
  videos,
  snapshots,
  reviewReadiness,
  contentQualityByVideoId,
  filters,
  sortField,
  sortDir,
  serverPaginated = false,
  clientSort = false,
}: {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  reviewReadiness: Record<string, ContentReviewReadiness>;
  contentQualityByVideoId?: Record<string, WorkContentQuality>;
  filters: ContentListFilterValue;
  sortField: SortField;
  sortDir: "asc" | "desc";
  serverPaginated?: boolean;
  clientSort?: boolean;
}) {
  const snapshotMap = useMemo(() => buildSnapshotMap(snapshots), [snapshots]);

  /** 流量筛选按 video.id 查 24h 播放量；一次性投影出纯数字表，
   *  避免把 VideoMetricsSnapshot 结构泄漏进 filterContentVideos 这个纯函数。 */
  const playCountById = useMemo(() => {
    // gate:transient-map temporary call-local projection
    const map = new Map<string, number | null>();
    for (const [id, snapshot] of snapshotMap) map.set(id, snapshot?.play_count ?? null);
    return map;
  }, [snapshotMap]);

  const queueRows = useMemo(() => {
    if (serverPaginated) return videos;
    return buildReviewQueue({
      videos,
      snapshots: snapshotMap,
      reviewReadiness,
      thresholds: VIDEO_REVIEW_RULE_THRESHOLDS,
      sortMode: "priority",
    });
  }, [reviewReadiness, serverPaginated, snapshotMap, videos]);

  const processedRows = useMemo(() => {
    const rows = buildProcessedContentRows({
      queueRows,
      filters,
      playCountById,
      snapshotMap,
      contentQualityByVideoId,
      sortField,
      sortDir,
      serverPaginated,
    });
    // 单日：整页数据都在手上，服务端排序键不来自 URL 时由前端补一次真实排序
    return clientSort ? [...rows].sort((a, b) => compareContentRows(a, b, sortField, sortDir)) : rows;
  }, [filters, queueRows, snapshotMap, playCountById, contentQualityByVideoId, sortField, sortDir, serverPaginated, clientSort]);

  return { processedRows };
}

export type ProcessedContentRow = ReturnType<typeof buildProcessedContentRows>[number];

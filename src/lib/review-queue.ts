import type { ContentReviewReadiness, Video, VideoMetricsSnapshot } from "@/types";
import {
  VIDEO_REVIEW_RULE_THRESHOLDS,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";
import { buildLatestVideoSnapshotMap } from "@/lib/video-snapshot-map";

export type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
  profiles: { name: string };
};

export type QueueSortMode = "priority" | "user" | "latest";

export const statusClassName: Record<Video["anomaly_status"], string> = {
  normal: "border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  正常: "border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] text-[#6FAA7D]",
  删稿: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  限流: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  投流: "border-[#B98A54]/20 bg-[#B98A54]/[0.04] text-[#B98A54]",
  活动干预: "border-[#B98A54]/20 bg-[#B98A54]/[0.04] text-[#B98A54]",
  "未满24h": "border-[#E2E2DF] bg-[#F1F1F0] text-[#78716C]",
};

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatRate(value: number | string | null | undefined) {
  if (value == null) return "-";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "-";
  return n.toFixed(1) + "%";
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getVideoUploadTimestamp(video: VideoRow) {
  const raw = video.uploaded_at ?? video.published_at ?? video.created_at;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function getMetricWarningReasons(
  snapshot: VideoMetricsSnapshot | undefined,
  thresholds: VideoReviewThresholds = VIDEO_REVIEW_RULE_THRESHOLDS,
): string[] {
  const reasons: string[] = [];
  if (!snapshot) return ["缺少 24h 快照"];
  if (snapshot.play_count != null && snapshot.play_count < thresholds.play_count) {
    reasons.push(`播放 ${formatNumber(snapshot.play_count)}`);
  }
  if (snapshot.bounce_rate_2s != null && snapshot.bounce_rate_2s > thresholds.bounce_rate_2s) {
    reasons.push(`2s跳出 ${formatRate(snapshot.bounce_rate_2s)}`);
  }
  if (snapshot.completion_rate_5s != null && snapshot.completion_rate_5s < thresholds.completion_rate_5s) {
    reasons.push(`5s完播 ${formatRate(snapshot.completion_rate_5s)}`);
  }
  if (snapshot.avg_play_duration != null && snapshot.avg_play_duration < thresholds.avg_play_duration) {
    reasons.push(`均播 ${snapshot.avg_play_duration.toFixed(1)}s`);
  }
  if (snapshot.completion_rate != null && snapshot.completion_rate < thresholds.completion_rate) {
    reasons.push(`完播 ${formatRate(snapshot.completion_rate)}`);
  }
  return reasons;
}

export function getPriorityScore(
  video: VideoRow,
  snapshot: VideoMetricsSnapshot | undefined,
  readiness: ContentReviewReadiness | undefined,
  thresholds: VideoReviewThresholds = VIDEO_REVIEW_RULE_THRESHOLDS,
): number {
  let score = 0;
  if (video.anomaly_status === "删稿" || video.anomaly_status === "限流") score += 1000;
  if (video.play_change_signal === "halve") score += 800;
  if (video.play_change_signal === "surge") score += 400;
  if (video.anomaly_status === "投流" || video.anomaly_status === "活动干预") score += 200;
  if (
    readiness?.status === "missing_snapshot" ||
    readiness?.status === "missing_content" ||
    readiness?.status === "missing_segments"
  ) score += 20;
  score += getMetricWarningReasons(snapshot, thresholds).length * 80;
  return score;
}

export function buildSnapshotMap(snapshots: VideoMetricsSnapshot[]): Map<string, VideoMetricsSnapshot> {
  return buildLatestVideoSnapshotMap(snapshots);
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 发布时间的口径与列表「发布时间」列一致（published_at 优先），不是上传时间口径 */
export function getVideoPublishedTimestamp(video: VideoRow): number {
  const raw = video.published_at ?? video.uploaded_at ?? video.created_at;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

/** 上海自然日「昨天」的时间窗 [昨天 00:00, 今天 00:00)，用于把队列圈到昨天发的稿子 */
export function getShanghaiYesterdayWindow(now: Date = new Date()): { start: number; end: number } {
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const todayStart =
    Date.UTC(shanghaiNow.getUTCFullYear(), shanghaiNow.getUTCMonth(), shanghaiNow.getUTCDate()) -
    SHANGHAI_OFFSET_MS;
  return { start: todayStart - DAY_MS, end: todayStart };
}

/** 最近 N 个上海自然日（含今天）的窗口起点：daysAgo=1 即「从昨天 00:00 起」 */
export function getShanghaiRecentWindowStart(daysAgo: number, now: Date = new Date()): number {
  return getShanghaiYesterdayWindow(now).end - (daysAgo - 1) * DAY_MS;
}

export function isVideoPublishedYesterday(video: VideoRow, now: Date = new Date()): boolean {
  const { start, end } = getShanghaiYesterdayWindow(now);
  const ts = getVideoPublishedTimestamp(video);
  return ts >= start && ts < end;
}

/** 发布时间是否落在最近 daysAgo 个上海自然日（含今天）内 */
export function isVideoPublishedWithinRecentDays(
  video: VideoRow,
  daysAgo: number,
  now: Date = new Date(),
): boolean {
  const ts = getVideoPublishedTimestamp(video);
  return ts >= getShanghaiRecentWindowStart(daysAgo, now) && ts < getShanghaiYesterdayWindow(now).end;
}

/**
 * 「直接去盘」的靶子。这个按钮的用法是「早上盘昨天的稿」，所以靶子必须落在近期：
 *   1. 昨天（上海自然日）发布的异常作品，按优先级取最高；
 *   2. 昨天没有异常时，退到「最近 7 天发布的异常」（与团队参照窗口同一口径）——
 *      生产实测：09-21 发布的 4 条全是 normal，即昨天经常**真的没有**异常，
 *      此时若直接退到存量最高优先，就会天天打开几个月前的老稿（05.13 那条限流稿就是这么来的）；
 *   3. 近 7 天也没有异常，才回退存量最高优先，保证按钮永远有靶子。
 * 入参 anomalies 需已按优先级降序（即 anomalyVideos 的顺序）。
 */
export const DIRECT_REVIEW_RECENT_WINDOW_DAYS = 7;

export function pickDirectReviewTarget<T extends VideoRow>(
  anomalies: T[],
  now: Date = new Date(),
): T | undefined {
  if (anomalies.length === 0) return undefined;
  return (
    anomalies.find((video) => isVideoPublishedYesterday(video, now)) ??
    anomalies.find((video) =>
      isVideoPublishedWithinRecentDays(video, DIRECT_REVIEW_RECENT_WINDOW_DAYS, now),
    ) ??
    anomalies[0]
  );
}

export interface BuildReviewQueueOptions {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[] | Map<string, VideoMetricsSnapshot>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  thresholds?: VideoReviewThresholds;
  sortMode?: QueueSortMode;
}

export function buildReviewQueue({
  videos,
  snapshots,
  reviewReadiness,
  thresholds = VIDEO_REVIEW_RULE_THRESHOLDS,
  sortMode = "priority",
}: BuildReviewQueueOptions): VideoRow[] {
  const snapshotMap = snapshots instanceof Map ? snapshots : buildSnapshotMap(snapshots);

  return [...videos].sort((left, right) => {
    if (sortMode === "user") {
      const nameDiff = (left.profiles?.name || "").localeCompare(right.profiles?.name || "", "zh");
      if (nameDiff !== 0) return nameDiff;
      return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
    }
    if (sortMode === "latest") {
      return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
    }
    const leftScore = getPriorityScore(
      left,
      snapshotMap.get(left.id),
      reviewReadiness[left.id],
      thresholds,
    );
    const rightScore = getPriorityScore(
      right,
      snapshotMap.get(right.id),
      reviewReadiness[right.id],
      thresholds,
    );
    if (rightScore !== leftScore) return rightScore - leftScore;
    return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
  });
}

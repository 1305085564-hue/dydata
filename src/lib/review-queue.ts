import type { ContentReviewReadiness, Video, VideoMetricsSnapshot } from "@/types";
import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";

export type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

export type QueueSortMode = "priority" | "user" | "latest";

export const statusClassName: Record<Video["anomaly_status"], string> = {
  normal: "border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  正常: "border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] text-[#6FAA7D]",
  删稿: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  限流: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  投流: "border-[#D99E55]/20 bg-[#D99E55]/[0.04] text-[#D99E55]",
  活动干预: "border-[#D99E55]/20 bg-[#D99E55]/[0.04] text-[#D99E55]",
  "未满24h": "border-[#E5E0D6] bg-[#F5F3EE]/50 text-[#78716C]",
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
  thresholds: VideoReviewThresholds = DEFAULT_VIDEO_REVIEW_THRESHOLDS,
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
  thresholds: VideoReviewThresholds = DEFAULT_VIDEO_REVIEW_THRESHOLDS,
): number {
  let score = 0;
  if (video.anomaly_status === "删稿" || video.anomaly_status === "限流") score += 1000;
  if (video.play_change_signal === "halve") score += 800;
  if (video.play_change_signal === "surge") score += 400;
  if (video.anomaly_status === "投流" || video.anomaly_status === "活动干预") score += 200;
  if (!readiness?.has_analysis) score += 120;
  if (
    readiness?.status === "missing_snapshot" ||
    readiness?.status === "missing_content" ||
    readiness?.status === "missing_segments"
  ) score += 20;
  score += getMetricWarningReasons(snapshot, thresholds).length * 80;
  return score;
}

export function buildSnapshotMap(snapshots: VideoMetricsSnapshot[]): Map<string, VideoMetricsSnapshot> {
  const map = new Map<string, VideoMetricsSnapshot>();
  for (const snapshot of snapshots) {
    if (snapshot.snapshot_type !== "24h") continue;
    const existing = map.get(snapshot.video_id);
    const nextTs = new Date(snapshot.captured_at).getTime();
    const currentTs = existing ? new Date(existing.captured_at).getTime() : -Infinity;
    if (!existing || nextTs > currentTs) map.set(snapshot.video_id, snapshot);
  }
  return map;
}

export interface BuildReviewQueueOptions {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[] | Map<string, VideoMetricsSnapshot>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  thresholds?: VideoReviewThresholds;
  sortMode?: QueueSortMode;
  filterMode?: "queue" | "all";
}

export function buildReviewQueue({
  videos,
  snapshots,
  reviewReadiness,
  thresholds = DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  sortMode = "priority",
  filterMode = "all",
}: BuildReviewQueueOptions): VideoRow[] {
  const snapshotMap = snapshots instanceof Map ? snapshots : buildSnapshotMap(snapshots);
  const rows = filterMode === "queue"
    ? videos.filter((video) => {
        const readiness = reviewReadiness[video.id];
        const hasAnomaly =
          video.anomaly_status !== "normal" &&
          video.anomaly_status !== "正常" ||
          video.play_change_signal === "halve" ||
          video.play_change_signal === "surge";
        const hasIncompleteData =
          !readiness ||
          readiness.status === "missing_snapshot" ||
          readiness.status === "missing_content" ||
          readiness.status === "missing_segments";
        return hasAnomaly || hasIncompleteData || !readiness.has_analysis;
      })
    : videos;

  return [...rows].sort((left, right) => {
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

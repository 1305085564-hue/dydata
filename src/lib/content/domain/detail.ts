import type { Video } from "@/types";
import { isImpossibleRatio } from "@/lib/metric-bounds";
import { VIDEO_REVIEW_COLOR_MIN_PLAY, VIDEO_REVIEW_RULE_THRESHOLDS } from "@/lib/video-review-thresholds";

export type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
  trashed_by_name?: string | null;
};

export type StatusBadgeVariant = "success" | "danger" | "warning" | "accent" | "secondary" | "neutral";

/**
 * 视频状态徽标配置。已下线类型（投流/活动干预）不在这里单独列：统一先经
 * `resolveVideoStatusLabel()` 收敛成中文标签，「投流」「活动干预」两个历史标签
 * 由同一个映射函数给出（见 `src/lib/video-anomaly.ts`）。
 */
export const statusBadgeConfig: Record<string, { label: string; variant: StatusBadgeVariant }> =
  {
    normal: {
      label: "正常",
      variant: "neutral",
    },
    abnormal: {
      label: "异常",
      variant: "danger",
    },
    正常: {
      label: "正常",
      variant: "neutral",
    },
    异常: {
      label: "异常",
      variant: "danger",
    },
    删稿: {
      label: "删稿",
      variant: "danger",
    },
    deleted: {
      label: "删稿",
      variant: "danger",
    },
    限流: {
      label: "限流",
      variant: "danger",
    },
    limited: {
      label: "限流",
      variant: "danger",
    },
    未满24h: {
      label: "未满24h",
      variant: "warning",
    },
    under_24h: {
      label: "未满24h",
      variant: "warning",
    },
    pending: {
      label: "未满24h",
      variant: "warning",
    },
  };

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPercentagePoints(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  return `${seconds.toFixed(1)} s`;
}

/** 爆款标准线文案：按当前话题标准线格式化为百分比。 */
export function formatTarget(target: number) {
  return `${Number((target * 100).toFixed(2))}%`;
}

/** 2s 跳出率动态颜色：低样本降灰；≤优质线绿、≥预警线红。 */
export function getBounceRate2sClass(value: number | null | undefined, playCount?: number | null): string {
  if (value == null) return "text-[#141413]";
  if (isImpossibleRatio(value)) return "text-status-danger";
  if (playCount != null && playCount < VIDEO_REVIEW_COLOR_MIN_PLAY) return "text-[#A8A29E]";
  if (value <= VIDEO_REVIEW_RULE_THRESHOLDS.excellent.bounce_rate_2s) return "text-status-success";
  if (value >= VIDEO_REVIEW_RULE_THRESHOLDS.poor.bounce_rate_2s) return "text-status-danger";
  return "text-[#141413]";
}

/** 5s 完播率动态颜色：低样本降灰；≥优质线绿、≤预警线红。 */
export function getCompletionRate5sClass(value: number | null | undefined, playCount?: number | null): string {
  if (value == null) return "text-[#141413]";
  if (isImpossibleRatio(value)) return "text-status-danger";
  if (playCount != null && playCount < VIDEO_REVIEW_COLOR_MIN_PLAY) return "text-[#A8A29E]";
  if (value >= VIDEO_REVIEW_RULE_THRESHOLDS.excellent.completion_rate_5s) return "text-status-success";
  if (value <= VIDEO_REVIEW_RULE_THRESHOLDS.poor.completion_rate_5s) return "text-status-danger";
  return "text-[#141413]";
}

/** 完播率动态颜色：低样本降灰；≥优质线绿、≤预警线红。 */
export function getCompletionRateClass(value: number | null | undefined, playCount?: number | null): string {
  if (value == null) return "text-[#141413]";
  if (isImpossibleRatio(value)) return "text-status-danger";
  if (playCount != null && playCount < VIDEO_REVIEW_COLOR_MIN_PLAY) return "text-[#A8A29E]";
  if (value >= VIDEO_REVIEW_RULE_THRESHOLDS.excellent.completion_rate) return "text-status-success";
  if (value <= VIDEO_REVIEW_RULE_THRESHOLDS.poor.completion_rate) return "text-status-danger";
  return "text-[#141413]";
}

/** 平均播放时长动态颜色：低样本降灰；≥优质线绿、≤预警线红。 */
export function getAvgPlayDurationClass(value: number | null | undefined, playCount?: number | null): string {
  if (value == null) return "text-[#141413]";
  if (playCount != null && playCount < VIDEO_REVIEW_COLOR_MIN_PLAY) return "text-[#A8A29E]";
  if (value >= VIDEO_REVIEW_RULE_THRESHOLDS.excellent.avg_play_duration) return "text-status-success";
  if (value <= VIDEO_REVIEW_RULE_THRESHOLDS.poor.avg_play_duration) return "text-status-danger";
  return "text-[#141413]";
}

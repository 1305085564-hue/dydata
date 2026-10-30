import type { Video } from "@/types";
import { isImpossibleRatio } from "@/lib/metric-bounds";
import { DEFAULT_EVALUATION_STANDARDS, evaluationTone, type EvaluationMetric, type EvaluationStandards } from "@/lib/evaluation-standards";

export type VideoRow = Video & {
  accounts: { name: string; profile_id?: string | null };
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

/** 列表与详情共用公司标准；异常比率优先提示，样本不足降灰。 */
function metricClass(metric: EvaluationMetric, value: number | null | undefined, playCount: number | null | undefined, standards: EvaluationStandards, ratio = true): string {
  if (value == null) return "text-[#141413]";
  if (ratio && isImpossibleRatio(value)) return "text-status-danger";
  if (playCount != null && playCount < standards.minPlayCount) return "text-[#A8A29E]";
  const tone = evaluationTone(metric, value, playCount, standards);
  return tone === "good" ? "text-status-danger" : tone === "poor" ? "text-status-success" : "text-[#141413]";
}

export function getBounceRate2sClass(value: number | null | undefined, playCount?: number | null, standards = DEFAULT_EVALUATION_STANDARDS) {
  return metricClass("bounceRate2s", value, playCount, standards);
}
export function getCompletionRate5sClass(value: number | null | undefined, playCount?: number | null, standards = DEFAULT_EVALUATION_STANDARDS) {
  return metricClass("completionRate5s", value, playCount, standards);
}
export function getCompletionRateClass(value: number | null | undefined, playCount?: number | null, standards = DEFAULT_EVALUATION_STANDARDS) {
  return metricClass("completionRate", value, playCount, standards);
}
export function getAvgPlayDurationClass(value: number | null | undefined, playCount?: number | null, standards = DEFAULT_EVALUATION_STANDARDS) {
  return metricClass("avgPlayDuration", value, playCount, standards, false);
}
export function getCoreAchievementClass(achievement: number | null | undefined, playCount?: number | null, standards = DEFAULT_EVALUATION_STANDARDS, metric: "coreAchievement" | "interactionAchievement" = "coreAchievement"): string {
  const tone = evaluationTone(metric, achievement, playCount, standards);
  return tone === "good" ? "text-status-danger" : tone === "poor" ? "text-status-success" : "";
}

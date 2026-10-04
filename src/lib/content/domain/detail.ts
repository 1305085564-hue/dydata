import type { Video } from "@/types";

export type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
  trashed_by_name?: string | null;
};

export type StatusBadgeVariant = "success" | "danger" | "warning" | "accent" | "secondary";

/**
 * 视频状态徽标配置。已下线类型（投流/活动干预）不在这里单独列：统一先经
 * `resolveVideoStatusLabel()` 收敛成中文标签，「投流」「活动干预」两个历史标签
 * 由同一个映射函数给出（见 `src/lib/video-anomaly.ts`）。
 */
export const statusBadgeConfig: Record<string, { label: string; variant: StatusBadgeVariant }> =
  {
    normal: {
      label: "正常",
      variant: "success",
    },
    abnormal: {
      label: "异常",
      variant: "danger",
    },
    正常: {
      label: "正常",
      variant: "success",
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
    腰斩: {
      label: "腰斩",
      variant: "warning",
    },
    halve: {
      label: "腰斩",
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

/** 2s 跳出率动态预警色：>=30 绿，<=25 红，中间中性 */
export function getBounceRate2sClass(value: number | null | undefined): string {
  if (value == null) return "text-[#141413]";
  if (value >= 30) return "text-status-success";
  if (value <= 25) return "text-status-danger";
  return "text-[#141413]";
}

/** 5s 完播率动态预警色：>=55 红，<=50 绿，中间中性 */
export function getCompletionRate5sClass(value: number | null | undefined): string {
  if (value == null) return "text-[#141413]";
  if (value >= 55) return "text-status-danger";
  if (value <= 50) return "text-status-success";
  return "text-[#141413]";
}

/** 完播率动态预警色：>=10 红，<=4 绿（4以下），中间中性 */
export function getCompletionRateClass(value: number | null | undefined): string {
  if (value == null) return "text-[#141413]";
  if (value >= 10) return "text-status-danger";
  if (value <= 4) return "text-status-success";
  return "text-[#141413]";
}

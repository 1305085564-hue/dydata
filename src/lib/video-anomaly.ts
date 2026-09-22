export type CanonicalVideoAnomalyStatus = "normal" | "abnormal";

export type VideoPunishType =
  | "limited"
  | "deleted"
  | "paid_boost"
  | "campaign_intervention"
  | "other";

export const VIDEO_ABNORMAL_STATUS_VALUES = ["abnormal", "异常", "限流", "删稿", "投流", "活动干预"] as const;
export const VIDEO_LEGACY_PUNISH_TYPE_BY_STATUS: Record<string, VideoPunishType> = {
  "限流": "limited",
  "删稿": "deleted",
  "投流": "paid_boost",
  "活动干预": "campaign_intervention",
};

export function normalizeVideoAnomalyStatus(value: unknown): CanonicalVideoAnomalyStatus {
  if (typeof value !== "string") return "normal";
  const normalized = value.trim();
  if (!normalized) return "normal";
  if ((VIDEO_ABNORMAL_STATUS_VALUES as readonly string[]).includes(normalized)) return "abnormal";
  return "normal";
}

export function isVideoAbnormal(value: unknown) {
  return normalizeVideoAnomalyStatus(value) === "abnormal";
}

export function normalizeVideoPunishType(value: unknown): VideoPunishType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;

  if (["limited", "deleted", "paid_boost", "campaign_intervention", "other"].includes(normalized)) {
    return normalized as VideoPunishType;
  }

  return VIDEO_LEGACY_PUNISH_TYPE_BY_STATUS[normalized] ?? null;
}

export function deriveVideoPunishType({
  punishType,
  anomalyStatus,
}: {
  punishType?: unknown;
  anomalyStatus?: unknown;
}) {
  return normalizeVideoPunishType(punishType) ?? normalizeVideoPunishType(anomalyStatus);
}

/**
 * 列表「状态」徽标与提醒条 tooltip 共用的唯一标签映射。
 * 优先级与列表徽标一致：删稿/限流 > 腰斩信号 > 异常 > 投流 > 活动干预 > 正常 > 未满24h。
 * 修掉的是「同一个视频在列表显示腰斩、在 title 里显示原始库值 normal」这类两名并存，
 * 以及 tooltip 直接把英文枚举（normal/abnormal）打给用户看的问题。
 */
export function resolveVideoStatusLabel({
  anomalyStatus,
  playChangeSignal,
}: {
  anomalyStatus?: unknown;
  playChangeSignal?: unknown;
}): string {
  const status = typeof anomalyStatus === "string" ? anomalyStatus.trim() : "";
  if (status === "deleted" || status === "删稿") return "删稿";
  if (status === "limited" || status === "限流") return "限流";
  if (playChangeSignal === "halve") return "腰斩";
  // 空状态沿用列表原有兜底口径（未满24h），不在这里改成「正常」
  if (!status) return "未满24h";
  return formatAnomalyStatusText(status);
}

/** 提醒条分桶：与列表徽标同优先级，一条视频只进一个桶，保证「总数 = 各桶相加」 */
export type VideoAnomalyBucket = "deleted" | "limited" | "boosted" | "abnormal" | "halved";

export function classifyVideoAnomalyBucket(video: {
  anomaly_status?: unknown;
  play_change_signal?: unknown;
}): VideoAnomalyBucket | null {
  const status = typeof video.anomaly_status === "string" ? video.anomaly_status.trim() : "";
  if (status === "deleted" || status === "删稿") return "deleted";
  if (status === "limited" || status === "限流") return "limited";
  if (status === "traffic_boost" || status === "paid_boost" || status === "投流") return "boosted";
  if (status === "activity_boost" || status === "campaign_intervention" || status === "活动干预") {
    return "boosted";
  }
  if (status === "abnormal" || status === "异常") return "abnormal";
  // 腰斩是独立信号：仅在没有异常状态可归类时才单独成桶，否则会把一条视频算进两个桶
  if (video.play_change_signal === "halve") return "halved";
  return null;
}

export function formatAnomalyStatusText(status: string | null | undefined): string {
  if (!status) return "正常";
  const s = status.trim();
  if (s === "normal" || s === "正常") return "正常";
  if (s === "abnormal" || s === "异常") return "异常";
  if (s === "limited" || s === "限流") return "限流";
  if (s === "deleted" || s === "删稿") return "删稿";
  if (s === "traffic_boost" || s === "paid_boost" || s === "投流") return "投流";
  if (s === "activity_boost" || s === "campaign_intervention" || s === "活动干预") return "活动干预";
  if (s === "under_24h" || s === "pending" || s === "未满24h") return "未满24h";
  if (s === "halve" || s === "腰斩") return "腰斩";
  return s;
}


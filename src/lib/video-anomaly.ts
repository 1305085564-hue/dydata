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


export type CanonicalVideoAnomalyStatus = "normal" | "abnormal";

export type VideoPunishType = "limited" | "deleted" | "other";

/** 现役异常状态：新录入只接受这几档（工作台录入下拉已收敛为「限流」「删稿」）。 */
export const VIDEO_ABNORMAL_STATUS_VALUES = ["abnormal", "异常", "限流", "删稿"] as const;

/**
 * 已下线处罚类型 —— 本文件是全仓唯一保存这两个历史类型的地方（2026-09-26）。
 *
 * 业务已确认现役选项只有「限流」「删稿」。这两个类型只服务「读旧行」：生产 `videos` 表
 * 当前 0 条命中（`anomaly_status` / `punish_type` 均已只读核对），保留是为了旧备份或历史行
 * 不炸、不丢。任何写入口都必须先用 `findRetiredVideoAnomalyInput()` 拒绝，不得再写入。
 * 数据库 CHECK 约束仍允许旧值（历史 migration 不改写），收紧需单独的前向 migration。
 */
export const RETIRED_VIDEO_ANOMALY_STATUS_VALUES = ["投流", "活动干预"] as const;

/** 英文枚举 / 中文旧值 → 用户能看懂的中文历史标签。 */
const RETIRED_VIDEO_ANOMALY_LABELS: Record<string, string> = {
  投流: "投流",
  traffic_boost: "投流",
  paid_boost: "投流",
  活动干预: "活动干预",
  activity_boost: "活动干预",
  campaign_intervention: "活动干预",
};

function isRetiredLabel(value: string): string | null {
  return RETIRED_VIDEO_ANOMALY_LABELS[value] ?? null;
}

/** 异常读口径：现役异常 + 已下线历史值一律算异常（与 docs/数据口径.md 的「读模型映射为异常」一致）。 */
const ABNORMAL_READ_STATUS_VALUES: readonly string[] = [
  ...VIDEO_ABNORMAL_STATUS_VALUES,
  ...RETIRED_VIDEO_ANOMALY_STATUS_VALUES,
];

export function isRetiredVideoAnomalyStatus(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return isRetiredLabel(value.trim()) !== null;
}

/**
 * 写入守卫：请求里带上了已下线的处罚类型时返回可读的中文名，否则返回 null。
 * 调用方必须据此拒绝请求，不能静默归一化（静默会把「投流」悄悄变成「异常」或「正常」）。
 */
export function findRetiredVideoAnomalyInput({
  anomalyStatus,
  punishType,
}: {
  anomalyStatus?: unknown;
  punishType?: unknown;
}): string | null {
  for (const value of [anomalyStatus, punishType]) {
    if (typeof value !== "string") continue;
    const label = isRetiredLabel(value.trim());
    if (label) return label;
  }
  return null;
}

export const VIDEO_LEGACY_PUNISH_TYPE_BY_STATUS: Record<string, VideoPunishType> = {
  "限流": "limited",
  "删稿": "deleted",
};

export function normalizeVideoAnomalyStatus(value: unknown): CanonicalVideoAnomalyStatus {
  if (typeof value !== "string") return "normal";
  const normalized = value.trim();
  if (!normalized) return "normal";
  if (ABNORMAL_READ_STATUS_VALUES.includes(normalized)) return "abnormal";
  return "normal";
}

export function isVideoAbnormal(value: unknown) {
  return normalizeVideoAnomalyStatus(value) === "abnormal";
}

export function normalizeVideoPunishType(value: unknown): VideoPunishType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;

  if (["limited", "deleted", "other"].includes(normalized)) {
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
 * 优先级与列表徽标一致：删稿/限流 > 腰斩信号 > 异常 > 正常 > 未满24h。
 * 已下线类型（投流/活动干预）按读口径归入「异常」桶显示，但徽标仍按中文历史标签显示，
 * 保证旧行不炸、不丢、不打英文枚举给用户。
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
export type VideoAnomalyBucket = "deleted" | "limited" | "abnormal" | "halved";

export function classifyVideoAnomalyBucket(video: {
  anomaly_status?: unknown;
  play_change_signal?: unknown;
}): VideoAnomalyBucket | null {
  const status = typeof video.anomaly_status === "string" ? video.anomaly_status.trim() : "";
  if (status === "deleted" || status === "删稿") return "deleted";
  if (status === "limited" || status === "限流") return "limited";
  // 已下线类型（投流/活动干预）不再单独成桶，按读口径记入「异常」，旧行不会从提醒条里消失
  if (status === "abnormal" || status === "异常" || isRetiredVideoAnomalyStatus(status)) return "abnormal";
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
  // 历史行兼容：现役录入已无这两项，旧行仍按原中文标签显示，不打英文枚举给用户
  const retiredLabel = isRetiredLabel(s);
  if (retiredLabel) return retiredLabel;
  if (s === "under_24h" || s === "pending" || s === "未满24h") return "未满24h";
  if (s === "halve" || s === "腰斩") return "腰斩";
  return s;
}


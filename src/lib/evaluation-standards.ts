import { BREAKOUT_TARGETS } from "@/lib/breakout-rating";
import { VIDEO_REVIEW_COLOR_MIN_PLAY, VIDEO_REVIEW_RULE_THRESHOLDS } from "@/lib/video-review-thresholds";

export type EvaluationBand = { good: number; poor: number };
export type EvaluationMetric = "bounceRate2s" | "completionRate5s" | "avgPlayDuration" | "avgPlayRatio" | "completionRate" | "coreAchievement" | "interactionAchievement";
export type RetentionWeightKey = "bounceRate2s" | "completionRate5s" | "avgPlayBundle" | "completionRate";
export type EvaluationStandards = Record<EvaluationMetric, EvaluationBand> & {
  minPlayCount: number;
  /** 留存总分四项权重，百分数输入且合计必须为 100。均播时长与平均播放占比共用 avgPlayBundle。 */
  retentionWeights: Record<RetentionWeightKey, number>;
  /** 百分数输入，2 表示 2%。 */
  targets: { reviewLikeRate: number; dryFavoriteRate: number; interactionRate: number; followerRate: number };
};

export const EVALUATION_METRICS: ReadonlyArray<{ key: EvaluationMetric; label: string; unit: string; lowerIsBetter?: boolean; max: number }> = [
  { key: "bounceRate2s", label: "2 秒跳出率", unit: "%", lowerIsBetter: true, max: 100 },
  { key: "completionRate5s", label: "5 秒完播率", unit: "%", max: 100 },
  { key: "avgPlayDuration", label: "均播时长", unit: "秒", max: 86400 },
  { key: "avgPlayRatio", label: "平均播放占比", unit: "%", max: 100 },
  { key: "completionRate", label: "整体完播率", unit: "%", max: 100 },
  { key: "coreAchievement", label: "核心指标达成率", unit: "%", max: 10000 },
  { key: "interactionAchievement", label: "互动率达成率", unit: "%", max: 10000 },
];

export const RETENTION_WEIGHT_FIELDS: ReadonlyArray<{ key: RetentionWeightKey; label: string }> = [
  { key: "bounceRate2s", label: "2 秒跳出率" },
  { key: "completionRate5s", label: "5 秒完播率" },
  { key: "avgPlayBundle", label: "均播时长 + 平均播放占比" },
  { key: "completionRate", label: "整体完播率" },
];

export const DEFAULT_RETENTION_WEIGHTS: Record<RetentionWeightKey, number> = {
  bounceRate2s: 35,
  completionRate5s: 30,
  avgPlayBundle: 20,
  completionRate: 15,
};

export const DEFAULT_EVALUATION_STANDARDS: EvaluationStandards = {
  minPlayCount: VIDEO_REVIEW_COLOR_MIN_PLAY,
  retentionWeights: { ...DEFAULT_RETENTION_WEIGHTS },
  bounceRate2s: { good: VIDEO_REVIEW_RULE_THRESHOLDS.excellent.bounce_rate_2s, poor: VIDEO_REVIEW_RULE_THRESHOLDS.poor.bounce_rate_2s },
  completionRate5s: { good: VIDEO_REVIEW_RULE_THRESHOLDS.excellent.completion_rate_5s, poor: VIDEO_REVIEW_RULE_THRESHOLDS.poor.completion_rate_5s },
  avgPlayDuration: { good: VIDEO_REVIEW_RULE_THRESHOLDS.excellent.avg_play_duration, poor: VIDEO_REVIEW_RULE_THRESHOLDS.poor.avg_play_duration },
  avgPlayRatio: { good: VIDEO_REVIEW_RULE_THRESHOLDS.excellent.avg_play_ratio, poor: VIDEO_REVIEW_RULE_THRESHOLDS.poor.avg_play_ratio },
  completionRate: { good: VIDEO_REVIEW_RULE_THRESHOLDS.excellent.completion_rate, poor: VIDEO_REVIEW_RULE_THRESHOLDS.poor.completion_rate },
  coreAchievement: { good: 100, poor: 60 },
  interactionAchievement: { good: 100, poor: 60 },
  targets: {
    reviewLikeRate: BREAKOUT_TARGETS.review.fourth * 100,
    dryFavoriteRate: BREAKOUT_TARGETS.dry_goods.fourth * 100,
    interactionRate: Number((BREAKOUT_TARGETS.review.interaction * 100).toFixed(6)),
    followerRate: BREAKOUT_TARGETS.review.follower * 100,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function inRange(value: unknown, max: number, positive = false): value is number {
  return typeof value === "number" && Number.isFinite(value) && (positive ? value > 0 : value >= 0) && value <= max;
}

/** 保存与数据库读取共用严格校验；无记录才用默认，坏记录不能静默回落。 */
export function parseEvaluationStandards(input: unknown): { success: true; data: EvaluationStandards } | { success: false; error: string } {
  if (!isRecord(input)) return { success: false, error: "评价标准格式不正确" };
  // 兼容新增字段前已保存的公司配置；仅补齐此版本新增项，旧字段仍完整严格校验。
  const standardsWithRatio = Object.prototype.hasOwnProperty.call(input, "avgPlayRatio")
    ? input
    : { ...input, avgPlayRatio: DEFAULT_EVALUATION_STANDARDS.avgPlayRatio };
  const standards = Object.prototype.hasOwnProperty.call(standardsWithRatio, "retentionWeights")
    ? standardsWithRatio
    : { ...standardsWithRatio, retentionWeights: DEFAULT_RETENTION_WEIGHTS };
  const expected = new Set(["minPlayCount", "targets", "retentionWeights", ...EVALUATION_METRICS.map(({ key }) => key)]);
  if (Object.keys(standards).some((key) => !expected.has(key))) return { success: false, error: "包含未知的评价标准" };
  if (!inRange(standards.minPlayCount, 1e9) || !Number.isInteger(standards.minPlayCount)) return { success: false, error: "播放量门槛须为 0～10 亿的整数" };
  for (const metric of EVALUATION_METRICS) {
    const band = standards[metric.key];
    if (!isRecord(band) || Object.keys(band).some((key) => key !== "good" && key !== "poor") || !inRange(band.good, metric.max) || !inRange(band.poor, metric.max)) {
      return { success: false, error: `${metric.label}请填写 0～${metric.max} 的数字` };
    }
    if (metric.lowerIsBetter ? band.good >= band.poor : band.good <= band.poor) {
      return { success: false, error: `${metric.label}的好、差标准不能重叠` };
    }
  }
  const retentionWeights = standards.retentionWeights;
  const retentionWeightKeys = RETENTION_WEIGHT_FIELDS.map(({ key }) => key);
  if (
    !isRecord(retentionWeights)
    || Object.keys(retentionWeights).some((key) => !retentionWeightKeys.includes(key as RetentionWeightKey))
    || retentionWeightKeys.some((key) => !inRange(retentionWeights[key], 100))
    || Math.abs(retentionWeightKeys.reduce((sum, key) => sum + Number(retentionWeights[key]), 0) - 100) > 1e-6
  ) {
    return { success: false, error: "留存数据权重必须是 0～100 的数字，且合计为 100%" };
  }
  const targets = standards.targets;
  const targetKeys = Object.keys(DEFAULT_EVALUATION_STANDARDS.targets);
  if (!isRecord(targets) || Object.keys(targets).some((key) => !targetKeys.includes(key)) || targetKeys.some((key) => !inRange(targets[key], 100, true))) {
    return { success: false, error: "达标基准须大于 0 且不超过 100%" };
  }
  return { success: true, data: structuredClone(standards) as EvaluationStandards };
}

export function evaluationSettingsKey(teamId: string | null | undefined): string {
  if (!teamId) throw new Error("缺少公司归属，无法读取评价标准");
  return `evaluation_standards:${teamId}`;
}

/** 快照的 avg_play_ratio 以 0–1 小数存储；标准输入和页面显示使用百分数。 */
export function avgPlayRatioAsPercentagePoints(value: number | null | undefined): number | null | undefined {
  return value == null ? value : value * 100;
}

export function canEditEvaluationStandards(identity: { companyRole?: string | null; permissions: { manage_system?: boolean } }): boolean {
  return identity.companyRole === "company_owner" && identity.permissions.manage_system === true;
}

export function evaluationTone(metric: EvaluationMetric, value: number | null | undefined, playCount: number | null | undefined, standards: EvaluationStandards): "good" | "poor" | "normal" {
  if (value == null || !Number.isFinite(value) || (playCount != null && playCount < standards.minPlayCount)) return "normal";
  const band = standards[metric];
  if (metric === "bounceRate2s") {
    if (value <= band.good) return "good";
    if (value > band.poor) return "poor";
  } else {
    if (value >= band.good) return "good";
    if (metric === "avgPlayRatio" ? value < band.poor : value <= band.poor) return "poor";
  }
  return "normal";
}

export function hasCustomEvaluationTargets(standards: EvaluationStandards): boolean {
  return (Object.keys(standards.targets) as Array<keyof EvaluationStandards["targets"]>)
    .some((key) => standards.targets[key] !== DEFAULT_EVALUATION_STANDARDS.targets[key]);
}

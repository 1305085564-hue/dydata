export const PLATFORMS = ["抖音", "视频号", "小红书", "其他"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type ConfidenceTier = "high" | "medium" | "low" | "insufficient";

export const CONFIDENCE_THRESHOLDS = {
  high: 50_000,
  medium: 25_000,
  low: 15_000,
} as const;

export type ConfidenceMeta = {
  tier: ConfidenceTier;
  label: string;
  hint: string;
  toneHex: string;
};

const META: Record<ConfidenceTier, ConfidenceMeta> = {
  high: { tier: "high", label: "高置信", hint: "样本充足，可作为团队复用依据", toneHex: "#6FAA7D" },
  medium: { tier: "medium", label: "中置信", hint: "样本中等，可参考", toneHex: "#D97757" },
  low: { tier: "low", label: "低置信", hint: "样本偏小，建议继续跑", toneHex: "#D99E55" },
  insufficient: { tier: "insufficient", label: "样本不足", hint: "流量低于 1.5 万，建议继续跑量再参考", toneHex: "#A1A1AA" },
};

export function resolveConfidence(views: number): ConfidenceMeta {
  if (views >= CONFIDENCE_THRESHOLDS.high) return META.high;
  if (views >= CONFIDENCE_THRESHOLDS.medium) return META.medium;
  if (views >= CONFIDENCE_THRESHOLDS.low) return META.low;
  return META.insufficient;
}

export function calcConversionRate(views: number, follows: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  if (!Number.isFinite(follows) || follows < 0) return null;
  return follows / views;
}

export function formatConversionRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

export function formatViews(views: number): string {
  if (!Number.isFinite(views) || views < 0) return "0";
  if (views >= 10_000) return `${(views / 10_000).toFixed(1)}万`;
  return views.toLocaleString("zh-CN");
}

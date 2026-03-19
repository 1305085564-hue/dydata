import type { RecommendationConfidence, TimeRangeOption } from "./types";

export type TimeSlotKey = "morning" | "noon" | "afternoon" | "evening" | "late_night";

export const TOPIC_DAY_OPTIONS: TimeRangeOption[] = [7, 14, 30];
export const TEMPLATE_DAY_OPTIONS: TimeRangeOption[] = [14, 30, 60];
export const PUBLISH_DAY_OPTIONS: TimeRangeOption[] = [30, 60, 90];

export function normalizeHour(dateString: string | null | undefined) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCHours();
}

export function groupHour(hour: number): TimeSlotKey {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "late_night";
}

export function buildTimeSlotLabel(slot: TimeSlotKey) {
  switch (slot) {
    case "morning":
      return "早间(6-12)";
    case "noon":
      return "午间(12-14)";
    case "afternoon":
      return "下午(14-18)";
    case "evening":
      return "晚间(18-22)";
    case "late_night":
      return "深夜(22-6)";
  }
}

export function computeConfidence(sampleCount: number, hitRate: number): RecommendationConfidence {
  if (sampleCount >= 8 && hitRate >= 2) return "高";
  if (sampleCount >= 4 && hitRate >= 1.35) return "中";
  return "低";
}

export function getConfidenceTone(confidence: RecommendationConfidence) {
  if (confidence === "高") return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
  if (confidence === "中") return "text-amber-600 bg-amber-500/10 border-amber-500/20";
  return "text-slate-600 bg-slate-500/10 border-slate-500/20";
}

export function getDateDaysAgo(baseDate: string, days: number) {
  const date = new Date(`${baseDate}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

export function formatPlayCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return `${Math.round(value)}`;
}

export function formatRatio(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

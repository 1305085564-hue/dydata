import type { ExemptionCategory } from "@/types";

export type ExemptionCategoryValue = ExemptionCategory | null;

export function toExemptionCategory(value: unknown): ExemptionCategoryValue {
  if (value === "leave" || value === "waive") return value;
  return null;
}

export function normalizeExemptionCategoryForDisplay(value: unknown): ExemptionCategory {
  return toExemptionCategory(value) === "leave" ? "leave" : "waive";
}

export function getExemptionCategoryLabel(value: unknown): string {
  const category = toExemptionCategory(value);
  if (category === "leave") return "请假";
  if (category === "waive") return "免交";
  return "免交（历史兼容）";
}

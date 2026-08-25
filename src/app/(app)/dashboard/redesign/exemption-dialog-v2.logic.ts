import type { ExemptionCategory } from "@/types";

export interface ExemptionRequestInput {
  mode: "range";
  category: ExemptionCategory;
  dates: string[];
  reason: string;
}

export interface ExemptionRequestResult {
  success?: boolean;
  error?: string;
  submittedDates?: string[];
}

export type ModernExemptionSubmit = (
  input: ExemptionRequestInput,
) => Promise<ExemptionRequestResult | void>;

export type LegacyExemptionSubmit = (
  dates: string[],
  type: ExemptionCategory,
  reason: string,
) => Promise<ExemptionRequestResult | void>;

/** Preferred V2 callback. The legacy callback remains only for the first-batch panel bridge. */
export type ExemptionDialogSubmit = ModernExemptionSubmit;

/**
 * 统一 V2 弹窗到 dashboard Server Action 的输入形状。
 * 日期去重排序，原因只在边界处去除首尾空格，分类原样保留。
 */
export function buildExemptionRequestInput(input: {
  dates: string[];
  type: ExemptionCategory;
  reason: string;
}): ExemptionRequestInput {
  return {
    mode: "range",
    category: input.type,
    dates: Array.from(new Set(input.dates.filter(Boolean))).sort(),
    reason: input.reason.trim(),
  };
}

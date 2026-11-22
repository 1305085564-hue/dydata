import type { ExemptionCategory } from "@/types";

export type ExemptionCategoryValue = ExemptionCategory | null;

export function toExemptionCategory(value: unknown): ExemptionCategoryValue {
  if (value === "leave" || value === "waive") return value;
  return null;
}

/** 豁免类别统一归一：明确为请假返回 leave，其余（含空值/历史兼容）返回 waive。 */
export function normalizeExemptionCategory(value: unknown): ExemptionCategory {
  return toExemptionCategory(value) === "leave" ? "leave" : "waive";
}

/** 员工侧豁免类别展示文案：历史空类别直接显示「免交」。 */
export function getEmployeeExemptionCategoryLabel(value: unknown): string {
  return normalizeExemptionCategory(value) === "leave" ? "请假" : "免交";
}

/** 管理侧（审批工作台、成员管理、待办中心）豁免类别展示文案：历史空类别显式标注兼容来源。 */
export function getAdminExemptionCategoryLabel(value: unknown): string {
  const category = toExemptionCategory(value);
  if (category === "leave") return "请假";
  if (category === "waive") return "免交";
  return "免交（历史兼容）";
}

export const CASE_LIBRARY_USAGE_STATES = [
  "available",
  "banned",
  "testing",
  "not_recommended",
] as const;

export const CASE_LIBRARY_PROMOTION_LEVELS = [
  "promoted",
  "normal",
  "watching",
  "deprecated",
] as const;

export const CASE_LIBRARY_VIEWS = ["staff", "admin"] as const;

export const SCRIPT_RESULT_FLAGS = ["pass", "fail"] as const;

export type CaseLibraryUsageState = (typeof CASE_LIBRARY_USAGE_STATES)[number];
export type CaseLibraryPromotionLevel = (typeof CASE_LIBRARY_PROMOTION_LEVELS)[number];
export type CaseLibraryView = (typeof CASE_LIBRARY_VIEWS)[number];
export type ScriptResultFlag = (typeof SCRIPT_RESULT_FLAGS)[number];

export function isCaseLibraryUsageState(value: unknown): value is CaseLibraryUsageState {
  return typeof value === "string" && CASE_LIBRARY_USAGE_STATES.includes(value as CaseLibraryUsageState);
}

export function isCaseLibraryPromotionLevel(value: unknown): value is CaseLibraryPromotionLevel {
  return typeof value === "string" && CASE_LIBRARY_PROMOTION_LEVELS.includes(value as CaseLibraryPromotionLevel);
}

export function isCaseLibraryView(value: unknown): value is CaseLibraryView {
  return typeof value === "string" && CASE_LIBRARY_VIEWS.includes(value as CaseLibraryView);
}

export function isScriptResultFlag(value: unknown): value is ScriptResultFlag {
  return typeof value === "string" && SCRIPT_RESULT_FLAGS.includes(value as ScriptResultFlag);
}

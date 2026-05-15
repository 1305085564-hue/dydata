import { extractJsonString } from "@/lib/ai/client";

export type SampleQualityIssueSeverity = "critical" | "warning" | "info";
export type SampleQualitySuggestedFix = "edit_field" | "reupload_screenshot" | "manual_review";

export type SampleQualityIssue = {
  severity: SampleQualityIssueSeverity;
  field?: string;
  title: string;
  detail: string;
  suggestedFix?: SampleQualitySuggestedFix;
};

export type SampleQualityResult = {
  reportId: string;
  overallStatus: "pass" | "warning" | "fail";
  issues: SampleQualityIssue[];
  checkedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeSeverity(value: unknown): SampleQualityIssueSeverity | null {
  return value === "critical" || value === "warning" || value === "info" ? value : null;
}

function normalizeSuggestedFix(value: unknown): SampleQualitySuggestedFix | undefined {
  return value === "edit_field" || value === "reupload_screenshot" || value === "manual_review"
    ? value
    : undefined;
}

export function normalizeSampleQualityIssues(value: unknown): SampleQualityIssue[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;

      const severity = normalizeSeverity(item.severity);
      const title = toTrimmedString(item.title);
      const detail = toTrimmedString(item.detail);
      if (!severity || !title || !detail) return null;

      const field = toTrimmedString(item.field) || undefined;
      return {
        severity,
        field,
        title,
        detail,
        suggestedFix: normalizeSuggestedFix(item.suggestedFix),
      } as SampleQualityIssue;
    })
    .filter((item): item is SampleQualityIssue => item !== null);
}

export function inferOverallStatus(issues: SampleQualityIssue[]): SampleQualityResult["overallStatus"] {
  if (issues.some((issue) => issue.severity === "critical")) return "fail";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "pass";
}

export function parseSampleQualityResult(content: string, reportId: string, checkedAt: string): SampleQualityResult | null {
  const jsonString = extractJsonString(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const issues = normalizeSampleQualityIssues(parsed.issues);
    const rawOverallStatus = toTrimmedString(parsed.overallStatus);
    const overallStatus =
      rawOverallStatus === "pass" || rawOverallStatus === "warning" || rawOverallStatus === "fail"
        ? rawOverallStatus
        : inferOverallStatus(issues);

    return {
      reportId,
      overallStatus,
      issues,
      checkedAt,
    };
  } catch {
    return null;
  }
}

export function countIssueSeverities(issues: SampleQualityIssue[]) {
  return issues.reduce(
    (accumulator, issue) => {
      accumulator[issue.severity] += 1;
      return accumulator;
    },
    { critical: 0, warning: 0, info: 0 } as Record<SampleQualityIssueSeverity, number>,
  );
}

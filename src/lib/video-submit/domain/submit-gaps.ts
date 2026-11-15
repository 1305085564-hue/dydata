import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";

/**
 * 「还差什么」的唯一出口：提交按钮上的「还差：…」和页头状态句都从这里取，
 * 原料只有 `summarizeSubmissionIssues` 的结果，不另写一套判断。
 */
export const SUBMIT_SLOT_LABELS: Record<SubmissionSlotRole, string> = {
  screenshot_1: "互动截图",
  screenshot_2: "完播截图",
};

export type SubmitGapAnchor = "slots" | "metrics" | "topicTag" | "meta" | "publishedAt";

export type SubmitGap = {
  key: string;
  label: string;
  anchor: SubmitGapAnchor;
};

type GapSummary = Pick<
  ExtendedSubmissionIssueSummary,
  | "missingRequiredSlots"
  | "processingRequiredSlots"
  | "failedRequiredSlots"
  | "missingRequiredMetrics"
  | "missingRequiredMeta"
  | "topicTagMissing"
  | "publishedAtUnconfirmed"
>;

const slotNames = (roles: SubmissionSlotRole[]) =>
  roles.map((role) => SUBMIT_SLOT_LABELS[role] ?? "截图").join("、");

export function listSubmitGaps(summary: GapSummary): SubmitGap[] {
  const gaps: SubmitGap[] = [];
  if (summary.processingRequiredSlots.length > 0) {
    gaps.push({ key: "processing", label: `等${slotNames(summary.processingRequiredSlots)}识别完`, anchor: "slots" });
  }
  if (summary.missingRequiredSlots.length > 0) {
    gaps.push({ key: "slots", label: slotNames(summary.missingRequiredSlots), anchor: "slots" });
  }
  if (summary.failedRequiredSlots.length > 0) {
    gaps.push({ key: "failed", label: `处理${slotNames(summary.failedRequiredSlots)}`, anchor: "slots" });
  }
  if (summary.missingRequiredMetrics.length > 0) {
    gaps.push({ key: "metrics", label: `${summary.missingRequiredMetrics.length} 项数字`, anchor: "metrics" });
  }
  if (summary.missingRequiredMeta.includes("videoTitle")) {
    gaps.push({ key: "videoTitle", label: "标题", anchor: "meta" });
  }
  if (summary.missingRequiredMeta.includes("content")) {
    gaps.push({ key: "content", label: "文案", anchor: "meta" });
  }
  if (summary.topicTagMissing) {
    gaps.push({ key: "topicTag", label: "题材", anchor: "topicTag" });
  }
  if (summary.publishedAtUnconfirmed) {
    gaps.push({ key: "publishedAt", label: "发布时间", anchor: "publishedAt" });
  }
  return gaps;
}

/** 表单进度：页头状态句据此在「今天还没交」之后往前走。 */
export type FormProgress = "notStarted" | "filling" | "onlyContent" | "ready" | "ocrFailed";

export function resolveFormProgress({
  summary,
  hasStartedFilling,
  allScreenshotsFailed,
}: {
  summary: GapSummary & { canSubmit: boolean };
  hasStartedFilling: boolean;
  allScreenshotsFailed: boolean;
}): FormProgress {
  if (summary.canSubmit) return "ready";
  if (!hasStartedFilling) return "notStarted";
  if (allScreenshotsFailed) return "ocrFailed";
  const gaps = listSubmitGaps(summary);
  if (gaps.length === 1 && gaps[0].key === "content") return "onlyContent";
  return "filling";
}

/** 当前走到第几步：粘贴截图 → 核对识别结果 → 粘贴文案 → 提交 */
export const SUBMIT_STEPS = ["粘贴截图", "核对识别结果", "粘贴文案", "提交"] as const;

export function resolveSubmitStep(summary: GapSummary & { canSubmit: boolean }): number {
  if (summary.canSubmit) return 3;
  const gaps = listSubmitGaps(summary);
  if (gaps.some((gap) => gap.key === "slots")) return 0;
  if (gaps.some((gap) => gap.anchor === "slots" || gap.anchor === "metrics" || gap.key === "videoTitle" || gap.key === "publishedAt")) return 1;
  return 2;
}

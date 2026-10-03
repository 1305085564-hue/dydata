"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";

export const SLOT_LABELS: Record<SubmissionSlotRole, string> = {
  screenshot_1: "互动截图",
  screenshot_2: "完播截图",
};

export interface FormV2SubmitFooterProps {
  canActuallySubmit: boolean;
  hasAttemptedSubmit: boolean;
  issueSummary: ExtendedSubmissionIssueSummary;
  scrollToIssueAnchor: (
    anchor: "slots" | "metrics" | "topicTag" | "meta" | "publishedAt" | null,
  ) => void;
  triggerSlotsPulse: () => void;
  isSubmitted: boolean;
  lastSavedAt: Date | null;
  appealRequired: boolean;
  requestLateSubmission: () => void;
  isAppealSubmitting: boolean;
  isBackfillMode: boolean;
  submittedViewActive: boolean;
  onCancel?: () => void;
  triggerSubmit: () => void;
  isSubmitting: boolean;
  submitButtonLabel: string;
}

export function FormV2SubmitFooter({
  canActuallySubmit,
  hasAttemptedSubmit,
  issueSummary,
  scrollToIssueAnchor,
  triggerSlotsPulse,
  isSubmitted,
  lastSavedAt,
  appealRequired,
  requestLateSubmission,
  isAppealSubmitting,
  isBackfillMode,
  submittedViewActive,
  onCancel,
  triggerSubmit,
  isSubmitting,
  submitButtonLabel,
}: FormV2SubmitFooterProps) {
  return (
    <div className="sticky bottom-[var(--app-bottom-offset,0px)] z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-t border-[#E2E2DF] bg-[#FCFCFB]/95 px-3 py-3 backdrop-blur-md md:static md:z-auto md:border-t md:border-[#E2E2DF]/60 md:bg-transparent md:p-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
      {/* 底部提交按钮：移动端吸底（避让底部导航 --app-bottom-offset） */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {!canActuallySubmit ? (
          hasAttemptedSubmit ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-sans text-[12px] text-[#78716C]">
              <div className="inline-flex items-center gap-1 shrink-0 font-normal text-[#1F1E1D]">
                <span className="size-1.5 shrink-0 rounded-full bg-[#A8A29E]/80" aria-hidden="true" />
                <span>待补全：</span>
              </div>
              <div
                className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 [&>button:not(:last-child)]:after:content-['·'] [&>button:not(:last-child)]:after:ml-1.5 [&>button:not(:last-child)]:after:text-[#E2E2DF] [&>button:not(:last-child)]:after:inline-block"
                aria-label="提交缺项"
              >
                {issueSummary.processingRequiredSlots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("slots")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    {issueSummary.processingRequiredSlots.map((role) => SLOT_LABELS[role] || "截图").join("、")}识别中
                  </button>
                )}
                {issueSummary.missingRequiredSlots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToIssueAnchor("slots");
                      triggerSlotsPulse();
                    }}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    缺少{issueSummary.missingRequiredSlots.map((role) => SLOT_LABELS[role] || "截图").join("、")}
                  </button>
                )}
                {issueSummary.failedRequiredSlots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("slots")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    {issueSummary.failedRequiredSlots.map((role) => SLOT_LABELS[role] || "截图").join("、")}需核对
                  </button>
                )}
                {issueSummary.missingRequiredMetrics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("metrics")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    缺少 {issueSummary.missingRequiredMetrics.length} 项必填指标
                  </button>
                )}
                {issueSummary.missingRequiredMeta.includes("videoTitle") && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("meta")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    缺少视频标题
                  </button>
                )}
                {issueSummary.missingRequiredMeta.includes("content") && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("meta")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    缺少视频文案
                  </button>
                )}
                {issueSummary.topicTagMissing && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("topicTag")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    缺少选题标签
                  </button>
                )}
                {issueSummary.publishedAtUnconfirmed && (
                  <button
                    type="button"
                    onClick={() => scrollToIssueAnchor("publishedAt")}
                    className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                  >
                    未识别到发布时间
                  </button>
                )}
              </div>
            </div>
          ) : null
        ) : (
          <div className="text-[12px] text-[#78716C] flex items-center gap-1 font-sans">
            <span className="h-1.5 w-1.5 rounded-full bg-current text-status-success" />
            <span className="text-[#1F1E1D] font-normal">信息已齐备，可提交</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-[12px] text-[#78716C]/80 font-sans">
          {!isSubmitted && lastSavedAt ? (
            <>
              <span className="tabular-nums">
                已自动保存 {lastSavedAt.getHours().toString().padStart(2, "0")}:{lastSavedAt.getMinutes().toString().padStart(2, "0")}
              </span>
              <span> · </span>
            </>
          ) : null}
          <span>⌘/Ctrl+Enter 提交</span>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        {appealRequired && !isSubmitted && (
          <Button
            type="button"
            variant="secondary"
            size="l"
            onClick={requestLateSubmission}
            disabled={isAppealSubmitting}
            className="flex-1 sm:flex-initial px-4 text-[13px] font-normal"
          >
            {isAppealSubmitting ? "申请中..." : "申请补交"}
          </Button>
        )}
        {isBackfillMode || submittedViewActive ? (
          <Button
            type="button"
            variant="secondary"
            size="l"
            onClick={onCancel}
            className="flex-1 sm:flex-initial px-4 text-[13px] font-normal"
          >
            取消
          </Button>
        ) : null}
        <Button
          type="button"
          variant={canActuallySubmit && !isSubmitting ? "default" : "secondary"}
          size="l"
          onClick={triggerSubmit}
          disabled={isSubmitting}
          aria-disabled={!canActuallySubmit || undefined}
          className={cn(
            "flex-1 sm:flex-initial px-6 text-[14px] select-none cursor-pointer",
            canActuallySubmit && !isSubmitting
              ? ""
              : "bg-[#F1F1F0] text-[#78716C]/60 shadow-none hover:bg-[#F1F1F0] disabled:cursor-not-allowed disabled:opacity-100",
          )}
        >
          <span>{submitButtonLabel}</span>
        </Button>
      </div>
    </div>
  );
}

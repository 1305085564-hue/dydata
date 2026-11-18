"use client";

import { Button } from "@/components/ui/button";
import { WithdrawPendingButton } from "@/components/video-submit/withdraw-pending-button";
import { cn } from "@/lib/utils";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";
import { listSubmitGaps, SUBMIT_SLOT_LABELS } from "@/lib/video-submit/domain/submit-gaps";
import { shouldShowAppealSubmitAction, type AppealStatus } from "@/lib/dashboard-logic/appeal-submit-state";

export const SLOT_LABELS = SUBMIT_SLOT_LABELS;

export interface FormV2SubmitFooterProps {
  canActuallySubmit: boolean;
  issueSummary: ExtendedSubmissionIssueSummary;
  isSubmitted: boolean;
  lastSavedAt: Date | null;
  appealRequired: boolean;
  appealStatus: AppealStatus;
  appealResultReason: string | null;
  appealPrecheckRequired: boolean;
  requestLateSubmission: () => void;
  retryAppealResume: () => void;
  /** 待审批时可撤回申请；没有申请 ID 时不传。 */
  onWithdrawAppeal?: () => Promise<void>;
  isAppealResuming: boolean;
  isAppealSubmitting: boolean;
  isBackfillMode: boolean;
  submittedViewActive: boolean;
  onCancel?: () => void;
  triggerSubmit: () => void;
  isSubmitting: boolean;
  submitButtonLabel: string;
}

/**
 * 提交区：吸底在整行上（不吸在按钮上），按钮自己说还差什么。
 * 缺项文字来自 `listSubmitGaps(issueSummary)`，与页头状态句同一来源；
 * 灰态按钮仍可点，点了走 triggerSubmit 跳到第一处缺项。
 */
export function FormV2SubmitFooter({
  canActuallySubmit,
  issueSummary,
  isSubmitted,
  lastSavedAt,
  appealRequired,
  appealStatus,
  appealResultReason,
  appealPrecheckRequired,
  requestLateSubmission,
  retryAppealResume,
  onWithdrawAppeal,
  isAppealResuming,
  isAppealSubmitting,
  isBackfillMode,
  submittedViewActive,
  onCancel,
  triggerSubmit,
  isSubmitting,
  submitButtonLabel,
}: FormV2SubmitFooterProps) {
  const gaps = listSubmitGaps(issueSummary);
  const label = isSubmitting
    ? submitButtonLabel
    : canActuallySubmit
      ? submitButtonLabel
      : `还差：${gaps.map((gap) => gap.label).join("、")}`;
  const appealLabel = appealStatus === "pending"
    ? "已提交审批"
    : appealStatus === "resume_pending"
      ? "等待重试续交"
      : appealStatus === "rejected"
        ? "重新申请补交"
        : "提交审批";

  return (
    <div className="sticky bottom-[var(--app-bottom-offset,0px)] z-10 -mx-2 flex items-center gap-3 border-t border-[#E2E2DF] bg-[#FCFCFB]/95 px-2 py-3 backdrop-blur-md">
      <span className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-[#78716C]">
        {!isSubmitted && lastSavedAt
          ? `已自动保存 ${lastSavedAt.getHours().toString().padStart(2, "0")}:${lastSavedAt.getMinutes().toString().padStart(2, "0")}`
          : ""}
        {appealStatus === "pending" ? " · 补交申请审批中" : null}
        {appealStatus === "rejected" && appealResultReason ? ` · 已驳回：${appealResultReason}` : null}
        {appealStatus === "resume_pending" && appealResultReason ? ` · ${appealResultReason}` : null}
      </span>
      {isBackfillMode || submittedViewActive ? (
        <Button type="button" variant="ghost" size="l" onClick={onCancel} className="shrink-0 px-3 text-[14px] font-normal">
          取消
        </Button>
      ) : null}
      {appealStatus === "resume_pending" && !isSubmitted ? (
        <Button
          type="button"
          size="l"
          onClick={retryAppealResume}
          disabled={isAppealResuming}
          className="shrink-0 px-5 text-[14px] font-normal"
        >
          {isAppealResuming ? "重试中..." : "重试续交"}
        </Button>
      ) : shouldShowAppealSubmitAction({ appealRequired, appealPrecheckRequired, appealStatus, isSubmitted }) ? (
        <Button
          type="button"
          size="l"
          onClick={appealRequired ? requestLateSubmission : triggerSubmit}
          disabled={isAppealSubmitting}
          className="shrink-0 px-5 text-[14px] font-normal"
        >
          {isAppealSubmitting ? "申请中..." : appealLabel}
        </Button>
      ) : appealStatus === "pending" && !isSubmitted ? (
        <span className="flex shrink-0 items-center gap-3 text-[13px] text-[#78716C]">
          等待审批
          {onWithdrawAppeal ? <WithdrawPendingButton onWithdraw={onWithdrawAppeal} className="cursor-pointer select-none text-[13px] text-[#78716C] underline-offset-2 hover:text-[#141413] hover:underline disabled:opacity-60" /> : null}
        </span>
      ) : (
        <Button
          type="button"
          title="⌘/Ctrl+Enter 提交"
          variant={canActuallySubmit && !isSubmitting ? "default" : "secondary"}
          size="l"
          onClick={triggerSubmit}
          disabled={isSubmitting}
          aria-disabled={!canActuallySubmit || undefined}
          className={cn(
            "max-w-[70%] shrink-0 truncate px-5 text-[14px] select-none cursor-pointer",
            canActuallySubmit && !isSubmitting
              ? ""
              : "bg-[#F1F1F0] text-[#78716C]/60 shadow-none hover:bg-[#F1F1F0] disabled:cursor-not-allowed disabled:opacity-100",
          )}
        >
          <span className="truncate">{label}</span>
        </Button>
      )}
    </div>
  );
}

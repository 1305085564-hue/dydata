"use client";

import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SubmitPanelMode } from "@/lib/dashboard-submission-state";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";
import { resolveCompleteEditPayload } from "@/lib/video-submit/domain/form-rules";
import type { FormMetaState, ScreenshotItem, SlotViewState } from "@/lib/video-submit/domain/video-submit-form-model";
import {
  getVideoSubmissionEditDetailError,
  type VideoSubmissionEditDetail,
} from "@/lib/video-submit/domain/video-submit-form-state";
import type { IssueAnchor } from "./focus-issue-target";

export interface SubmitGuardInput {
  account: { id: string } | null;
  mode: SubmitPanelMode;
  editDetail: VideoSubmissionEditDetail | null;
  isDailyReportOnly: boolean;
  meta: FormMetaState;
  slots: Record<SubmissionSlotRole, SlotViewState>;
  hasManualEdit: boolean;
  submitCheckOk: boolean;
  issueSummary: ExtendedSubmissionIssueSummary;
  updateItemsState: (updater: (current: ScreenshotItem[]) => ScreenshotItem[]) => void;
  setHasAttemptedSubmit: (next: boolean) => void;
  triggerFormShake: () => void;
  scrollToIssueAnchor: (anchor: IssueAnchor) => void;
  focusIssueTarget: (
    anchor: IssueAnchor,
    invalidKey: ExtendedSubmissionIssueSummary["firstInvalidFieldKey"],
    missingRequiredSlotsCount?: number,
  ) => void;
}

/** 提交流程前置守卫：自动解除已上传且已手填的失败态，并校验缺项与编辑完整性。 */
export function runPreSubmitGuard(input: SubmitGuardInput): boolean {
  const {
    account, mode, editDetail, isDailyReportOnly, meta, slots, hasManualEdit,
    submitCheckOk, issueSummary, updateItemsState, setHasAttemptedSubmit,
    triggerFormShake, scrollToIssueAnchor, focusIssueTarget,
  } = input;

  setHasAttemptedSubmit(true);
  if (!account) {
    triggerFormShake();
    return false;
  }

  const canAutoResolve1 = slots.screenshot_1.status === "failed" && Boolean(slots.screenshot_1.assetUrl) && hasManualEdit;
  const canAutoResolve2 = slots.screenshot_2.status === "failed" && Boolean(slots.screenshot_2.assetUrl) && hasManualEdit;
  if (canAutoResolve1 || canAutoResolve2) {
    updateItemsState((current) =>
      current.map((item) => {
        const shouldResolve =
          (canAutoResolve1 && slots.screenshot_1.itemId === item.id) ||
          (canAutoResolve2 && slots.screenshot_2.itemId === item.id);
        return shouldResolve
          ? { ...item, status: "done", confirmed: true, requiresManualConfirmation: false, ocrFallback: true, error: null }
          : item;
      }),
    );
  }

  if (!submitCheckOk || !issueSummary.canSubmit) {
    setHasAttemptedSubmit(true);
    triggerFormShake();
    scrollToIssueAnchor(issueSummary.firstIssueAnchor);
    focusIssueTarget(
      issueSummary.firstIssueAnchor,
      issueSummary.firstInvalidFieldKey,
      issueSummary.missingRequiredSlots.length,
    );
    return false;
  }

  if (!isDailyReportOnly && !meta.topicTag) {
    setHasAttemptedSubmit(true);
    triggerFormShake();
    scrollToIssueAnchor("topicTag");
    focusIssueTarget("topicTag", "topicTag");
    return false;
  }

  const editDetailError =
    mode === "editToday"
      ? getVideoSubmissionEditDetailError(editDetail, { accountId: account.id, bizDate: meta.bizDate })
      : null;
  const editPayload =
    mode === "editToday"
      ? resolveCompleteEditPayload(editDetail, { accountId: account.id, bizDate: meta.bizDate })
      : null;
  if (editDetailError || (mode === "editToday" && !isDailyReportOnly && !editPayload)) {
    triggerFormShake();
    feedbackToast.error(editDetailError ?? "缺少原视频完整详情，已停止保存以避免覆盖旧数据");
    return false;
  }

  return true;
}

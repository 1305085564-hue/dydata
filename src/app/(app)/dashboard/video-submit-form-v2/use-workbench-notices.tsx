"use client";

import { useCallback, useMemo } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  buildExemptionReviewNoticeItems,
  buildPendingExemptionNoticeItem,
  type WorkbenchNoticeItem,
} from "@/components/video-submit/workbench-notice-bar";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import { useReviewNoticeDismissal } from "../use-review-notice-dismissal";

export interface UseWorkbenchNoticesOptions {
  showDraftBanner: boolean;
  handleRestoreDraft: () => void;
  handleDiscardDraft: () => void;
  handleUndoDiscard: () => void;
  setDiscardConfirmOpen: (open: boolean) => void;
  isExemptionPending: boolean;
  pendingExemptionItems: DashboardPageData["pendingExemptionItems"];
  onDismissPendingExemption?: () => void;
  onWithdrawPendingExemption?: () => Promise<unknown>;
  userExemptionReviewNotices: DashboardPageData["userExemptionReviewNotices"];
  topicNotice: WorkbenchNoticeItem | null;
}

export function useWorkbenchNotices({
  showDraftBanner,
  handleRestoreDraft,
  handleDiscardDraft,
  handleUndoDiscard,
  setDiscardConfirmOpen,
  isExemptionPending,
  pendingExemptionItems,
  onDismissPendingExemption,
  onWithdrawPendingExemption,
  userExemptionReviewNotices,
  topicNotice,
}: UseWorkbenchNoticesOptions) {
  const { dismissed: dismissedReviewNotice, dismiss: handleDismissReviewNotice } =
    useReviewNoticeDismissal(userExemptionReviewNotices);

  const confirmDiscardDraft = useCallback(() => {
    setDiscardConfirmOpen(false);
    handleDiscardDraft();
    feedbackToast.success("已丢弃草稿", {
      duration: 5000,
      action: {
        label: "撤销",
        onClick: () => {
          handleUndoDiscard();
          feedbackToast.success("已恢复草稿");
        },
      },
    });
  }, [handleDiscardDraft, handleUndoDiscard, setDiscardConfirmOpen]);

  const workbenchNotices = useMemo(() => {
    const items: WorkbenchNoticeItem[] = [];
    if (showDraftBanner) {
      items.push({
        id: "draft-banner",
        type: "draft",
        statusTone: "amber",
        title: "未交草稿",
        description: undefined,
        actions: (
          <div className="inline-flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="inline-flex min-h-8 h-8 items-center rounded-md border border-[#D97757] px-2.5 py-1 text-[12px] font-normal text-[#D97757] hover:bg-[#D97757]/5 transition-colors cursor-pointer select-none"
            >
              恢复
            </button>
            <button
              type="button"
              onClick={() => setDiscardConfirmOpen(true)}
              className="inline-flex min-h-8 h-8 items-center px-2 py-1 text-[12px] text-[#78716C] hover:text-status-danger transition-colors cursor-pointer select-none"
            >
              丢弃
            </button>
          </div>
        ),
      });
    }
    if (isExemptionPending) {
      items.push(
        buildPendingExemptionNoticeItem({
          items: pendingExemptionItems,
          onDismiss: onDismissPendingExemption,
          onWithdraw: onWithdrawPendingExemption,
        }),
      );
    }
    if (userExemptionReviewNotices.length > 0 && !dismissedReviewNotice) {
      items.push(...buildExemptionReviewNoticeItems(userExemptionReviewNotices, handleDismissReviewNotice));
    }
    if (topicNotice) {
      items.push(topicNotice);
    }
    return items;
  }, [
    dismissedReviewNotice,
    handleDismissReviewNotice,
    handleRestoreDraft,
    isExemptionPending,
    onDismissPendingExemption,
    onWithdrawPendingExemption,
    pendingExemptionItems,
    setDiscardConfirmOpen,
    showDraftBanner,
    topicNotice,
    userExemptionReviewNotices,
  ]);

  return { workbenchNotices, confirmDiscardDraft };
}

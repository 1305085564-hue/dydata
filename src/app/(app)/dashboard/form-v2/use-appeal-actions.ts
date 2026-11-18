import { useCallback, useState } from "react";

import { feedbackToast } from "@/components/ui/feedback-toast";
import { markBrowserAppealSuccessSession } from "@/lib/video-submit/domain/appeal-success-session";
import { withdrawMyFulfillmentAppeal } from "@/lib/withdraw-requests-client";

type AppealResumeResult = { ok: boolean; error?: string | null };

/**
 * 补交申请批准/待审后的两个动作：批准后重试续交；待审时撤回申请。
 * 状态仍归表单所有（setter 由表单传入），这里只编排调用和提示。
 */
export function useAppealActions(input: {
  accountId: string | null;
  appealId: string | null;
  bizDate: string;
  videoTitle: string | null | undefined;
  publishedAt: string | null | undefined;
  resumeAppeal: (appealId: string) => Promise<AppealResumeResult>;
  pauseSaving: () => void;
  clearDraft: () => void;
  onSubmitted: (video: null) => void;
  setAppealStatus: (status: "idle" | "approved") => void;
  setAppealId: (id: string | null) => void;
  setAppealResultReason: (reason: string | null) => void;
  setIsSubmitted: (value: boolean) => void;
}) {
  const { accountId, appealId, bizDate, videoTitle, publishedAt, resumeAppeal, pauseSaving, clearDraft, onSubmitted } = input;
  const { setAppealStatus, setAppealId, setAppealResultReason, setIsSubmitted } = input;
  const [isAppealResuming, setIsAppealResuming] = useState(false);

  const retryAppealResume = useCallback(async () => {
    if (!accountId || !appealId || isAppealResuming) return;
    setIsAppealResuming(true);
    try {
      const result = await resumeAppeal(appealId);
      if (!result.ok) {
        setAppealResultReason(result.error ?? "自动提交未完成，请稍后重试");
        feedbackToast.error(result.error ?? "自动提交未完成，请稍后重试");
        return;
      }
      pauseSaving();
      clearDraft();
      setAppealStatus("approved");
      setAppealResultReason(null);
      setIsSubmitted(true);
      markBrowserAppealSuccessSession(accountId, bizDate, videoTitle ?? undefined, publishedAt ?? undefined);
      onSubmitted(null);
      feedbackToast.success("补交数据已自动提交");
    } finally {
      setIsAppealResuming(false);
    }
  }, [accountId, appealId, bizDate, clearDraft, isAppealResuming, onSubmitted, pauseSaving, publishedAt, resumeAppeal, setAppealResultReason, setAppealStatus, setIsSubmitted, videoTitle]);

  /** 撤回待审批的补交申请：成功后回到"需要补交"的初始状态，可以重新申请；管理员侧的申请和待办由服务端同时撤掉。 */
  const withdrawAppeal = useCallback(async () => {
    if (!appealId) return;
    const result = await withdrawMyFulfillmentAppeal(appealId);
    if (!result.ok) {
      feedbackToast.error(result.error);
      return;
    }
    setAppealStatus("idle");
    setAppealId(null);
    setAppealResultReason(null);
    feedbackToast.success(result.message);
  }, [appealId, setAppealId, setAppealResultReason, setAppealStatus]);

  return { isAppealResuming, retryAppealResume, withdrawAppeal };
}

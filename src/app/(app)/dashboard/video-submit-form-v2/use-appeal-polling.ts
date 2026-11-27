"use client";

import { useCallback, useEffect, useMemo } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SubmitPanelMode } from "@/lib/dashboard-submission-state";
import {
  isPublishedAtConfirmed,
  resolveVideoSubmitDeadline,
  VIDEO_SUBMIT_EXPIRED_APPEAL_REASON,
} from "@/lib/video-submit-deadline";
import {
  isDailyReportOnlyEditDetail,
  resolveVideoSubmitMode,
  type VideoSubmissionEditDetail,
} from "@/lib/video-submit/domain/video-submit-form-state";
import type { FormMetaState } from "@/lib/video-submit/domain/video-submit-form-model";
import type { SubmissionUiState } from "@/lib/video-submit-workflow/ui-state";
import { markBrowserAppealSuccessSession } from "@/lib/video-submit/domain/appeal-success-session";

export interface UseAppealPollingOptions {
  accountId: string | null;
  mode: SubmitPanelMode;
  editDetail: VideoSubmissionEditDetail | null;
  meta: FormMetaState;
  appealStatus: SubmissionUiState["appealStatus"];
  setAppealReason: (next: string) => void;
  setAppealStatus: (next: SubmissionUiState["appealStatus"]) => void;
  setAppealResultReason: (next: string | null) => void;
  setIsSubmitted: (next: boolean) => void;
  pauseSaving: () => void;
  clearDraft: () => void;
  onSubmitted: (video: null) => void;
}

export function useAppealPolling({
  accountId,
  mode,
  editDetail,
  meta,
  appealStatus,
  setAppealReason,
  setAppealStatus,
  setAppealResultReason,
  setIsSubmitted,
  pauseSaving,
  clearDraft,
  onSubmitted,
}: UseAppealPollingOptions) {
  const deadlinePrecheck = useMemo(
    () =>
      resolveVideoSubmitDeadline({
        mode:
          resolveVideoSubmitMode({
            panelMode: mode,
            anomalyStatus: meta.anomalyStatus,
            videoId: editDetail?.videoId ?? null,
            dailyReportOnly: isDailyReportOnlyEditDetail(editDetail),
          }) === "edit"
            ? "edit"
            : "create",
        publishedAt: meta.publishedAt,
        businessDate: meta.bizDate,
        publishedAtConfirmed: isPublishedAtConfirmed(meta.publishedAtText),
        publishedAtSource: meta.publishedAtSource,
      }),
    [
      editDetail,
      meta.anomalyStatus,
      meta.bizDate,
      meta.publishedAt,
      meta.publishedAtSource,
      meta.publishedAtText,
      mode,
    ],
  );

  useEffect(() => {
    if (appealStatus !== "idle" || deadlinePrecheck.decision !== "requires_appeal") return;
    setAppealReason(
      deadlinePrecheck.reason === "manual_published_at"
        ? "发布时间由成员手工填写，需要补交审批"
        : VIDEO_SUBMIT_EXPIRED_APPEAL_REASON,
    );
  }, [appealStatus, deadlinePrecheck.decision, deadlinePrecheck.reason, setAppealReason]);

  const checkAppealStatus = useCallback(async () => {
    if (!accountId || !meta.bizDate || appealStatus !== "pending") return;
    try {
      const response = await fetch(
        `/api/fulfillment/appeal-status?accountId=${encodeURIComponent(accountId)}&recordDate=${encodeURIComponent(meta.bizDate)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        appeal?: {
          id: string;
          status: "pending" | "approved" | "rejected";
          decisionReason?: string | null;
          resumePending?: boolean;
          resumeError?: string | null;
        } | null;
      };
      if (!response.ok || !payload.appeal) return;
      if (payload.appeal.status === "rejected") {
        setAppealStatus("rejected");
        setAppealResultReason(payload.appeal.decisionReason ?? "管理员未通过这次补交申请");
        return;
      }
      if (payload.appeal.status !== "approved") return;
      if (payload.appeal.resumePending) {
        setAppealStatus("resume_pending");
        setAppealResultReason(payload.appeal.resumeError ?? "自动提交未完成，请点击重试");
        return;
      }
      pauseSaving();
      clearDraft();
      setAppealStatus("approved");
      setAppealResultReason(null);
      setIsSubmitted(true);
      markBrowserAppealSuccessSession(accountId, meta.bizDate, meta.videoTitle, meta.publishedAt);
      onSubmitted(null);
      feedbackToast.success("补交申请已通过，数据已自动提交");
    } catch {
      // 暂时的网络失败留给下一次轮询或页面聚焦处理。
    }
  }, [
    accountId,
    appealStatus,
    clearDraft,
    meta.bizDate,
    meta.publishedAt,
    meta.videoTitle,
    onSubmitted,
    pauseSaving,
    setAppealResultReason,
    setAppealStatus,
    setIsSubmitted,
  ]);

  useEffect(() => {
    if (appealStatus !== "pending") return;
    void checkAppealStatus();
    const interval = window.setInterval(() => void checkAppealStatus(), 30_000);
    window.addEventListener("focus", checkAppealStatus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkAppealStatus);
    };
  }, [appealStatus, checkAppealStatus]);

  return { deadlinePrecheck };
}

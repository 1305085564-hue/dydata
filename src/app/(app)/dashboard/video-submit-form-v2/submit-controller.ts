"use client";

import type { MutableRefObject } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { Video, VideoTagReviewDimension } from "@/types";
import type { SubmitPanelMode, TodaySubmissionReportLike } from "@/lib/dashboard-submission-state";
import type { EditableMetricKey } from "@/components/submission/提交状态机";
import type { EditableMetricField, FormMetaState, SlotViewState } from "../video-submit-form-model";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import { parseMetricFieldOrNull } from "@/lib/dashboard-logic/use-video-submit-form";
import { parseMetric, resolveCompleteEditPayload, createSummaryOverride, isVideo } from "@/lib/video-submit/domain/form-rules";
import { buildSubmissionAssets, buildVideoSubmitPayload } from "@/lib/video-submit-workflow/selectors";
import { trackUsageEvent } from "@/lib/usage-events/client";
import { normalizeOptionalText, resolveVideoSubmitMetaFields, resolveVideoSubmitMode, getDefaultPublishedAtForBizDate, type VideoSubmissionEditDetail } from "../video-submit-form-state";

type SubmitResponse = { data?: Video; video?: Video; daily_report_id?: string; ai_tags?: Array<{ tag_dimension: VideoTagReviewDimension; tag_value: string; confidence: number | null; reason: string | null }>; error?: string; code?: string };
type Setter<T> = (next: T | ((current: T) => T)) => void;
export type SubmitControllerOptions = {
  account: { id: string } | null; userId: string; mode: SubmitPanelMode; today: string;
  meta: FormMetaState; fields: Record<EditableMetricKey, EditableMetricField>; slots: Record<SubmissionSlotRole, SlotViewState>;
  editDetail?: VideoSubmissionEditDetail | null; selectedTopicId: string | null; initialTopicId: string | null; scriptText: string; hasManualEdit: boolean;
  supabase: { auth: { getUser: () => Promise<{ data: { user: unknown } }> } };
  pendingSubmissionPayloadRef: MutableRefObject<Record<string, unknown> | null>;
  setIsSubmitting: Setter<boolean>; setAppealRequired: Setter<boolean>; setIsSubmitted: Setter<boolean>; setSubmittedReportId: Setter<string | null>;
  setIsAppealDialogOpen: Setter<boolean>; setIsAppealSubmitting: Setter<boolean>; isAppealSubmitting: boolean; appealReason: string;
  onSubmitted: (video: Video, aiTags: Array<{ tag_dimension: VideoTagReviewDimension; tag_value: string; confidence: number | null; reason: string | null }>, summaryOverride?: TodaySubmissionReportLike | null) => void;
  clearDraft: () => void; scrollToIssueAnchor: (anchor: "slots" | "meta" | "publishedAt" | "metrics" | "topicTag" | null) => void;
};

export function createSubmitController(options: SubmitControllerOptions) {
  const { account, userId, mode, today, meta, fields, slots, editDetail, selectedTopicId, initialTopicId, scriptText, hasManualEdit, supabase, pendingSubmissionPayloadRef, setIsSubmitting, setAppealRequired, setIsSubmitted, setSubmittedReportId, setIsAppealDialogOpen, setIsAppealSubmitting, isAppealSubmitting, appealReason, onSubmitted, clearDraft, scrollToIssueAnchor } = options;
  async function executeSubmit() {
    if (!account) return;

    const editPayload =
      mode === "editToday" && account
        ? resolveCompleteEditPayload(editDetail, {
            accountId: account.id,
            bizDate: meta.bizDate,
          })
        : null;

    const shouldReuseExistingScreenshots = mode === "editToday" && buildSubmissionAssets(slots).length === 0;
    const submitMeta = resolveVideoSubmitMetaFields({
      mode,
      anomalyStatus: meta.anomalyStatus,
      publishedAt: meta.publishedAt,
      punishType: meta.punishType ?? "",
      platformNotice: meta.platformNotice ?? "",
      appeal: meta.appeal ?? "",
      defaultPublishedAt: getDefaultPublishedAtForBizDate(meta.bizDate, today),
    });

    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user && !userId) {
        throw new Error("登录状态已失效，请刷新页面后重试");
      }

      const submissionPayload = buildVideoSubmitPayload({
        mode: resolveVideoSubmitMode({
          panelMode: mode,
          anomalyStatus: meta.anomalyStatus,
          videoId: editPayload?.video_id ?? null,
        }),
        videoId: editPayload?.video_id ?? null,
        accountId: editPayload?.account_id ?? account.id,
        bizDate: editPayload?.biz_date ?? meta.bizDate,
        videoUrl: normalizeOptionalText(meta.videoUrl),
        videoTitle: normalizeOptionalText(meta.videoTitle),
        content: normalizeOptionalText(meta.content),
        publishedAt: submitMeta.publishedAt,
        publishedAtText: normalizeOptionalText(meta.publishedAtText),
        anomalyStatus: meta.anomalyStatus,
        punishType: submitMeta.punishType,
        platformNotice: submitMeta.platformNotice,
        appeal: submitMeta.appeal,
        topicTag: meta.topicTag || null,
        videoForm: meta.videoForm || null,
        topicId: selectedTopicId || initialTopicId || null,
        scriptAuthorUserId: meta.scriptAuthorUserId,
        videoEditorUserId: meta.videoEditorUserId,
        operatorUserId: meta.operatorUserId,
        manualEdit: hasManualEdit,
        contentKeywords: meta.contentKeywords,
        assets: shouldReuseExistingScreenshots ? [] : buildSubmissionAssets(slots),
        scriptText:
          parseMetric(fields.follower_convert.value) > 0
            ? scriptText.trim() || null
            : null,
        scriptFormat: editPayload?.script_format ?? "oral",
        metrics: {
          play_count: parseMetricFieldOrNull("play_count", fields.play_count.value),
          likes: parseMetricFieldOrNull("likes", fields.likes.value),
          comments: parseMetricFieldOrNull("comments", fields.comments.value),
          shares: parseMetricFieldOrNull("shares", fields.shares.value),
          favorites: parseMetricFieldOrNull("favorites", fields.favorites.value),
          follower_gain: parseMetricFieldOrNull("follower_gain", fields.follower_gain.value),
          follower_loss: 0,
          follower_convert: parseMetricFieldOrNull("follower_convert", fields.follower_convert.value),
          avg_play_duration: parseMetricFieldOrNull("avg_play_duration", fields.avg_play_duration.value),
          bounce_rate_2s: parseMetricFieldOrNull("bounce_rate_2s", fields.bounce_rate_2s.value),
          completion_rate_5s: parseMetricFieldOrNull("completion_rate_5s", fields.completion_rate_5s.value),
          completion_rate: parseMetricFieldOrNull("completion_rate", fields.completion_rate.value),
        },
      });
      const response = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionPayload),
      });

      const payload = (await response.json()) as SubmitResponse | Video;
      if (!response.ok) {
        if (!isVideo(payload) && payload.code === "SUBMISSION_APPEAL_REQUIRED") {
          pendingSubmissionPayloadRef.current = submissionPayload;
          setAppealRequired(true);
        }
        if (!isVideo(payload) && payload.code === "PUBLISH_TIME_CONFIRM_REQUIRED") {
          // 发布时间在左栏「更多设置」内，锚点必须与状态机的 firstIssueAnchor 同源，
          // 不能用 "meta"（那是右栏视频标题），且该锚点内部会先展开折叠区再滚动。
          scrollToIssueAnchor("publishedAt");
        }
        const errorMessage = "error" in payload ? payload.error : undefined;
        throw new Error(errorMessage || "提交失败，请稍后重试");
      }

      const submittedVideo = isVideo(payload)
        ? payload
        : isVideo(payload.data)
          ? payload.data
          : isVideo(payload.video)
            ? payload.video
            : null;

      if (!submittedVideo) {
        throw new Error("提交成功，但返回数据格式不正确");
      }

      const aiTags =
        !isVideo(payload) && Array.isArray(payload.ai_tags)
          ? payload.ai_tags
          : [];
      const summaryOverride = createSummaryOverride(account.id, meta, fields);
      setSubmittedReportId(
        !isVideo(payload) && typeof payload.daily_report_id === "string"
          ? payload.daily_report_id
          : null,
      );
      setIsSubmitted(true);
      onSubmitted(submittedVideo, aiTags, summaryOverride);
      trackUsageEvent({ path: "/dashboard", eventType: "submit_daily_report" });
      clearDraft();
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  function requestLateSubmission() {
    if (!account || isAppealSubmitting) return;
    setIsAppealDialogOpen(true);
  }

  async function handleConfirmAppeal() {
    if (!account || isAppealSubmitting) return;
    const reason = appealReason.trim() || "超过 72 小时，需要补交数据";
    setIsAppealSubmitting(true);
    try {
      const response = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          recordDate: meta.bizDate,
          reason,
          submissionPayload: pendingSubmissionPayloadRef.current,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "补交申请提交失败");
      setAppealRequired(false);
      setIsAppealDialogOpen(false);
      feedbackToast.success("补交申请已提交，请等待管理人员审批");
    } catch (error) {
      feedbackToast.error((error as Error).message || "补交申请提交失败");
    } finally {
      setIsAppealSubmitting(false);
    }
  }


  return { executeSubmit, requestLateSubmission, handleConfirmAppeal };
}

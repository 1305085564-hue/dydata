"use client";

import { useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
import { motion } from "framer-motion";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { shakeVariants } from "@/lib/animations";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { getPublishedDateKey } from "@/lib/business-time";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type MetricGroupHandle } from "@/components/submission/指标分组区";
import { 截图对照栏, useCompareRailEnabled } from "@/components/submission/截图对照栏";
import { WorkbenchNoticeCapsule, type WorkbenchNoticeItem } from "@/components/video-submit/workbench-notice-bar";
import {
  areSubmissionScreenshotsRequired,
  canSubmit,
  PUBLISHED_AT_UNCONFIRMED_REASON,
  type SubmissionSlotRole,
} from "@/components/submission/提交状态机";
import {
  isPublishedAtConfirmed,
  VIDEO_SUBMIT_EXPIRED_POST_REVIEW_NOTICE,
  VIDEO_SUBMIT_MANUAL_POST_REVIEW_NOTICE,
} from "@/lib/video-submit-deadline";
import { summarizeSubmissionIssues } from "@/components/submission/填报表单状态";
import {
  getHiddenRoleRestoreLabel,
  resolveAssigneeDisplay,
  resolveVideoSubmitMode,
  isDailyReportOnlyEditDetail,
  type HistoricalAssigneeProfile,
} from "@/lib/video-submit/domain/video-submit-form-state";
import { allocateScreenshotSlots } from "@/lib/video-submit/domain/video-submit-form-model";
import { buildSubmissionState } from "@/lib/video-submit-workflow/selectors";
import { listSubmitGaps, resolveFormProgress } from "@/lib/video-submit/domain/submit-gaps";
import { FormV2Dialogs } from "./form-v2/dialogs";
import { FormV2RolePicker } from "./form-v2/role-picker";
import { FormV2SubmitFooter } from "./form-v2/submit-footer";
import { FormV2Workspace } from "./form-v2/workspace";
import { SubmittedView } from "./form-v2/submitted-view";
import { useAppealActions } from "./form-v2/use-appeal-actions";
import { createUploadHandler } from "./video-submit-form-v2/upload-controller";
import type { UploadHandler } from "./video-submit-form-v2/upload-controller";
import { createSubmitController } from "./video-submit-form-v2/submit-controller";
import { useAssigneeController } from "./video-submit-form-v2/assignee-controller";
import { useVideoSubmitDraftController } from "./video-submit-form-v2/draft-controller";
import { createQualityCheckController } from "./video-submit-form-v2/quality-check-controller";
import { focusSubmissionIssueTarget, scrollToSubmitIssueAnchor, type IssueAnchor } from "./video-submit-form-v2/focus-issue-target";
import { useFormWorkflowState } from "./video-submit-form-v2/use-form-workflow-state";
import { useFormUiState } from "./video-submit-form-v2/use-form-ui-state";
import { useAppealPolling } from "./video-submit-form-v2/use-appeal-polling";
import { useWorkbenchNotices } from "./video-submit-form-v2/use-workbench-notices";
import { runPreSubmitGuard } from "./video-submit-form-v2/submit-guard";
import type { VideoSubmitFormProps } from "./video-submit-form-v2/form-types";

export function VideoSubmitFormV2({
  account, userId, userDisplayName, today, mode, initialSummary,
  editDetail = null, initialBizDate = null, initialTopicId = null, initialTopicTitle = null,
  submittedViewActive = false, userExemptionReviewNotices = [], isExemptionPending = false,
  pendingExemptionItems = [], lastSubmissionPreferences = null,
  onDismissPendingExemption, onWithdrawPendingExemption,
  onSubmitted, onCancel, onCreateAnother, onRequestEdit, onViewHistory, onViewVideo, onProgressChange,
}: VideoSubmitFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const selfLabel = userDisplayName?.trim() || "我";
  const compareRailEnabled = useCompareRailEnabled();

  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsGroupRef = useRef<MetricGroupHandle | null>(null);
  const metaVideoTitleRef = useRef<HTMLInputElement | null>(null);
  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const publishedAtSectionRef = useRef<HTMLDivElement | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    workflow, meta, fields, slots, hasManualEdit, screenshotItemsRef, slotsRef,
    ocrTasksRef, blobUrlsRef, dispatchWorkflow, setMeta, setScreenshotItems,
    setHasManualScriptAuthorSelection, setHasManualOperatorSelection,
    updateItemsState, updateSlotsState, updateMeta, updateField, restoreOcrValue, hasStartedFilling,
    contextResetVersion,
  } = useFormWorkflowState({
    accountId: account?.id ?? null, userId, today, mode, initialSummary, editDetail,
    initialBizDate, submittedViewActive, lastSubmissionPreferences,
  });

  const ui = useFormUiState({
    accountId: account?.id ?? null, initialBizDate, today, initialTopicId, initialTopicTitle,
    contextResetVersion, setMeta, updateMeta, contentTextareaRef,
  });

  const {
    isSubmitting, appealRequired, appealStatus, appealId, appealResultReason,
    isAppealDialogOpen, appealReason, isAppealSubmitting, isSubmitted,
    hasAttemptedSubmit, shakeForm, submittedReportId, submittedVideoId, qualityCheck,
  } = ui.uiState;
  const { hiddenRoles, selectedTopicId, selectedTopicTitle, setHasAttemptedSubmit, triggerFormShake } = ui;

  const isScriptAuthorVisible = Boolean(meta.scriptAuthorUserId && meta.scriptAuthorUserId !== userId) || !hiddenRoles.has("script_author");
  const isVideoEditorVisible = Boolean(meta.videoEditorUserId && meta.videoEditorUserId !== userId) || !hiddenRoles.has("video_editor");
  const isOperatorVisible = Boolean(meta.operatorUserId && meta.operatorUserId !== userId) || !hiddenRoles.has("operator");
  const hasAnyVisibleRole = isScriptAuthorVisible || isVideoEditorVisible || isOperatorVisible;
  const hiddenRoleRestoreLabel = getHiddenRoleRestoreLabel(hiddenRoles);

  const {
    operatorMembers, filteredModalMembers, loadOperatorMembers,
    setRoleUser, hideRole, showAllRoles, setOperatorUser, setScriptAuthorUser,
  } = useAssigneeController({
    userId, memberSearchQuery: ui.memberSearchQuery, setMeta,
    setHasManualScriptAuthorSelection, setHasManualOperatorSelection, setHiddenRoles: ui.setHiddenRoles,
  });

  const visibleMemberIds = useMemo(
    () => (operatorMembers.length > 0 ? new Set(operatorMembers.map((member) => member.id)) : undefined),
    [operatorMembers],
  );
  const historicalAssigneeProfiles: HistoricalAssigneeProfile[] = useMemo(
    () => editDetail?.assigneeProfiles ?? [],
    [editDetail],
  );
  const resolveRoleDisplay = useCallback(
    (assignedUserId: string | null) => resolveAssigneeDisplay({
      assignedUserId, currentUserId: userId, activeMembers: operatorMembers, historicalProfiles: historicalAssigneeProfiles, selfLabel,
    }),
    [historicalAssigneeProfiles, operatorMembers, userId, selfLabel],
  );

  const { clearDraft, pauseSaving, lastSavedAt, showDraftBanner, handleRestoreDraft, handleDiscardDraft, handleUndoDiscard } =
    useVideoSubmitDraftController({
      userId,
      accountId: account?.id ?? null,
      today,
      mode,
      videoId: editDetail?.videoId ?? editDetail?.reportId ?? null,
      workflow, isSubmitted, submittedViewActive, hasInitialSummary: Boolean(initialSummary),
      lastReportPreferences: lastSubmissionPreferences, visibleMemberIds,
      dispatchWorkflow, screenshotItemsRef, slotsRef, setScreenshotItems,
    });

  const { deadlinePrecheck } = useAppealPolling({
    accountId: account?.id ?? null, mode, editDetail, meta, appealStatus,
    setAppealReason: ui.setAppealReason, setAppealStatus: ui.setAppealStatus,
    setAppealResultReason: ui.setAppealResultReason, setIsSubmitted: ui.setIsSubmitted,
    pauseSaving, clearDraft, onSubmitted,
  });

  const activeTopicId = selectedTopicId || initialTopicId;
  const activeTopicTitle = selectedTopicTitle || initialTopicTitle;
  const topicNotice = useMemo<WorkbenchNoticeItem | null>(() => activeTopicId ? {
    id: `topic-${activeTopicId}`,
    type: "topic_context",
    statusTone: "mineral",
    title: "已关联选题",
    description: `· ${activeTopicTitle ? `《${activeTopicTitle}》` : "来自选题库的选题"}，提交后保留关联`,
    topicId: activeTopicId,
  } : null, [activeTopicId, activeTopicTitle]);

  const { workbenchNotices, confirmDiscardDraft } = useWorkbenchNotices({
    showDraftBanner, handleRestoreDraft, handleDiscardDraft, handleUndoDiscard,
    setDiscardConfirmOpen: ui.setDiscardConfirmOpen, isExemptionPending,
    pendingExemptionItems, onDismissPendingExemption, onWithdrawPendingExemption,
    userExemptionReviewNotices, topicNotice,
  });

  const submissionState = buildSubmissionState(slots, fields, isSubmitted);
  const isDailyReportOnly = isDailyReportOnlyEditDetail(editDetail);
  const screenshotsRequired = isDailyReportOnly ? false : areSubmissionScreenshotsRequired(meta.anomalyStatus);
  const publishedAtConfirmed = isPublishedAtConfirmed(meta.publishedAtText);
  const submitMode = resolveVideoSubmitMode({
    panelMode: mode, anomalyStatus: meta.anomalyStatus,
    videoId: editDetail?.videoId ?? null, dailyReportOnly: isDailyReportOnly,
  });
  const issueSummary = useMemo(
    () => summarizeSubmissionIssues(submissionState, {
      topicTag: meta.topicTag, anomalyStatus: meta.anomalyStatus, videoTitle: meta.videoTitle, content: meta.content,
      submissionMode: submitMode, publishedAtConfirmed, screenshotsRequired,
      topicTagRequired: !isDailyReportOnly, contentRequired: !isDailyReportOnly,
    }),
    [submissionState, meta.topicTag, meta.anomalyStatus, meta.videoTitle, meta.content, submitMode, publishedAtConfirmed, screenshotsRequired, isDailyReportOnly],
  );
  const appealPrecheckRequired = false;
  const postReviewNotice =
    deadlinePrecheck.decision === "post_review" && appealStatus === "idle"
      ? deadlinePrecheck.reason === "manual_published_at"
        ? VIDEO_SUBMIT_MANUAL_POST_REVIEW_NOTICE
        : VIDEO_SUBMIT_EXPIRED_POST_REVIEW_NOTICE
      : null;
  const issueSummaryRef = useRef(issueSummary);
  useEffect(() => { issueSummaryRef.current = issueSummary; }, [issueSummary]);

  const allScreenshotsFailed = screenshotsRequired && Object.values(slots).every(
    (slot) => slot.status !== "uploading" && slot.status !== "recognizing" && (slot.status === "failed" || Boolean(slot.ocrFallback)),
  );
  const formProgress = isSubmitted ? null : resolveFormProgress({ summary: issueSummary, hasStartedFilling, allScreenshotsFailed });
  useEffect(() => { onProgressChange?.(formProgress); }, [formProgress, onProgressChange]);
  useEffect(() => () => onProgressChange?.(null), [onProgressChange]);

  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: meta.anomalyStatus, submissionMode: submitMode, publishedAtConfirmed,
    screenshotsRequired, topicTagRequired: !isDailyReportOnly, contentRequired: !isDailyReportOnly,
  });
  const canActuallySubmit = issueSummary.canSubmit;
  const isBackfillMode = mode === "backfill";
  const submitButtonLabel = isSubmitting
    ? "提交中..."
    : isBackfillMode
      ? "补交"
      : mode === "editToday" || initialSummary
        ? "保存修改"
        : "提交";

  const scrollToIssueAnchor = useCallback((anchor: IssueAnchor) => {
    scrollToSubmitIssueAnchor(anchor, { onOpenMoreSection: () => ui.setIsMoreOpen(true) });
  }, [ui]);

  const focusIssueTarget = useCallback((
    anchor: IssueAnchor,
    invalidKey: ReturnType<typeof summarizeSubmissionIssues>["firstInvalidFieldKey"],
    missingRequiredSlotsCount = 0,
  ) => {
    focusSubmissionIssueTarget({
      anchor, invalidKey, missingRequiredSlotsCount,
      focusWithHighlight: ui.focusWithHighlight, triggerSlotsPulse: ui.triggerSlotsPulse,
      metricsGroupRef, metaVideoTitleRef, contentTextareaRef, topicTagSectionRef, publishedAtSectionRef, slotsSectionRef,
    });
  }, [ui.focusWithHighlight, ui.triggerSlotsPulse]);

  const handleGoToTopics = useCallback(() => router.push("/topics"), [router]);
  const { handleQualityCheck, handleFixIssue } = createQualityCheckController({
    submittedReportId, setHasUserInteracted: ui.setHasUserInteracted, setQualityCheck: ui.setQualityCheck,
    setIsSubmitted: ui.setIsSubmitted, updateSlotsState,
    onError: (message) => feedbackToast.error(message),
    onRequestEdit: () => onRequestEdit?.({
      reportId: submittedReportId,
      reportDate: ui.submittedReportDate ?? getPublishedDateKey({ published_at: meta.publishedAt || null, report_date: meta.bizDate }) ?? meta.bizDate,
    }),
    onManualReview: (message) => toast.message(message),
  });

  const uploadHandler = useMemo<UploadHandler>(
    () => createUploadHandler({
      account, userId, initialSummary, supabase, ocrTasksRef, slotsRef,
      itemsRef: screenshotItemsRef, blobUrlsRef, updateItemsState, dispatchWorkflow,
    }),
    [account, userId, initialSummary, supabase, ocrTasksRef, slotsRef, screenshotItemsRef, blobUrlsRef, updateItemsState, dispatchWorkflow],
  );
  const handleSlotUpload = useCallback(
    (role: SubmissionSlotRole, file: File, batchStartedAt?: number) => uploadHandler(role, file, batchStartedAt),
    [uploadHandler],
  );
  const handleSlotRetry = useCallback((role: SubmissionSlotRole) => {
    const slot = slots[role];
    if (!slot.itemId || !(slot.status === "failed" || slot.status === "pending_confirm" || slot.ocrFallback)) return;
    void uploadHandler.retryItem(slot.itemId);
  }, [slots, uploadHandler]);

  const { executeSubmit, requestLateSubmission, handleConfirmAppeal, resumeAppeal } = createSubmitController({
    account, userId, mode, today, workflow, editDetail, selectedTopicId, initialTopicId,
    topicTitle: activeTopicTitle, supabase,
    pendingSubmissionPayload: ui.pendingSubmissionPayload, setPendingSubmissionPayload: ui.setPendingSubmissionPayload,
    setPostReviewResult: ui.setPostReviewResult,
    setIsSubmitting: ui.setIsSubmitting, setAppealRequired: ui.setAppealRequired, setAppealStatus: ui.setAppealStatus,
    setAppealId: ui.setAppealId, setAppealResultReason: ui.setAppealResultReason, setAppealReason: ui.setAppealReason,
    setIsSubmitted: ui.setIsSubmitted, setSubmittedReportId: ui.setSubmittedReportId,
    setSubmittedReportDate: ui.setSubmittedReportDate, setSubmittedVideoId: ui.setSubmittedVideoId,
    setIsAppealDialogOpen: ui.setIsAppealDialogOpen, setIsAppealSubmitting: ui.setIsAppealSubmitting,
    isAppealSubmitting, appealReason, onSubmitted, clearDraft, pauseDraftSaving: pauseSaving, scrollToIssueAnchor,
  });

  const { isAppealResuming, retryAppealResume, withdrawAppeal } = useAppealActions({
    accountId: account?.id ?? null, appealId, bizDate: meta.bizDate, videoTitle: meta.videoTitle, publishedAt: meta.publishedAt,
    resumeAppeal, pauseSaving, clearDraft, onSubmitted,
    setAppealStatus: ui.setAppealStatus, setAppealId: ui.setAppealId,
    setAppealResultReason: ui.setAppealResultReason, setIsSubmitted: ui.setIsSubmitted,
  });

  const isSubmittingRef = useRef(isSubmitting);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const ready = runPreSubmitGuard({
      account, mode, editDetail, isDailyReportOnly, meta, slots, hasManualEdit,
      submitCheckOk: submitCheck.ok, issueSummary, updateItemsState,
      setHasAttemptedSubmit, triggerFormShake, scrollToIssueAnchor, focusIssueTarget,
    });
    if (!ready) return;
    isSubmittingRef.current = true;
    try {
      await executeSubmit();
    } finally {
      isSubmittingRef.current = false;
    }
  }

  const handleUnifiedUpload = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const { roles, overflow } = allocateScreenshotSlots(screenshotItemsRef.current, files.length);
    if (roles.length === 0) {
      feedbackToast.warning("要点开想替换的那张卡片再选图");
      return;
    }
    const batchStartedAt = Date.now();
    roles.forEach((role, index) => void uploadHandler(role, files[index], batchStartedAt));
    if (overflow > 0) feedbackToast.warning(`截图只收两张，多出的 ${overflow} 张没上传`);
  }, [screenshotItemsRef, uploadHandler]);

  const triggerSubmit = useCallback(() => {
    if (!canActuallySubmit) {
      setHasAttemptedSubmit(true);
      triggerFormShake();
      scrollToIssueAnchor(issueSummaryRef.current.firstIssueAnchor);
      focusIssueTarget(
        issueSummaryRef.current.firstIssueAnchor,
        issueSummaryRef.current.firstInvalidFieldKey,
        issueSummaryRef.current.missingRequiredSlots.length,
      );
      const gaps = listSubmitGaps(issueSummaryRef.current);
      if (gaps.length > 0) feedbackToast.warning(`还差 ${gaps.length} 项，第一个是 ${gaps[0].label}`);
      return;
    }
    setHasAttemptedSubmit(true);
    const formEl = document.getElementById("video-submit-form-v2") as HTMLFormElement | null;
    if (formEl) {
      if (formEl.requestSubmit) formEl.requestSubmit();
      else formEl.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  }, [canActuallySubmit, focusIssueTarget, scrollToIssueAnchor, setHasAttemptedSubmit, triggerFormShake]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isSubmittingRef.current) return;
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const cmdEnter = event.key === "Enter" && (isMac ? event.metaKey : event.ctrlKey);
      if (cmdEnter) {
        event.preventDefault();
        triggerSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerSubmit]);

  if (!account) {
    return <div className="py-6 text-[14px] text-[#78716C]">请先选择一个视频账号，再填写提交信息。</div>;
  }

  return (
    <>
      {isSubmitted ? (
        <SubmittedView
          meta={meta} setHasUserInteracted={ui.setHasUserInteracted} handleGoToTopics={handleGoToTopics}
          setIsSubmitted={ui.setIsSubmitted} setSubmittedReportId={ui.setSubmittedReportId}
          submittedReportId={submittedReportId} submittedReportDate={ui.submittedReportDate}
          submittedVideoId={submittedVideoId} postReviewResult={ui.postReviewResult}
          setQualityCheck={ui.setQualityCheck} qualityCheck={qualityCheck}
          onRequestEdit={onRequestEdit} onCancel={onCancel} onCreateAnother={onCreateAnother}
          handleQualityCheck={handleQualityCheck} handleFixIssue={handleFixIssue}
          onViewHistory={onViewHistory} onViewVideo={onViewVideo}
        />
      ) : (
        <>
          <FormV2Dialogs
            deleteTargetRole={ui.deleteTargetRole} setDeleteTargetRole={ui.setDeleteTargetRole}
            slots={slots} blobUrlsRef={blobUrlsRef} updateSlotsState={updateSlotsState}
            isAppealDialogOpen={isAppealDialogOpen} setIsAppealDialogOpen={ui.setIsAppealDialogOpen}
            isAppealSubmitting={isAppealSubmitting} meta={meta} appealReason={appealReason}
            setAppealReason={ui.setAppealReason}
            handleConfirmAppeal={() => void handleConfirmAppeal(ui.pendingSubmissionPayload)}
          />
          <motion.form
            id="video-submit-form-v2"
            onSubmit={handleSubmit}
            initial={false}
            animate={shakeForm ? "animate" : "initial"}
            variants={shakeVariants}
            className="w-full min-[1330px]:grid min-[1330px]:grid-cols-[48rem_360px] min-[1330px]:items-start min-[1330px]:gap-6"
          >
            <div className="max-w-3xl min-w-0 space-y-5 py-0 pb-20 sm:pb-24">
              {workbenchNotices.length > 0 && (
                <div className="flex justify-end">
                  <WorkbenchNoticeCapsule notices={workbenchNotices} />
                </div>
              )}
              <FormV2Workspace
                editing={mode === "editToday"} slots={slots} slotsSectionRef={slotsSectionRef} metricsSectionRef={metricsSectionRef}
                handleSlotUpload={handleSlotUpload} handleUnifiedUpload={handleUnifiedUpload}
                setDeleteTargetRole={ui.setDeleteTargetRole} handleSlotRetry={handleSlotRetry} updateSlotsState={updateSlotsState}
                screenshotsRequired={screenshotsRequired} focusedRole={ui.focusedRole}
                onPreviewSlot={compareRailEnabled ? ui.setCompareRole : undefined} pulseSlots={ui.pulseSlots}
                isMoreOpen={ui.isMoreOpen} setIsMoreOpen={ui.setIsMoreOpen} hiddenRoleRestoreLabel={hiddenRoleRestoreLabel}
                showAllRoles={showAllRoles} hasAnyVisibleRole={hasAnyVisibleRole}
                roleVisible={{ script_author: isScriptAuthorVisible, video_editor: isVideoEditorVisible, operator: isOperatorVisible }}
                resolveRoleDisplay={resolveRoleDisplay} meta={meta} loadOperatorMembers={loadOperatorMembers}
                setSelectingRole={ui.setSelectingRole} hideRole={hideRole} topicTagSectionRef={topicTagSectionRef}
                updateMeta={updateMeta} publishedAtSectionRef={publishedAtSectionRef} issueSummary={issueSummary}
                publishedAtUnconfirmedReason={PUBLISHED_AT_UNCONFIRMED_REASON} fields={fields} metricsGroupRef={metricsGroupRef}
                updateField={updateField} restoreOcrValue={restoreOcrValue} handleFieldFocus={ui.handleFieldFocus}
                handleFieldBlur={ui.handleFieldBlur} hasAttemptedSubmit={hasAttemptedSubmit} metaSectionRef={metaSectionRef}
                metaVideoTitleRef={metaVideoTitleRef} selectedTopicId={selectedTopicId} selectedTopicTitle={selectedTopicTitle}
                handleSelectTopic={ui.handleSelectTopic} handlePasteContent={ui.handlePasteContent}
                isPastedFeedback={ui.isPastedFeedback} contentTextareaRef={contentTextareaRef}
                videoFieldsEnabled={!isDailyReportOnly} disabledMetricKeys={isDailyReportOnly ? ["avg_play_ratio"] : []}
              />
              <FormV2RolePicker
                selectingRole={ui.selectingRole} setSelectingRole={ui.setSelectingRole}
                memberSearchQuery={ui.memberSearchQuery} setMemberSearchQuery={ui.setMemberSearchQuery}
                filteredModalMembers={filteredModalMembers} userId={userId} selfLabel={selfLabel}
                setScriptAuthorUser={setScriptAuthorUser} hideRole={hideRole} setRoleUser={setRoleUser} setOperatorUser={setOperatorUser}
              />
              <FormV2SubmitFooter
                canActuallySubmit={canActuallySubmit} issueSummary={issueSummary} isSubmitted={isSubmitted} lastSavedAt={lastSavedAt}
                appealRequired={appealRequired} appealStatus={appealStatus} appealResultReason={appealResultReason}
                appealPrecheckRequired={appealPrecheckRequired} postReviewNotice={postReviewNotice}
                requestLateSubmission={requestLateSubmission}
                retryAppealResume={retryAppealResume} onWithdrawAppeal={appealId ? withdrawAppeal : undefined}
                isAppealResuming={isAppealResuming} isAppealSubmitting={isAppealSubmitting} isBackfillMode={isBackfillMode}
                submittedViewActive={submittedViewActive} onCancel={onCancel} triggerSubmit={triggerSubmit}
                isSubmitting={isSubmitting} submitButtonLabel={submitButtonLabel}
              />
            </div>
            {compareRailEnabled && (
              <截图对照栏
                images={{ screenshot_1: slots.screenshot_1.assetUrl, screenshot_2: slots.screenshot_2.assetUrl }}
                preferredRole={ui.compareRole} onSelectRole={ui.setCompareRole}
              />
            )}
          </motion.form>
        </>
      )}
      <ConfirmDialog
        open={ui.discardConfirmOpen}
        title="确定丢弃未保存的草稿？"
        description="丢弃后将清除已填写的指标数值、标题文案与截图缓存。可在 5 秒内通过底部提示撤销。"
        confirmText="确定丢弃" cancelText="保留草稿" destructive
        onConfirm={confirmDiscardDraft} onOpenChange={ui.setDiscardConfirmOpen}
      />
    </>
  );
}

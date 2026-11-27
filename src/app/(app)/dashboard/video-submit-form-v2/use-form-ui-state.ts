"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { SelectedTopicInfo } from "@/components/submission/TopicSelectDropdown";
import { cleanLongTextPaste } from "@/lib/text/clean-pasted-text";
import { getSlotRoleForMetric } from "@/lib/video-submit/domain/form-rules";
import type { FormMetaState } from "@/lib/video-submit/domain/video-submit-form-model";
import type { SubmissionAssigneeRole } from "@/lib/video-submit/domain/video-submit-form-state";
import { hasBrowserAppealSuccessSession } from "@/lib/video-submit/domain/appeal-success-session";
import {
  createSubmissionUiState,
  submissionUiReducer,
  type SubmissionUiState,
} from "@/lib/video-submit-workflow/ui-state";

export interface UseFormUiStateOptions {
  accountId: string | null;
  initialBizDate: string | null;
  today: string;
  initialTopicId: string | null;
  initialTopicTitle: string | null;
  contextResetVersion: number;
  setMeta: (next: FormMetaState | ((current: FormMetaState) => FormMetaState)) => void;
  updateMeta: <Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) => void;
  contentTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useFormUiState({
  accountId,
  initialBizDate,
  today,
  initialTopicId,
  initialTopicTitle,
  contextResetVersion,
  setMeta,
  updateMeta,
  contentTextareaRef,
}: UseFormUiStateOptions) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialTopicId ?? null);
  const [selectedTopicTitle, setSelectedTopicTitle] = useState<string | null>(initialTopicTitle ?? null);

  const handleSelectTopic = useCallback(
    (topic: SelectedTopicInfo | null) => {
      if (!topic) {
        setSelectedTopicId(null);
        setSelectedTopicTitle(null);
        return;
      }
      setSelectedTopicId(topic.id);
      setSelectedTopicTitle(topic.title);
      setMeta((current) => ({
        ...current,
        videoTitle: current.videoTitle.trim() ? current.videoTitle : topic.title,
        content: current.content.trim() ? current.content : (topic.hook || topic.outline || ""),
        topicTag:
          current.topicTag ||
          (topic.topicTag === "干货" || topic.topicTag === "复盘" ? topic.topicTag : current.topicTag),
      }));
    },
    [setMeta],
  );

  const [uiState, dispatchUi] = useReducer(submissionUiReducer, undefined, () =>
    createSubmissionUiState({
      isSubmitted: hasBrowserAppealSuccessSession(accountId ?? "", initialBizDate ?? today),
    }),
  );
  const [submittedReportDate, setSubmittedReportDate] = useState<string | null>(null);
  const [pendingSubmissionPayload, setPendingSubmissionPayload] = useState<Record<string, unknown> | null>(null);
  const [postReviewResult, setPostReviewResult] = useState<{
    status: "created" | "partial" | "failed";
    warning: string | null;
    triggerReason?: "expired" | "manual_published_at";
  } | null>(null);
  const [, setHasUserInteracted] = useState(false);

  const updateUi = useCallback(
    (updater: (current: SubmissionUiState) => SubmissionUiState) =>
      dispatchUi({ type: "update", updater }),
    [],
  );

  const setUiField = useCallback(
    <K extends keyof SubmissionUiState>(
      key: K,
      next: SubmissionUiState[K] | ((current: SubmissionUiState[K]) => SubmissionUiState[K]),
    ) => {
      updateUi((current) => ({
        ...current,
        [key]:
          typeof next === "function"
            ? (next as (current: SubmissionUiState[K]) => SubmissionUiState[K])(current[key])
            : next,
      }));
    },
    [updateUi],
  );

  const setIsSubmitting = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isSubmitting", next), [setUiField]);
  const setAppealRequired = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("appealRequired", next), [setUiField]);
  const setAppealStatus = useCallback(
    (next: SubmissionUiState["appealStatus"] | ((current: SubmissionUiState["appealStatus"]) => SubmissionUiState["appealStatus"])) =>
      setUiField("appealStatus", next),
    [setUiField],
  );
  const setAppealId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("appealId", next), [setUiField]);
  const setAppealResultReason = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("appealResultReason", next), [setUiField]);
  const setIsAppealDialogOpen = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isAppealDialogOpen", next), [setUiField]);
  const setAppealReason = useCallback((next: string | ((current: string) => string)) => setUiField("appealReason", next), [setUiField]);
  const setIsAppealSubmitting = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isAppealSubmitting", next), [setUiField]);
  const setIsSubmitted = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setUiField("isSubmitted", next);
      if (next === false) {
        setHasUserInteracted(false);
      }
    },
    [setUiField],
  );
  const setHasAttemptedSubmit = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("hasAttemptedSubmit", next), [setUiField]);
  const setSubmittedReportId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("submittedReportId", next), [setUiField]);
  const setSubmittedVideoId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("submittedVideoId", next), [setUiField]);
  const setQualityCheck = useCallback(
    (next: SubmissionUiState["qualityCheck"] | ((current: SubmissionUiState["qualityCheck"]) => SubmissionUiState["qualityCheck"])) =>
      setUiField("qualityCheck", next),
    [setUiField],
  );

  const triggerFormShake = useCallback(() => {
    setUiField("shakeForm", true);
    setTimeout(() => setUiField("shakeForm", false), 500);
  }, [setUiField]);

  const [deleteTargetRole, setDeleteTargetRole] = useState<SubmissionSlotRole | null>(null);
  const [focusedRole, setFocusedRole] = useState<SubmissionSlotRole | null>(null);
  const [compareRole, setCompareRole] = useState<SubmissionSlotRole | null>(null);
  const [selectingRole, setSelectingRole] = useState<{
    role: "script_author" | "video_editor" | "operator";
    label: string;
    selectedUserId: string | null;
  } | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [hiddenRoles, setHiddenRoles] = useState<Set<SubmissionAssigneeRole>>(new Set());
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [pulseSlots, setPulseSlots] = useState(false);
  const [isPastedFeedback, setIsPastedFeedback] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseSlotsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevResetVersion, setPrevResetVersion] = useState(contextResetVersion);
  if (prevResetVersion !== contextResetVersion) {
    setPrevResetVersion(contextResetVersion);
    setIsSubmitted(false);
    setSubmittedReportId(null);
    setPendingSubmissionPayload(null);
    setPostReviewResult(null);
    setQualityCheck({ data: null, loading: false });
    setDeleteTargetRole(null);
    setFocusedRole(null);
    setCompareRole(null);
  }

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (pulseSlotsTimerRef.current) clearTimeout(pulseSlotsTimerRef.current);
    };
  }, []);

  const focusWithHighlight = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (
      el.tabIndex < 0 &&
      el.tagName !== "INPUT" &&
      el.tagName !== "TEXTAREA" &&
      el.tagName !== "BUTTON" &&
      el.tagName !== "SELECT"
    ) {
      el.tabIndex = -1;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
    const highlightClasses = ["ring-2", "ring-status-warning", "ring-offset-1"];
    el.classList.add(...highlightClasses);
    const removeHighlight = () => {
      el.classList.remove(...highlightClasses);
      el.removeEventListener("input", removeHighlight);
      el.removeEventListener("click", removeHighlight);
    };
    el.addEventListener("input", removeHighlight, { once: true });
    el.addEventListener("click", removeHighlight, { once: true });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      removeHighlight();
      highlightTimerRef.current = null;
    }, 2000);
  }, []);

  const triggerSlotsPulse = useCallback(() => {
    setPulseSlots(true);
    if (pulseSlotsTimerRef.current) clearTimeout(pulseSlotsTimerRef.current);
    pulseSlotsTimerRef.current = setTimeout(() => {
      setPulseSlots(false);
      pulseSlotsTimerRef.current = null;
    }, 1800);
  }, []);

  const handleFieldFocus = useCallback((key: EditableMetricKey) => {
    const role = getSlotRoleForMetric(key);
    setFocusedRole(role);
    setCompareRole(role);
  }, []);

  const handleFieldBlur = useCallback(() => {
    setFocusedRole(null);
  }, []);

  const handlePasteContent = useCallback(async () => {
    try {
      const rawText = await navigator.clipboard.readText();
      const text = cleanLongTextPaste(rawText);
      if (text) {
        updateMeta("content", text);
        setIsPastedFeedback(true);
        window.setTimeout(() => setIsPastedFeedback(false), 1200);
      } else {
        feedbackToast.error("剪贴板内容为空");
      }
    } catch {
      feedbackToast.error("浏览器没给读取剪贴板的权限，请在文案框里手动粘贴");
      contentTextareaRef.current?.focus();
    }
  }, [contentTextareaRef, updateMeta]);

  return {
    uiState,
    submittedReportDate,
    setSubmittedReportDate,
    pendingSubmissionPayload,
    setPendingSubmissionPayload,
    postReviewResult,
    setPostReviewResult,
    setIsSubmitting,
    setAppealRequired,
    setAppealStatus,
    setAppealId,
    setAppealResultReason,
    setIsAppealDialogOpen,
    setAppealReason,
    setIsAppealSubmitting,
    setIsSubmitted,
    setHasAttemptedSubmit,
    setSubmittedReportId,
    setSubmittedVideoId,
    setQualityCheck,
    triggerFormShake,
    deleteTargetRole,
    setDeleteTargetRole,
    focusedRole,
    compareRole,
    setCompareRole,
    selectingRole,
    setSelectingRole,
    memberSearchQuery,
    setMemberSearchQuery,
    hiddenRoles,
    setHiddenRoles,
    isMoreOpen,
    setIsMoreOpen,
    pulseSlots,
    triggerSlotsPulse,
    focusWithHighlight,
    handleFieldFocus,
    handleFieldBlur,
    selectedTopicId,
    selectedTopicTitle,
    handleSelectTopic,
    setHasUserInteracted,
    isPastedFeedback,
    handlePasteContent,
    discardConfirmOpen,
    setDiscardConfirmOpen,
  };
}

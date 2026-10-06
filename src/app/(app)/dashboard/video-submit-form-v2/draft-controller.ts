"use client";

import { useCallback, useMemo } from "react";
import { useFormDraft } from "@/hooks/use-form-draft";
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import { buildVideoSubmitDraftKey, resolveVideoSubmitCreateDraftStorageKey, type VideoSubmitDraftMode } from "@/lib/video-submit-draft-key";
import { serializeVideoSubmitDraft } from "@/lib/video-submit-workflow/selectors";
import type {
  SubmissionWorkflowState,
  VideoSubmitDraftData,
  WorkflowAction,
} from "@/lib/video-submit-workflow/types";
import { setOperatorToSelf as resolveSelfOperatorUserId } from "../video-submit-form-state";
import type { SubmitPanelMode } from "@/lib/dashboard-submission-state";

export type DraftControllerOptions = {
  userId: string;
  accountId: string | null;
  today: string;
  mode: SubmitPanelMode;
  videoId: string | null;
  workflow: SubmissionWorkflowState;
  isSubmitted: boolean;
  submittedViewActive: boolean;
  hasInitialSummary: boolean;
  dispatchWorkflow: (action: WorkflowAction) => void;
};

export function useVideoSubmitDraftController(options: DraftControllerOptions) {
  const {
    userId,
    accountId,
    today,
    mode,
    videoId,
    workflow,
    isSubmitted,
    submittedViewActive,
    hasInitialSummary,
    dispatchWorkflow,
  } = options;
  const draftMode: VideoSubmitDraftMode =
    mode === "editToday" ? "edit" : mode === "backfill" ? "backfill" : "create";
  const createDraftStorageKey = useMemo(
    () =>
      resolveVideoSubmitCreateDraftStorageKey({
        userId,
        accountId,
        bizDate: today,
      }),
    [accountId, userId, today],
  );
  const editDraftVideoId = videoId;
  const draftKey = useMemo(() => {
    if (draftMode === "create") return createDraftStorageKey;
    return buildVideoSubmitDraftKey({
      userId,
      mode: draftMode,
      accountId,
      bizDate: workflow.meta.bizDate || today,
      videoId: editDraftVideoId,
    });
  }, [accountId, createDraftStorageKey, draftMode, editDraftVideoId, today, userId, workflow.meta.bizDate]);

  const draftData: VideoSubmitDraftData = useMemo(
    () => serializeVideoSubmitDraft(workflow),
    [workflow],
  );

  const { hasDraft, restoreDraft, clearDraft, lastSavedAt } =
    useFormDraft<VideoSubmitDraftData>(
      draftKey,
      draftData,
      [workflow],
      { isEmpty: isVideoSubmitDraftEmpty },
    );

  const showDraftBanner =
    hasDraft && !isSubmitted && !submittedViewActive && !hasInitialSummary;

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (!draft) return;

    dispatchWorkflow({
      type: "draft/restore",
      meta: {
        ...draft.meta,
        scriptAuthorUserId:
          draft.meta.scriptAuthorUserId ?? resolveSelfOperatorUserId(userId),
        videoEditorUserId:
          draft.meta.videoEditorUserId ?? resolveSelfOperatorUserId(userId),
        operatorUserId:
          draft.meta.operatorUserId ?? resolveSelfOperatorUserId(userId),
        roleOverrides: draft.meta.roleOverrides ?? [],
      },
      fields: draft.fields,
      slots: {
        screenshot_1: {
          ...draft.slots.screenshot_1,
          file: null,
          previewUrl: null,
        },
        screenshot_2: {
          ...draft.slots.screenshot_2,
          file: null,
          previewUrl: null,
        },
      },
      draft: {
        scriptText: draft.scriptText ?? "",
        keywordInput: draft.keywordInput ?? "",
        hasManualScriptAuthorSelection:
          draft.hasManualScriptAuthorSelection ?? false,
        hasManualOperatorSelection: draft.hasManualOperatorSelection ?? false,
        hasManualEdit: draft.hasManualEdit ?? false,
      },
    });
  }, [dispatchWorkflow, restoreDraft, userId]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

  return {
    hasDraft,
    restoreDraft,
    clearDraft,
    lastSavedAt,
    showDraftBanner,
    handleRestoreDraft,
    handleDiscardDraft,
  };
}

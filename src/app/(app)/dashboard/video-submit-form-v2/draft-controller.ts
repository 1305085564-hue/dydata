"use client";

import { useCallback, useMemo } from "react";
import { useFormDraft } from "@/hooks/use-form-draft";
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import { buildVideoSubmitDraftKey, resolveVideoSubmitCreateDraftStorageKey, type VideoSubmitDraftMode } from "@/lib/video-submit-draft-key";
import { serializeVideoSubmitDraft } from "@/lib/video-submit-workflow/selectors";
import type { VideoSubmitDraftData } from "@/lib/video-submit-workflow/types";
import { setOperatorToSelf as resolveSelfOperatorUserId } from "../video-submit-form-state";
import type { EditableMetricField, FormMetaState, SlotViewState } from "../video-submit-form-model";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { SubmitPanelMode } from "@/lib/dashboard-submission-state";

type Slots = Record<SubmissionSlotRole, SlotViewState>;
export type DraftControllerOptions = {
  userId: string; accountId: string | null; today: string; mode: SubmitPanelMode; videoId: string | null;
  meta: FormMetaState; fields: Record<EditableMetricKey, EditableMetricField>; slots: Slots; scriptText: string; keywordInput: string;
  hasManualScriptAuthorSelection: boolean; hasManualOperatorSelection: boolean; hasManualEdit: boolean; isSubmitted: boolean; submittedViewActive: boolean; hasInitialSummary: boolean;
  dispatchWorkflow: (action: { type: "draft/restore"; meta: FormMetaState; fields: Record<EditableMetricKey, EditableMetricField>; slots: Slots }) => void;
  setHasManualScriptAuthorSelection: (next: boolean) => void; setHasManualOperatorSelection: (next: boolean) => void; setHasManualEdit: (next: boolean | ((current: boolean) => boolean)) => void; setScriptText: (next: string) => void; setKeywordInput: (next: string) => void;
};

export function useVideoSubmitDraftController(options: DraftControllerOptions) {
  const { userId, accountId, today, mode, videoId, meta, fields, slots, scriptText, keywordInput, hasManualScriptAuthorSelection, hasManualOperatorSelection, hasManualEdit, isSubmitted, submittedViewActive, hasInitialSummary, dispatchWorkflow, setHasManualScriptAuthorSelection, setHasManualOperatorSelection, setHasManualEdit, setScriptText, setKeywordInput } = options;
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
      bizDate: meta.bizDate || today,
      videoId: editDraftVideoId,
    });
  }, [accountId, createDraftStorageKey, draftMode, editDraftVideoId, meta.bizDate, today, userId]);

  const draftData: VideoSubmitDraftData = useMemo(
    () => serializeVideoSubmitDraft({
      meta,
      fields,
      slots,
      scriptText,
      keywordInput,
      hasManualScriptAuthorSelection,
      hasManualOperatorSelection,
      hasManualEdit,
    }),
    [
      meta,
      fields,
      slots,
      scriptText,
      keywordInput,
      hasManualScriptAuthorSelection,
      hasManualOperatorSelection,
      hasManualEdit,
    ],
  );

  const { hasDraft, restoreDraft, clearDraft, lastSavedAt } =
    useFormDraft<VideoSubmitDraftData>(
      draftKey,
      draftData,
      [
        meta,
        fields,
        slots,
        scriptText,
        keywordInput,
        hasManualScriptAuthorSelection,
        hasManualOperatorSelection,
        hasManualEdit,
      ],
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
    });
    setHasManualScriptAuthorSelection(
      draft.hasManualScriptAuthorSelection ?? false,
    );
    setHasManualOperatorSelection(draft.hasManualOperatorSelection ?? false);
    setHasManualEdit((current) => current || Boolean(draft.hasManualEdit));
    setScriptText(draft.scriptText);
    setKeywordInput(draft.keywordInput);
  }, [dispatchWorkflow, restoreDraft, setHasManualEdit, setHasManualOperatorSelection, setHasManualScriptAuthorSelection, setKeywordInput, setScriptText, userId]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

  return { hasDraft, restoreDraft, clearDraft, lastSavedAt, showDraftBanner, handleRestoreDraft, handleDiscardDraft };
}

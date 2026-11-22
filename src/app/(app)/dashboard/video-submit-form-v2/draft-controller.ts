"use client";

import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFormDraft } from "@/hooks/use-form-draft";
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import { buildVideoSubmitDraftKey, resolveVideoSubmitCreateDraftStorageKey, type VideoSubmitDraftMode } from "@/lib/video-submit-draft-key";
import { sanitizeDraftSlot, serializeVideoSubmitDraft } from "@/lib/video-submit-workflow/selectors";
import { createScreenshotItemsFromSlots, deriveSlotsFromItems, type ScreenshotItem, type SlotViewState } from "@/lib/video-submit/domain/video-submit-form-model";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type {
  SubmissionWorkflowState,
  VideoSubmitDraftData,
  WorkflowAction,
} from "@/lib/video-submit-workflow/types";
import type { SubmitPanelMode } from "@/lib/dashboard-submission-state";
import {
  resolveCreateSubmissionPreferences,
  type LastSubmittedReportPreferences,
} from "@/lib/video-submit-preferences";

export type DraftControllerOptions = {
  userId: string;
  accountId: string | null;
  today: string;
  mode: SubmitPanelMode;
  lastReportPreferences?: LastSubmittedReportPreferences | null;
  visibleMemberIds?: ReadonlySet<string>;
  videoId: string | null;
  workflow: SubmissionWorkflowState;
  isSubmitted: boolean;
  submittedViewActive: boolean;
  hasInitialSummary: boolean;
  dispatchWorkflow: (action: WorkflowAction) => void;
  screenshotItemsRef: MutableRefObject<ScreenshotItem[]>;
  slotsRef: MutableRefObject<Record<SubmissionSlotRole, SlotViewState>>;
  setScreenshotItems: (items: ScreenshotItem[]) => void;
};

export function applyRestoredVideoSubmitDraft(
  draft: VideoSubmitDraftData,
  options: Pick<DraftControllerOptions,
    | "userId" | "lastReportPreferences" | "visibleMemberIds"
    | "dispatchWorkflow" | "screenshotItemsRef" | "slotsRef" | "setScreenshotItems"
  >,
) {
  const items = createScreenshotItemsFromSlots({
    screenshot_1: sanitizeDraftSlot(draft.slots.screenshot_1),
    screenshot_2: sanitizeDraftSlot(draft.slots.screenshot_2),
  });
  const slots = deriveSlotsFromItems(items);
  options.screenshotItemsRef.current = items;
  options.slotsRef.current = slots;
  options.setScreenshotItems(items);
  options.dispatchWorkflow({
    type: "draft/restore",
    meta: {
      ...draft.meta,
      ...resolveCreateSubmissionPreferences({
        userId: options.userId,
        lastReport: options.lastReportPreferences,
        draft: draft.meta,
        visibleMemberIds: options.visibleMemberIds,
      }),
      roleOverrides: draft.meta.roleOverrides ?? [],
    },
    fields: draft.fields,
    slots,
    draft: {
      keywordInput: draft.keywordInput ?? "",
      hasManualScriptAuthorSelection: draft.hasManualScriptAuthorSelection ?? false,
      hasManualOperatorSelection: draft.hasManualOperatorSelection ?? false,
      hasManualEdit: draft.hasManualEdit ?? false,
    },
  });
}

export function resolveDraftPromptState(input: {
  hasDraft: boolean;
  isSubmitted: boolean;
  submittedViewActive: boolean;
  hasInitialSummary: boolean;
  promptDismissed: boolean;
  lastSavedAt: Date | null;
}) {
  const showDraftBanner =
    input.hasDraft &&
    !input.isSubmitted &&
    !input.submittedViewActive &&
    !input.hasInitialSummary &&
    !input.promptDismissed;

  return {
    showDraftBanner,
    displayLastSavedAt: showDraftBanner ? null : input.lastSavedAt,
  };
}

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
  const [dismissedDraftKey, setDismissedDraftKey] = useState<string | null>(null);

  const draftData: VideoSubmitDraftData = useMemo(
    () => serializeVideoSubmitDraft(workflow),
    [workflow],
  );

  const { hasDraft, hasStoredDraft, restoreDraft, clearDraft, pauseSaving, resumeSaving, lastSavedAt } =
    useFormDraft<VideoSubmitDraftData>(
      draftKey,
      draftData,
      [workflow],
      {
        isEmpty: isVideoSubmitDraftEmpty,
        paused: isSubmitted || submittedViewActive,
      },
    );

  const draftPromptState = resolveDraftPromptState({
    hasDraft: hasStoredDraft,
    isSubmitted,
    submittedViewActive,
    hasInitialSummary,
    promptDismissed: dismissedDraftKey === draftKey,
    lastSavedAt,
  });

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (!draft) return;

    applyRestoredVideoSubmitDraft(draft, options);
    setDismissedDraftKey(draftKey);
  }, [draftKey, options, restoreDraft]);

  const lastDiscardedDraftRef = useRef<VideoSubmitDraftData | null>(null);

  const handleDiscardDraft = useCallback(() => {
    const draft = restoreDraft();
    if (draft) {
      lastDiscardedDraftRef.current = draft;
    }
    clearDraft();
    setDismissedDraftKey(draftKey);
  }, [clearDraft, draftKey, restoreDraft]);

  const handleUndoDiscard = useCallback(() => {
    const draft = lastDiscardedDraftRef.current;
    if (!draft) return;

    applyRestoredVideoSubmitDraft(draft, options);

    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ data: { ...draft, slots: options.slotsRef.current }, savedAt: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
    setDismissedDraftKey(null);
  }, [draftKey, options]);

  return {
    hasDraft,
    restoreDraft,
    clearDraft,
    pauseSaving,
    resumeSaving,
    lastSavedAt: draftPromptState.displayLastSavedAt,
    showDraftBanner: draftPromptState.showDraftBanner,
    handleRestoreDraft,
    handleDiscardDraft,
    handleUndoDiscard,
  };
}

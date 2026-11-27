"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  SubmitPanelMode,
  TodaySubmissionSummary,
} from "@/lib/dashboard-submission-state";
import type { LastSubmittedReportPreferences } from "@/lib/video-submit-preferences";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";
import { hasActualFieldChange } from "@/lib/daily-report-data-source";
import { restoreOcrFieldValue, toManualFieldState } from "@/components/submission/填报表单状态";
import type { VideoSubmissionEditDetail } from "@/lib/video-submit/domain/video-submit-form-state";
import {
  createEditableFields,
  createEditableFieldsFromEditDetail,
  createEditableSlots,
  createEditableSlotsFromEditDetail,
  createInitialMeta,
  createMetaFromEditDetail,
  createScreenshotItemsFromEditDetail,
  deriveSlotsFromItems,
  type EditableMetricField,
  type FormMetaState,
  type ScreenshotItem,
  type SlotViewState,
} from "@/lib/video-submit/domain/video-submit-form-model";
import { createWorkflowState, workflowReducer } from "@/lib/video-submit-workflow/reducer";
import type { WorkflowDraftState } from "@/lib/video-submit-workflow/types";
import { createOcrTaskRegistry, type OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import {
  getBrowserAppealSuccessPublishedAt,
  getBrowserAppealSuccessTitle,
} from "@/lib/video-submit/domain/appeal-success-session";

export interface UseFormWorkflowStateOptions {
  accountId: string | null;
  userId: string;
  today: string;
  mode: SubmitPanelMode;
  initialSummary: TodaySubmissionSummary | null;
  editDetail: VideoSubmissionEditDetail | null;
  initialBizDate: string | null;
  submittedViewActive: boolean;
  lastSubmissionPreferences: LastSubmittedReportPreferences | null;
}

function buildContextMeta(params: {
  editDetail: VideoSubmissionEditDetail | null;
  today: string;
  userId: string;
  initialBizDate: string | null;
  mode: SubmitPanelMode;
  lastSubmissionPreferences: LastSubmittedReportPreferences | null;
  initialSummary: TodaySubmissionSummary | null;
  accountId: string | null;
  includeAppealSuccessSession: boolean;
}): FormMetaState {
  const {
    editDetail,
    today,
    userId,
    initialBizDate,
    mode,
    lastSubmissionPreferences,
    initialSummary,
    accountId,
    includeAppealSuccessSession,
  } = params;
  const base = editDetail
    ? createMetaFromEditDetail(editDetail, today, userId)
    : createInitialMeta(
        today,
        userId,
        initialBizDate ?? today,
        mode === "editToday" ? null : lastSubmissionPreferences,
      );
  const nextMeta: FormMetaState = { ...base };
  if (initialBizDate) {
    nextMeta.bizDate = initialBizDate;
  }
  if (initialSummary && !editDetail) {
    nextMeta.videoTitle = initialSummary.title ?? "";
    nextMeta.content = initialSummary.content ?? "";
    nextMeta.bizDate = initialSummary.reportDate;
    nextMeta.publishedAt = initialSummary.publishedAt ?? nextMeta.publishedAt;
    nextMeta.uploadedAt = initialSummary.uploadedAt ?? nextMeta.uploadedAt;
  }
  if (includeAppealSuccessSession && !editDetail && !nextMeta.uploadedAt) {
    const appealSuccessTitle = getBrowserAppealSuccessTitle(accountId ?? "", initialBizDate ?? today);
    const appealSuccessPublishedAt = getBrowserAppealSuccessPublishedAt(accountId ?? "", initialBizDate ?? today);
    nextMeta.uploadedAt = new Date().toLocaleString("zh-CN");
    if (appealSuccessTitle) nextMeta.videoTitle = appealSuccessTitle;
    if (appealSuccessPublishedAt) nextMeta.publishedAt = appealSuccessPublishedAt;
  }
  return nextMeta;
}

export function useFormWorkflowState({
  accountId,
  userId,
  today,
  mode,
  initialSummary,
  editDetail,
  initialBizDate,
  submittedViewActive,
  lastSubmissionPreferences,
}: UseFormWorkflowStateOptions) {
  const initialScreenshotItems = useMemo(
    () => (editDetail ? createScreenshotItemsFromEditDetail(editDetail) : []),
    [editDetail],
  );
  const screenshotItemsRef = useRef<ScreenshotItem[]>(initialScreenshotItems);
  const [screenshotItems, setScreenshotItems] = useState<ScreenshotItem[]>(initialScreenshotItems);
  const [contextResetVersion, setContextResetVersion] = useState(0);

  const [workflow, dispatchWorkflow] = useReducer(workflowReducer, undefined, () => {
    const meta = buildContextMeta({
      editDetail,
      today,
      userId,
      initialBizDate,
      mode,
      lastSubmissionPreferences,
      initialSummary,
      accountId,
      includeAppealSuccessSession: true,
    });
    return createWorkflowState({
      meta,
      fields: editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
      slots:
        initialScreenshotItems.length > 0
          ? deriveSlotsFromItems(initialScreenshotItems)
          : editDetail
            ? createEditableSlotsFromEditDetail(editDetail)
            : createEditableSlots(),
      draft: {
        hasManualEdit: editDetail?.dataSource === "manual",
      },
    });
  });

  const [prevContext, setPrevContext] = useState({
    accountId,
    editDetail,
    initialBizDate,
    initialSummary,
    lastSubmissionPreferences,
    mode,
    submittedViewActive,
    today,
    userId,
  });

  if (
    prevContext.accountId !== accountId ||
    prevContext.editDetail !== editDetail ||
    prevContext.initialBizDate !== initialBizDate ||
    prevContext.initialSummary !== initialSummary ||
    prevContext.lastSubmissionPreferences !== lastSubmissionPreferences ||
    prevContext.mode !== mode ||
    prevContext.submittedViewActive !== submittedViewActive ||
    prevContext.today !== today ||
    prevContext.userId !== userId
  ) {
    setPrevContext({
      accountId,
      editDetail,
      initialBizDate,
      initialSummary,
      lastSubmissionPreferences,
      mode,
      submittedViewActive,
      today,
      userId,
    });
    if (!submittedViewActive) {
      const nextMeta = buildContextMeta({
        editDetail,
        today,
        userId,
        initialBizDate,
        mode,
        lastSubmissionPreferences,
        initialSummary,
        accountId,
        includeAppealSuccessSession: false,
      });
      const nextItems = editDetail ? createScreenshotItemsFromEditDetail(editDetail) : [];
      const nextSlots = nextItems.length > 0 ? deriveSlotsFromItems(nextItems) : createEditableSlots();
      setScreenshotItems(nextItems);
      dispatchWorkflow({
        type: "draft/restore",
        meta: nextMeta,
        fields: editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
        slots: nextSlots,
        draft: {
          keywordInput: "",
          hasManualScriptAuthorSelection: false,
          hasManualOperatorSelection: false,
          hasManualEdit: editDetail?.dataSource === "manual",
        },
      });
      setContextResetVersion((version) => version + 1);
    }
  }

  const { meta, fields, slots, hasManualEdit } = workflow;

  const setMeta = useCallback(
    (next: FormMetaState | ((current: FormMetaState) => FormMetaState)) => {
      dispatchWorkflow({
        type: "meta/update",
        updater: typeof next === "function" ? next : () => next,
      });
    },
    [],
  );

  const setFields = useCallback(
    (
      next:
        | Record<EditableMetricKey, EditableMetricField>
        | ((
            current: Record<EditableMetricKey, EditableMetricField>,
          ) => Record<EditableMetricKey, EditableMetricField>),
    ) => {
      dispatchWorkflow({
        type: "fields/update",
        updater: typeof next === "function" ? next : () => next,
      });
    },
    [],
  );

  const setSlots = useCallback(
    (
      next:
        | Record<SubmissionSlotRole, SlotViewState>
        | ((
            current: Record<SubmissionSlotRole, SlotViewState>,
          ) => Record<SubmissionSlotRole, SlotViewState>),
    ) => {
      dispatchWorkflow({
        type: "slots/update",
        updater: typeof next === "function" ? next : () => next,
      });
    },
    [],
  );

  const updateWorkflowDraft = useCallback(
    (updater: (current: WorkflowDraftState) => WorkflowDraftState) => {
      dispatchWorkflow({ type: "draft/update", updater });
    },
    [],
  );

  const setHasManualEdit = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      updateWorkflowDraft((current) => ({
        ...current,
        hasManualEdit: typeof next === "function" ? next(current.hasManualEdit) : next,
      }));
    },
    [updateWorkflowDraft],
  );

  const setHasManualScriptAuthorSelection = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      updateWorkflowDraft((current) => ({
        ...current,
        hasManualScriptAuthorSelection:
          typeof next === "function" ? next(current.hasManualScriptAuthorSelection) : next,
      }));
    },
    [updateWorkflowDraft],
  );

  const setHasManualOperatorSelection = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      updateWorkflowDraft((current) => ({
        ...current,
        hasManualOperatorSelection:
          typeof next === "function" ? next(current.hasManualOperatorSelection) : next,
      }));
    },
    [updateWorkflowDraft],
  );

  const slotsRef = useRef(slots);
  const [ocrTasks] = useState<OcrTaskRegistry>(() => createOcrTaskRegistry());
  const ocrTasksRef = useRef<OcrTaskRegistry | null>(ocrTasks);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const updateItemsState = useCallback(
    (updater: (current: ScreenshotItem[]) => ScreenshotItem[]) => {
      const nextItems = updater(screenshotItemsRef.current);
      screenshotItemsRef.current = nextItems;
      setScreenshotItems(nextItems);
      const nextSlots = deriveSlotsFromItems(nextItems);
      slotsRef.current = nextSlots;
      setSlots(() => nextSlots);
    },
    [setSlots],
  );

  const updateSlotsState = useCallback(
    (
      updater:
        | Record<SubmissionSlotRole, SlotViewState>
        | ((
            current: Record<SubmissionSlotRole, SlotViewState>,
          ) => Record<SubmissionSlotRole, SlotViewState>),
    ) => {
      setSlots((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        const removedItemIds = (Object.keys(current) as SubmissionSlotRole[])
          .filter((role) => current[role].itemId && next[role].status === "empty" && !next[role].itemId)
          .map((role) => current[role].itemId as string);
        if (removedItemIds.length > 0) {
          for (const itemId of removedItemIds) ocrTasksRef.current?.cancel(itemId);
          const nextItems = screenshotItemsRef.current.filter(
            (item) => !removedItemIds.includes(item.id),
          );
          screenshotItemsRef.current = nextItems;
          setScreenshotItems(nextItems);
        }
        slotsRef.current = next;
        return next;
      });
    },
    [setSlots],
  );

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    screenshotItemsRef.current = screenshotItems;
  }, [screenshotItems]);

  useEffect(() => {
    if (contextResetVersion === 0) return;
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
  }, [contextResetVersion]);

  useEffect(() => {
    Object.values(slots).forEach((slot) => {
      if (slot.previewUrl && slot.previewUrl.startsWith("blob:")) {
        blobUrlsRef.current.add(slot.previewUrl);
      }
    });
  }, [slots]);

  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      blobUrls.clear();
    };
  }, []);

  useEffect(
    () => () => {
      ocrTasksRef.current?.cancel("screenshot_1");
      ocrTasksRef.current?.cancel("screenshot_2");
      ocrTasksRef.current?.cancelAll();
    },
    [],
  );

  const updateMeta = useCallback(
    <Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) => {
      setMeta((current) => ({ ...current, [key]: value }));
    },
    [setMeta],
  );

  const updateField = useCallback(
    (key: EditableMetricKey, value: string) => {
      if (hasActualFieldChange(fields[key].value, value)) {
        setHasManualEdit(true);
      }
      setFields((current) => ({
        ...current,
        [key]: toManualFieldState({
          ...current[key],
          value,
        }),
      }));
    },
    [fields, setFields, setHasManualEdit],
  );

  const restoreOcrValue = useCallback(
    (key: EditableMetricKey) => {
      setFields((current) => ({
        ...current,
        [key]: restoreOcrFieldValue(current[key]),
      }));
    },
    [setFields],
  );

  const hasStartedFilling = useMemo(() => {
    if (screenshotItems.length > 0 || Object.values(slots).some((slot) => slot.status !== "empty")) {
      return true;
    }
    if (Object.values(fields).some((field) => Boolean(field?.value?.trim()))) return true;
    return Boolean(meta.videoTitle.trim() || meta.content.trim());
  }, [fields, meta.content, meta.videoTitle, screenshotItems.length, slots]);

  return {
    workflow,
    meta,
    fields,
    slots,
    hasManualEdit,
    screenshotItems,
    screenshotItemsRef,
    slotsRef,
    ocrTasksRef,
    blobUrlsRef,
    dispatchWorkflow,
    setMeta,
    setScreenshotItems,
    setHasManualScriptAuthorSelection,
    setHasManualOperatorSelection,
    updateItemsState,
    updateSlotsState,
    updateMeta,
    updateField,
    restoreOcrValue,
    hasStartedFilling,
    contextResetVersion,
  };
}

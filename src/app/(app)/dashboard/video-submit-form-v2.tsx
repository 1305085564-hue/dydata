"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  type FormEvent,
} from "react";
import { motion } from "framer-motion";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { shakeVariants } from "@/lib/animations";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { getPublishedDateKey } from "@/lib/business-time";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Video } from "@/types";

import { type MetricGroupHandle } from "@/components/submission/指标分组区";
import { 截图对照栏, useCompareRailEnabled } from "@/components/submission/截图对照栏";
import { type SelectedTopicInfo } from "@/components/submission/TopicSelectDropdown";
import {
  WorkbenchNoticeCapsule,
  buildExemptionReviewNoticeItems,
  buildPendingExemptionNoticeItem,
  type WorkbenchNoticeItem,
} from "@/components/video-submit/workbench-notice-bar";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { LastSubmittedReportPreferences } from "@/lib/video-submit-preferences";

import {
  areSubmissionScreenshotsRequired,
  canSubmit,
  PUBLISHED_AT_UNCONFIRMED_REASON,
  type EditableMetricKey,
  type SubmissionSlotRole,
} from "@/components/submission/提交状态机";
import { getSlotRoleForMetric, resolveCompleteEditPayload } from "@/lib/video-submit/domain/form-rules";
import { isPublishedAtConfirmed, resolveVideoSubmitDeadline, VIDEO_SUBMIT_EXPIRED_APPEAL_REASON } from "@/lib/video-submit-deadline";
import { hasActualFieldChange } from "@/lib/daily-report-data-source";
import {
  restoreOcrFieldValue,
  summarizeSubmissionIssues,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import {
  getVideoSubmissionEditDetailError,
  getHiddenRoleRestoreLabel,
  resolveAssigneeDisplay,
  resolveVideoSubmitMode,
  isDailyReportOnlyEditDetail,
  type HistoricalAssigneeProfile,
  type SubmissionAssigneeRole,
  type VideoSubmissionEditDetail,
} from "@/lib/video-submit/domain/video-submit-form-state";

import {
  createEditableFields,
  createEditableFieldsFromEditDetail,
  createEditableSlots,
  createEditableSlotsFromEditDetail,
  createInitialMeta,
  createMetaFromEditDetail,
  createScreenshotItemsFromEditDetail,
  deriveSlotsFromItems,
  allocateScreenshotSlots,
  type EditableMetricField,
  type FormMetaState,
  type SlotViewState,
  type ScreenshotItem,
} from "@/lib/video-submit/domain/video-submit-form-model";

import type {
  SubmitPanelMode,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "@/lib/dashboard-submission-state";
import { createWorkflowState, workflowReducer } from "@/lib/video-submit-workflow/reducer";
import { buildSubmissionState } from "@/lib/video-submit-workflow/selectors";
import type { WorkflowDraftState } from "@/lib/video-submit-workflow/types";
import {
  createSubmissionUiState,
  submissionUiReducer,
  type SubmissionUiState,
} from "@/lib/video-submit-workflow/ui-state";
import { createOcrTaskRegistry, type OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import { FormV2Dialogs } from "./form-v2/dialogs";
import { FormV2RolePicker } from "./form-v2/role-picker";
import { FormV2SubmitFooter } from "./form-v2/submit-footer";
import { FormV2Workspace } from "./form-v2/workspace";
import { SubmittedView } from "./form-v2/submitted-view";
import { createUploadHandler } from "./video-submit-form-v2/upload-controller";
import type { UploadHandler } from "./video-submit-form-v2/upload-controller";
import { createSubmitController } from "./video-submit-form-v2/submit-controller";
import { useAssigneeController } from "./video-submit-form-v2/assignee-controller";
import { useVideoSubmitDraftController } from "./video-submit-form-v2/draft-controller";
import { createQualityCheckController } from "./video-submit-form-v2/quality-check-controller";
import { focusSubmissionIssueTarget } from "./video-submit-form-v2/focus-issue-target";
import { useAppealActions } from "./form-v2/use-appeal-actions";
import { useReviewNoticeDismissal } from "./use-review-notice-dismissal";
import { listSubmitGaps, resolveFormProgress, type FormProgress } from "@/lib/video-submit/domain/submit-gaps";
import {
  getBrowserAppealSuccessPublishedAt,
  getBrowserAppealSuccessTitle,
  hasBrowserAppealSuccessSession,
  markBrowserAppealSuccessSession,
} from "@/lib/video-submit/domain/appeal-success-session";

// 保留所有原有类型定义
interface VideoSubmitFormProps {
  account: {
    id: string;
    name: string;
    display_name: string;
    content_direction: string | null;
  } | null;
  userId: string;
  userDisplayName?: string;
  today: string;
  mode: SubmitPanelMode;
  initialSummary: TodaySubmissionSummary | null;
  editDetail?: VideoSubmissionEditDetail | null;
  initialBizDate?: string | null;
  initialTopicId?: string | null;
  initialTopicTitle?: string | null;
  submittedViewActive?: boolean;
  userExemptionReviewNotices?: DashboardPageData["userExemptionReviewNotices"];
  isExemptionPending?: boolean;
  pendingExemptionItems?: DashboardPageData["pendingExemptionItems"];
  lastSubmissionPreferences?: LastSubmittedReportPreferences | null;
  onDismissPendingExemption?: () => void;
  onWithdrawPendingExemption?: () => Promise<unknown>;
  onSubmitted: (
    video: Video | null,
    summaryOverride?: TodaySubmissionReportLike | null,
    submissionPreferences?: LastSubmittedReportPreferences & { accountId: string },
  ) => void;
  onCancel?: () => void;
  onCreateAnother?: () => void;
  onRequestEdit?: (target: { reportId: string | null; reportDate: string }) => void;
  onViewHistory?: () => void;
  onViewVideo?: (videoId: string) => void;
  /** 表单进度回传给页头状态句（还差一步 / 可以交了），卸载时回 null */
  onProgressChange?: (progress: FormProgress | null) => void;
}

/**
 * VideoSubmitForm V2 - Claude 设计系统改皮肤版本
 * 保留所有 Antigravity 业务逻辑，用 Claude 设计系统重写 UI
 */
export function VideoSubmitFormV2({
  account,
  userId,
  userDisplayName,
  today,
  mode,
  initialSummary,
  editDetail = null,
  initialBizDate = null,
  initialTopicId = null,
  initialTopicTitle = null,
  submittedViewActive = false,
  userExemptionReviewNotices = [],
  isExemptionPending = false,
  pendingExemptionItems = [],
  lastSubmissionPreferences = null,
  onDismissPendingExemption,
  onWithdrawPendingExemption,
  onSubmitted,
  onCancel,
  onCreateAnother,
  onRequestEdit,
  onViewHistory,
  onViewVideo,
  onProgressChange,
}: VideoSubmitFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const selfLabel = userDisplayName?.trim() || "我";
  const initialScreenshotItems = useMemo(
    () => editDetail ? createScreenshotItemsFromEditDetail(editDetail) : [],
    [editDetail],
  );
  const screenshotItemsRef = useRef<ScreenshotItem[]>(initialScreenshotItems);
  const [screenshotItems, setScreenshotItems] = useState<ScreenshotItem[]>(initialScreenshotItems);

  // 表单业务数据统一由 workflow reducer 持有；兼容 setter 适配器让现有渲染与异步流程分阶段迁移。
  const [workflow, dispatchWorkflow] = useReducer(workflowReducer, undefined, () => {
    const initial =
      editDetail
        ? createMetaFromEditDetail(editDetail, today, userId)
        : createInitialMeta(today, userId, initialBizDate ?? today, mode === "editToday" ? null : lastSubmissionPreferences);
    const appealSuccessTitle = !editDetail
      ? getBrowserAppealSuccessTitle(account?.id ?? "", initialBizDate ?? today)
      : null;
    const appealSuccessPublishedAt = !editDetail
      ? getBrowserAppealSuccessPublishedAt(account?.id ?? "", initialBizDate ?? today)
      : null;
    const meta = initial.uploadedAt
      ? initial
      : {
        ...initial,
        uploadedAt: new Date().toLocaleString("zh-CN"),
        ...(appealSuccessTitle ? { videoTitle: appealSuccessTitle } : {}),
        ...(appealSuccessPublishedAt ? { publishedAt: appealSuccessPublishedAt } : {}),
      };
    return createWorkflowState({
      meta,
      fields: editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
      slots: initialScreenshotItems.length > 0
        ? deriveSlotsFromItems(initialScreenshotItems)
        : editDetail ? createEditableSlotsFromEditDetail(editDetail) : createEditableSlots(),
      draft: {
        hasManualEdit: editDetail?.dataSource === "manual",
      },
    });
  });
  const {
    meta,
    fields,
    slots,
    hasManualEdit,
  } = workflow;
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
        | ((current: Record<EditableMetricKey, EditableMetricField>) => Record<EditableMetricKey, EditableMetricField>),
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
        | ((current: Record<SubmissionSlotRole, SlotViewState>) => Record<SubmissionSlotRole, SlotViewState>),
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
        hasManualEdit:
          typeof next === "function" ? next(current.hasManualEdit) : next,
      }));
    },
    [updateWorkflowDraft],
  );
  const setHasManualScriptAuthorSelection = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      updateWorkflowDraft((current) => ({
        ...current,
        hasManualScriptAuthorSelection:
          typeof next === "function"
            ? next(current.hasManualScriptAuthorSelection)
            : next,
      }));
    },
    [updateWorkflowDraft],
  );
  const setHasManualOperatorSelection = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      updateWorkflowDraft((current) => ({
        ...current,
        hasManualOperatorSelection:
          typeof next === "function"
            ? next(current.hasManualOperatorSelection)
            : next,
      }));
    },
    [updateWorkflowDraft],
  );

  const slotsRef = useRef(slots);
  const ocrTasksRef = useRef<OcrTaskRegistry | null>(null);
  if (ocrTasksRef.current == null) {
    ocrTasksRef.current = createOcrTaskRegistry();
  }
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
        | ((current: Record<SubmissionSlotRole, SlotViewState>) => Record<SubmissionSlotRole, SlotViewState>),
    ) => {
      setSlots((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        const removedItemIds = (Object.keys(current) as SubmissionSlotRole[])
          .filter((role) => current[role].itemId && next[role].status === "empty" && !next[role].itemId)
          .map((role) => current[role].itemId as string);
        if (removedItemIds.length > 0) {
          for (const itemId of removedItemIds) ocrTasksRef.current?.cancel(itemId);
          const nextItems = screenshotItemsRef.current.filter((item) => !removedItemIds.includes(item.id));
          screenshotItemsRef.current = nextItems;
          setScreenshotItems(nextItems);
        }
        slotsRef.current = next;
        return next;
      });
    },
    [setSlots],
  );

  // 选题关联受控状态（支持从 URL 带参初始化，或在表单内手动选择/更换）
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialTopicId ?? null);
  const [selectedTopicTitle, setSelectedTopicTitle] = useState<string | null>(initialTopicTitle ?? null);

  const handleSelectTopic = useCallback((topic: SelectedTopicInfo | null) => {
    if (!topic) {
      setSelectedTopicId(null);
      setSelectedTopicTitle(null);
      return;
    }
    setSelectedTopicId(topic.id);
    setSelectedTopicTitle(topic.title);

    // 自动回填标题与文案
    setMeta((current) => ({
      ...current,
      videoTitle: current.videoTitle.trim() ? current.videoTitle : topic.title,
      content: current.content.trim() ? current.content : (topic.hook || topic.outline || ""),
      topicTag: current.topicTag || (topic.topicTag === "干货" || topic.topicTag === "复盘" ? topic.topicTag : current.topicTag),
    }));
  }, [setMeta]);

  const [uiState, dispatchUi] = useReducer(
    submissionUiReducer,
    undefined,
    () => createSubmissionUiState({
      isSubmitted: hasBrowserAppealSuccessSession(account?.id ?? "", initialBizDate ?? today),
    }),
  );
  const [submittedReportDate, setSubmittedReportDate] = useState<string | null>(null);
  const updateUi = useCallback(
    (updater: (current: SubmissionUiState) => SubmissionUiState) =>
      dispatchUi({ type: "update", updater }),
    [],
  );
  const setUiField = useCallback(<K extends keyof SubmissionUiState>(
    key: K,
    next: SubmissionUiState[K] | ((current: SubmissionUiState[K]) => SubmissionUiState[K]),
  ) => {
    updateUi((current) => ({
      ...current,
      [key]: typeof next === "function"
        ? (next as (current: SubmissionUiState[K]) => SubmissionUiState[K])(current[key])
        : next,
    }));
  }, [updateUi]);
  const {
    isSubmitting,
    appealRequired,
    appealStatus,
    appealId,
    appealResultReason,
    isAppealDialogOpen,
    appealReason,
    isAppealSubmitting,
    isSubmitted,
    hasAttemptedSubmit,
    shakeForm,
    submittedReportId,
    submittedVideoId,
    qualityCheck,
  } = uiState;
  const setIsSubmitting = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isSubmitting", next), [setUiField]);
  const setAppealRequired = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("appealRequired", next), [setUiField]);
  const setAppealStatus = useCallback((next: SubmissionUiState["appealStatus"] | ((current: SubmissionUiState["appealStatus"]) => SubmissionUiState["appealStatus"])) => setUiField("appealStatus", next), [setUiField]);
  const setAppealId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("appealId", next), [setUiField]);
  const setAppealResultReason = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("appealResultReason", next), [setUiField]);
  const setIsAppealDialogOpen = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isAppealDialogOpen", next), [setUiField]);
  const setAppealReason = useCallback((next: string | ((current: string) => string)) => setUiField("appealReason", next), [setUiField]);
  const setIsAppealSubmitting = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isAppealSubmitting", next), [setUiField]);
  const setIsSubmitted = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isSubmitted", next), [setUiField]);
  const setHasAttemptedSubmit = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("hasAttemptedSubmit", next), [setUiField]);
  const setSubmittedReportId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("submittedReportId", next), [setUiField]);
  const setSubmittedVideoId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("submittedVideoId", next), [setUiField]);
  const setQualityCheck = useCallback((next: SubmissionUiState["qualityCheck"] | ((current: SubmissionUiState["qualityCheck"]) => SubmissionUiState["qualityCheck"])) => setUiField("qualityCheck", next), [setUiField]);
  const triggerFormShake = useCallback(() => {
    setUiField("shakeForm", true);
    setTimeout(() => setUiField("shakeForm", false), 500);
  }, [setUiField]);
  const [deleteTargetRole, setDeleteTargetRole] =
    useState<SubmissionSlotRole | null>(null);
  // 补交申请要原样回传「上次提交失败时的 payload」，必须按最新写入值读，不能读某次渲染的闭包快照。
  const pendingSubmissionPayloadRef = useRef<Record<string, unknown> | null>(null);
  const [focusedRole, setFocusedRole] = useState<SubmissionSlotRole | null>(
    null,
  );
  // 宽屏对照栏显示哪张：跟随最近聚焦的数字格或点过的小图，失焦后保留不闪回
  const [compareRole, setCompareRole] = useState<SubmissionSlotRole | null>(null);
  const compareRailEnabled = useCompareRailEnabled();
  const markManualEdit = useCallback(() => setHasManualEdit(true), [setHasManualEdit]);
  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsSectionRef = useRef<HTMLDivElement | null>(null);

  const [selectingRole, setSelectingRole] = useState<{
    role: "script_author" | "video_editor" | "operator";
    label: string;
    selectedUserId: string | null;
  } | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  const [hiddenRoles, setHiddenRoles] = useState<Set<SubmissionAssigneeRole>>(
    new Set(),
  );

  // 计算外协状态
  const isScriptAuthorExternal = Boolean(
    meta.scriptAuthorUserId && meta.scriptAuthorUserId !== userId,
  );
  const isVideoEditorExternal = Boolean(
    meta.videoEditorUserId && meta.videoEditorUserId !== userId,
  );
  const isOperatorExternal = Boolean(
    meta.operatorUserId && meta.operatorUserId !== userId,
  );

  const isScriptAuthorVisible =
    isScriptAuthorExternal || !hiddenRoles.has("script_author");
  const isVideoEditorVisible =
    isVideoEditorExternal || !hiddenRoles.has("video_editor");
  const isOperatorVisible = isOperatorExternal || !hiddenRoles.has("operator");
  const hasAnyVisibleRole =
    isScriptAuthorVisible || isVideoEditorVisible || isOperatorVisible;
  const hiddenRoleRestoreLabel = getHiddenRoleRestoreLabel(hiddenRoles);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const {
    operatorMembers,
    filteredModalMembers,
    loadOperatorMembers,
    setRoleUser,
    hideRole,
    showAllRoles,
    setOperatorUser,
    setScriptAuthorUser,
  } = useAssigneeController({
    userId,
    memberSearchQuery,
    setMeta,
    setHasManualScriptAuthorSelection,
    setHasManualOperatorSelection,
    setHiddenRoles,
  });
  const visibleMemberIds = useMemo(
    () => operatorMembers.length > 0 ? new Set(operatorMembers.map((member) => member.id)) : undefined,
    [operatorMembers],
  );

  // 历史责任人档案：GET 编辑详情返回的旧责任人姓名与状态
  const historicalAssigneeProfiles: HistoricalAssigneeProfile[] = useMemo(
    () => editDetail?.assigneeProfiles ?? [],
    [editDetail],
  );
  const resolveRoleDisplay = useCallback(
    (assignedUserId: string | null) =>
      resolveAssigneeDisplay({
        assignedUserId,
        currentUserId: userId,
        activeMembers: operatorMembers,
        historicalProfiles: historicalAssigneeProfiles,
        selfLabel,
      }),
    [historicalAssigneeProfiles, operatorMembers, userId, selfLabel],
  );

  const metricsGroupRef = useRef<MetricGroupHandle | null>(null);
  const metaVideoTitleRef = useRef<HTMLInputElement | null>(null);
  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const publishedAtSectionRef = useRef<HTMLDivElement | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const focusWithHighlight = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (el.tabIndex < 0 && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "BUTTON" && el.tagName !== "SELECT") {
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
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      removeHighlight();
      highlightTimerRef.current = null;
    }, 2000);
  }, []);

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [pulseSlots, setPulseSlots] = useState(false);
  const pulseSlotsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (pulseSlotsTimerRef.current) {
        clearTimeout(pulseSlotsTimerRef.current);
      }
    };
  }, []);

  const triggerSlotsPulse = useCallback(() => {
    setPulseSlots(true);
    if (pulseSlotsTimerRef.current) {
      clearTimeout(pulseSlotsTimerRef.current);
    }
    pulseSlotsTimerRef.current = setTimeout(() => {
      setPulseSlots(false);
      pulseSlotsTimerRef.current = null;
    }, 1800);
  }, []);

  const isBackfillMode = mode === "backfill";
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const handleGoToTopics = useCallback(() => {
    router.push("/topics");
  }, [router]);
  const [, setHasUserInteracted] = useState(false);
  const [isPastedFeedback, setIsPastedFeedback] = useState(false);

  // 是否已开始填表（传了任意截图、或填了任意指标/标题/文案）。题材有默认值，不算「开始填」。
  // 没开始时首屏只露截图这一步，页头保持「今天还没交」。
  const hasStartedFilling = useMemo(() => {
    if (screenshotItems.length > 0 || Object.values(slots).some((slot) => slot.status !== "empty")) return true;
    if (Object.values(fields).some((field) => Boolean(field?.value?.trim()))) return true;
    return Boolean(meta.videoTitle.trim() || meta.content.trim());
  }, [fields, meta.content, meta.videoTitle, screenshotItems.length, slots]);

  const deadlinePrecheck = useMemo(
    () => resolveVideoSubmitDeadline({
      mode: resolveVideoSubmitMode({ panelMode: mode, anomalyStatus: meta.anomalyStatus, videoId: editDetail?.videoId ?? null, dailyReportOnly: isDailyReportOnlyEditDetail(editDetail) }) === "edit" ? "edit" : "create",
      publishedAt: meta.publishedAt,
      businessDate: meta.bizDate,
      publishedAtConfirmed: isPublishedAtConfirmed(meta.publishedAtText),
      publishedAtSource: meta.publishedAtSource,
    }),
    [editDetail, meta.anomalyStatus, meta.bizDate, meta.publishedAt, meta.publishedAtSource, meta.publishedAtText, mode],
  );

  useEffect(() => {
    if (!isSubmitted) {
      setHasUserInteracted(false);
    }
  }, [isSubmitted]);

  const { clearDraft, pauseSaving, lastSavedAt, showDraftBanner, handleRestoreDraft, handleDiscardDraft, handleUndoDiscard } = useVideoSubmitDraftController({
    userId,
    accountId: account?.id ?? null,
    today,
    mode,
    videoId: editDetail?.videoId ?? editDetail?.reportId ?? null,
    workflow,
    isSubmitted,
    submittedViewActive,
    hasInitialSummary: Boolean(initialSummary),
    lastReportPreferences: lastSubmissionPreferences,
    visibleMemberIds,
    dispatchWorkflow,
    screenshotItemsRef,
    slotsRef,
    setScreenshotItems,
  });

  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
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
  }, [handleDiscardDraft, handleUndoDiscard]);

  useEffect(() => {
    if (appealStatus !== "idle" || deadlinePrecheck.decision !== "requires_appeal") return;
    setAppealReason(
      deadlinePrecheck.reason === "manual_published_at"
        ? "发布时间由成员手工填写，需要补交审批"
        : VIDEO_SUBMIT_EXPIRED_APPEAL_REASON,
    );
  }, [appealStatus, deadlinePrecheck.decision, deadlinePrecheck.reason, setAppealReason]);

  const checkAppealStatus = useCallback(async () => {
    if (!account || !meta.bizDate || appealStatus !== "pending") return;
    try {
      const response = await fetch(`/api/fulfillment/appeal-status?accountId=${encodeURIComponent(account.id)}&recordDate=${encodeURIComponent(meta.bizDate)}`);
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
      markBrowserAppealSuccessSession(account.id, meta.bizDate, meta.videoTitle, meta.publishedAt);
      onSubmitted(null);
      feedbackToast.success("补交申请已通过，数据已自动提交");
    } catch {
      // 暂时的网络失败留给下一次轮询或页面聚焦处理。
    }
  }, [account, appealStatus, clearDraft, meta.bizDate, meta.publishedAt, meta.videoTitle, onSubmitted, pauseSaving, setAppealResultReason, setAppealStatus, setIsSubmitted]);

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

  // 豁免/请假审批通知本地关闭状态（与面板共用同一关闭标记）
  const { dismissed: dismissedReviewNotice, dismiss: handleDismissReviewNotice } = useReviewNoticeDismissal(userExemptionReviewNotices);

  // 聚合工作台提示项（草稿恢复 / 请假豁免结果 / 审批中 / 选题带入上下文）
  const workbenchNotices = useMemo(() => {
    const items: WorkbenchNoticeItem[] = [];

    // 1. 草稿恢复提示（优先级最高，带直接操作）
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

    // 2. 待审批中提示：还能撤回、正在发生，排在已出结果的通知前面，折叠时也露在第一条
    if (isExemptionPending) {
      items.push(buildPendingExemptionNoticeItem({
        items: pendingExemptionItems,
        onDismiss: onDismissPendingExemption,
        onWithdraw: onWithdrawPendingExemption,
      }));
    }

    // 3. 请假/豁免审批结果通知
    if (userExemptionReviewNotices.length > 0 && !dismissedReviewNotice) {
      items.push(...buildExemptionReviewNoticeItems(userExemptionReviewNotices, handleDismissReviewNotice));
    }

    // 4. 选题带入上下文提示
    const activeTopicId = selectedTopicId || initialTopicId;
    const activeTopicTitle = selectedTopicTitle || initialTopicTitle;
    if (activeTopicId) {
      items.push({
        id: `topic-${activeTopicId}`,
        type: "topic_context",
        statusTone: "mineral",
        title: "已关联选题",
        description: `· ${activeTopicTitle ? `《${activeTopicTitle}》` : "来自选题库的选题"}，提交后保留关联`,
        topicId: activeTopicId,
      });
    }

    return items;
  }, [
    dismissedReviewNotice,
    handleDismissReviewNotice,
    handleRestoreDraft,
    initialTopicId,
    initialTopicTitle,
    pendingExemptionItems,
    selectedTopicId,
    selectedTopicTitle,
    isExemptionPending,
    onDismissPendingExemption,
    onWithdrawPendingExemption,
    showDraftBanner,
    userExemptionReviewNotices,
  ]);

  // Blob URL 清理
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
      blobUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrls.clear();
    };
  }, []);

  useEffect(() => () => {
    ocrTasksRef.current?.cancel("screenshot_1");
    ocrTasksRef.current?.cancel("screenshot_2");
    ocrTasksRef.current?.cancelAll();
  }, []);

  // 账号切换时重置
  useEffect(() => {
    if (submittedViewActive) return;

    blobUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    blobUrlsRef.current.clear();

    const nextMeta = editDetail
      ? createMetaFromEditDetail(editDetail, today, userId)
      : createInitialMeta(today, userId, initialBizDate ?? today, mode === "editToday" ? null : lastSubmissionPreferences);
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

    const nextItems = editDetail ? createScreenshotItemsFromEditDetail(editDetail) : [];
    screenshotItemsRef.current = nextItems;
    setScreenshotItems(nextItems);
    const nextSlots = nextItems.length > 0
      ? deriveSlotsFromItems(nextItems)
      : createEditableSlots();
    slotsRef.current = nextSlots;
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
    setIsSubmitted(false);
    setSubmittedReportId(null);
    setQualityCheck({ data: null, loading: false });
    setDeleteTargetRole(null);
    setFocusedRole(null);
    setCompareRole(null);
  }, [
    account?.id,
    editDetail,
    initialBizDate,
    initialSummary,
    isBackfillMode,
    lastSubmissionPreferences,
    mode,
    setIsSubmitted,
    setQualityCheck,
    setSubmittedReportId,
    today,
    userId,
    submittedViewActive,
    setScreenshotItems,
  ]);

  // 提交验证相关计算
  const submissionState = buildSubmissionState(slots, fields, isSubmitted);
  const isDailyReportOnly = isDailyReportOnlyEditDetail(editDetail);
  const screenshotsRequired = isDailyReportOnly ? false : areSubmissionScreenshotsRequired(meta.anomalyStatus);
  // 与后端同一判定：只有 create 会因「发布时间未确认」被拒
  // （edit = 编辑历史、abnormal = 异常上报，后端都跳过该门禁）。
  const publishedAtConfirmed = isPublishedAtConfirmed(meta.publishedAtText);
  const editDraftVideoId = editDetail?.videoId ?? null;
  const submitMode = resolveVideoSubmitMode({
    panelMode: mode,
    anomalyStatus: meta.anomalyStatus,
    videoId: editDraftVideoId,
    dailyReportOnly: isDailyReportOnly,
  });
  const issueSummary = useMemo(
    () =>
      summarizeSubmissionIssues(submissionState, {
        topicTag: meta.topicTag,
        anomalyStatus: meta.anomalyStatus,
        videoTitle: meta.videoTitle,
        content: meta.content,
        submissionMode: submitMode,
        publishedAtConfirmed,
        screenshotsRequired,
        topicTagRequired: !isDailyReportOnly,
        contentRequired: !isDailyReportOnly,
      }),
    [
      submissionState,
      meta.topicTag,
      meta.anomalyStatus,
      meta.videoTitle,
      meta.content,
      submitMode,
      publishedAtConfirmed,
      screenshotsRequired,
      isDailyReportOnly,
    ],
  );
  const appealPrecheckRequired = deadlinePrecheck.decision === "requires_appeal" && appealStatus === "idle";
  const issueSummaryRef = useRef(issueSummary);
  useEffect(() => {
    issueSummaryRef.current = issueSummary;
  }, [issueSummary]);
  // 在途槽位不算「没认出来」：上传中/识别中的 ocrFallback 是占位默认值，不代表失败。
  const allScreenshotsFailed = screenshotsRequired && Object.values(slots).every((slot) =>
    slot.status !== "uploading" && slot.status !== "recognizing" && (slot.status === "failed" || Boolean(slot.ocrFallback)));
  const formProgress = isSubmitted ? null : resolveFormProgress({ summary: issueSummary, hasStartedFilling, allScreenshotsFailed });
  useEffect(() => {
    onProgressChange?.(formProgress);
  }, [formProgress, onProgressChange]);
  useEffect(() => () => onProgressChange?.(null), [onProgressChange]);
  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: meta.anomalyStatus,
    submissionMode: submitMode,
    publishedAtConfirmed,
    screenshotsRequired,
    topicTagRequired: !isDailyReportOnly,
    contentRequired: !isDailyReportOnly,
  });
  const canActuallySubmit = issueSummary.canSubmit;
  const submitButtonLabel = isSubmitting
    ? "提交中..."
    : isBackfillMode
      ? "补交"
      : mode === "editToday" || initialSummary
        ? "保存修改"
        : "提交";

  function updateMeta<Key extends keyof FormMetaState>(
    key: Key,
    value: FormMetaState[Key],
  ) {
    setMeta((current) => ({ ...current, [key]: value }));
  }

  function updateField(key: EditableMetricKey, value: string) {
    if (hasActualFieldChange(fields[key].value, value)) {
      markManualEdit();
    }
    setFields((current) => ({
      ...current,
      [key]: toManualFieldState({
        ...current[key],
        value,
      }),
    }));

  }

  const scrollToIssueAnchor = useCallback((
    anchor: "slots" | "metrics" | "topicTag" | "meta" | "publishedAt" | null,
  ) => {
    if (anchor === "publishedAt") {
      publishedAtSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const target =
      anchor === "slots"
        ? slotsSectionRef.current
        : anchor === "metrics"
          ? metricsSectionRef.current
          : anchor === "meta"
            ? metaSectionRef.current
            : anchor === "topicTag"
              ? topicTagSectionRef.current
              : null;
    if (anchor === "topicTag") setIsMoreOpen(true);

    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const focusIssueTarget = useCallback((
    anchor: "slots" | "metrics" | "topicTag" | "meta" | "publishedAt" | null,
    invalidKey: ReturnType<typeof summarizeSubmissionIssues>["firstInvalidFieldKey"],
    missingRequiredSlotsCount = 0,
  ) => {
    focusSubmissionIssueTarget({
      anchor,
      invalidKey,
      missingRequiredSlotsCount,
      focusWithHighlight,
      triggerSlotsPulse,
      metricsGroupRef,
      metaVideoTitleRef,
      contentTextareaRef,
      topicTagSectionRef,
      publishedAtSectionRef,
      slotsSectionRef,
    });
  }, [focusWithHighlight, triggerSlotsPulse]);

  // 聚焦某个数字时，对应那张截图的状态行高亮，宽屏对照栏切到那张截图
  function handleFieldFocus(key: EditableMetricKey) {
    const role = getSlotRoleForMetric(key);
    setFocusedRole(role);
    setCompareRole(role);
  }

  function handleFieldBlur() {
    setFocusedRole(null);
  }

  // 用户手改过的字段不被二次识别覆盖；未手改的字段按最新识别结果刷新，并留存 OCR 原值供恢复。
  function restoreOcrValue(key: EditableMetricKey) {
    setFields((current) => ({
      ...current,
      [key]: restoreOcrFieldValue(current[key]),
    }));
  }

  // controller 只保存事件回调；refs 只会在用户点击质量检查/修复时读取。
  const { handleQualityCheck, handleFixIssue } = createQualityCheckController({
    submittedReportId,
    setHasUserInteracted,
    setQualityCheck,
    setIsSubmitted,
    updateSlotsState,
    onError: (message) => feedbackToast.error(message),
    onRequestEdit: () => onRequestEdit?.({
      reportId: submittedReportId,
      reportDate: submittedReportDate ?? getPublishedDateKey({
        published_at: meta.publishedAt || null,
        report_date: meta.bizDate,
      }) ?? meta.bizDate,
    }),
    onManualReview: (message) => toast.message(message),
  });

  // OCR 上传、识别与槽位归并由独立 controller 负责。
  const uploadHandler = useMemo<UploadHandler>(
    () => createUploadHandler({
      account,
      userId,
      initialSummary,
      supabase,
      ocrTasksRef,
      slotsRef,
      itemsRef: screenshotItemsRef,
      blobUrlsRef,
      updateItemsState,
      dispatchWorkflow,
    }),
    [account, userId, initialSummary, supabase, updateItemsState, dispatchWorkflow],
  );
  const handleSlotUpload = useCallback(
    (role: SubmissionSlotRole, file: File, batchStartedAt?: number) => uploadHandler(role, file, batchStartedAt),
    [uploadHandler],
  );

  function handleSlotRetry(role: SubmissionSlotRole) {
    const slot = slots[role];
    if (!slot.itemId || !(slot.status === "failed" || slot.status === "pending_confirm" || slot.ocrFallback)) return;
    void uploadHandler.retryItem(slot.itemId);
  }

  const cancelTimeoutRef = useRef<number | null>(null);

  const clearCancelTimeout = useCallback(() => {
    if (cancelTimeoutRef.current !== null) {
      window.clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearCancelTimeout, [clearCancelTimeout]);

  async function handlePasteContent() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        updateMeta("content", text);
        setIsPastedFeedback(true);
        window.setTimeout(() => {
          setIsPastedFeedback(false);
        }, 1200);
      } else {
        feedbackToast.error("剪贴板内容为空");
      }
    } catch {
      feedbackToast.error("浏览器没给读取剪贴板的权限，请在文案框里手动粘贴");
      contentTextareaRef.current?.focus();
    }
  }

  // Controller receives event-time callbacks; refs are read only when submit/appeal handlers run.
  const { executeSubmit, requestLateSubmission, handleConfirmAppeal, resumeAppeal } = createSubmitController({
    account,
    userId,
    mode,
    today,
    workflow,
    editDetail,
    selectedTopicId,
    initialTopicId,
    topicTitle: selectedTopicTitle || initialTopicTitle,
    supabase,
    pendingSubmissionPayloadRef,
    setIsSubmitting, setAppealRequired, setAppealStatus, setAppealId, setAppealResultReason, setAppealReason, setIsSubmitted, setSubmittedReportId, setSubmittedReportDate, setSubmittedVideoId, setIsAppealDialogOpen, setIsAppealSubmitting, isAppealSubmitting, appealReason, onSubmitted, clearDraft, pauseDraftSaving: pauseSaving, scrollToIssueAnchor,
  });

  const { isAppealResuming, retryAppealResume, withdrawAppeal } = useAppealActions({
    accountId: account?.id ?? null, appealId, bizDate: meta.bizDate, videoTitle: meta.videoTitle, publishedAt: meta.publishedAt,
    resumeAppeal, pauseSaving, clearDraft, onSubmitted, setAppealStatus, setAppealId, setAppealResultReason, setIsSubmitted,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    setHasAttemptedSubmit(true);

    if (!account) {
      triggerFormShake();
      return;
    }

    // 智能兜底：若截图已上传但处于识别失败态，且用户已手工录入关键指标，自动解除失败状态转手动确认
    const canAutoResolve1 = slots.screenshot_1.status === "failed" && Boolean(slots.screenshot_1.assetUrl) && hasManualEdit;
    const canAutoResolve2 = slots.screenshot_2.status === "failed" && Boolean(slots.screenshot_2.assetUrl) && hasManualEdit;

    if (canAutoResolve1 || canAutoResolve2) {
      updateItemsState((current) => current.map((item) => {
        const shouldResolve = (canAutoResolve1 && slots.screenshot_1.itemId === item.id) || (canAutoResolve2 && slots.screenshot_2.itemId === item.id);
        return shouldResolve
          ? { ...item, status: "done", confirmed: true, requiresManualConfirmation: false, ocrFallback: true, error: null }
          : item;
      }));
    }

    if (!submitCheck.ok || !issueSummary.canSubmit) {
      setHasAttemptedSubmit(true);
      triggerFormShake();
      scrollToIssueAnchor(issueSummary.firstIssueAnchor);
      focusIssueTarget(
        issueSummary.firstIssueAnchor,
        issueSummary.firstInvalidFieldKey,
        issueSummary.missingRequiredSlots.length,
      );
      return;
    }

    if (!isDailyReportOnly && !meta.topicTag) {
      setHasAttemptedSubmit(true);
      triggerFormShake();
      scrollToIssueAnchor("topicTag");
      focusIssueTarget("topicTag", "topicTag");
      return;
    }

    const editDetailError =
      mode === "editToday" && account
        ? getVideoSubmissionEditDetailError(editDetail, {
            accountId: account.id,
            bizDate: meta.bizDate,
          })
        : null;
    const editPayload =
      mode === "editToday" && account
        ? resolveCompleteEditPayload(editDetail, {
            accountId: account.id,
            bizDate: meta.bizDate,
          })
        : null;
    if (editDetailError || (mode === "editToday" && !isDailyReportOnly && !editPayload)) {
      triggerFormShake();
      feedbackToast.error(editDetailError ?? "缺少原视频完整详情，已停止保存以避免覆盖旧数据");
      return;
    }

    // 同步闩锁：状态到 ref 的回写要等渲染，双击的第二下可能在同一批次进来
    isSubmittingRef.current = true;
    try {
      await executeSubmit();
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // 粘贴 / 拖入 / 多选：按列表顺序填空槽（先互动、后留存），各自立即上传识别，不等前一张。
  // 两槽都有图时不顶任何一张；一次超过空槽数的部分不收，并明确告诉用户。
  const handleUnifiedUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const { roles, overflow } = allocateScreenshotSlots(screenshotItemsRef.current, files.length);
      if (roles.length === 0) {
        feedbackToast.warning("要点开想替换的那张卡片再选图");
        return;
      }
      const batchStartedAt = Date.now();
      roles.forEach((role, index) => void uploadHandler(role, files[index], batchStartedAt));
      if (overflow > 0) feedbackToast.warning(`截图只收两张，多出的 ${overflow} 张没上传`);
    },
    [uploadHandler],
  );

  // 快捷键：Ctrl+Enter / Cmd+Enter 快捷提交
  const isSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

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
      if (gaps.length > 0) {
        feedbackToast.warning(`还差 ${gaps.length} 项，第一个是 ${gaps[0].label}`);
      }
      return;
    }

    setHasAttemptedSubmit(true);
    const formEl = document.getElementById(
      "video-submit-form-v2",
    ) as HTMLFormElement | null;
    if (formEl) {
      if (formEl.requestSubmit) {
        formEl.requestSubmit();
      } else {
        formEl.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
      }
    }
  }, [
    canActuallySubmit,
    focusIssueTarget,
    scrollToIssueAnchor,
    setHasAttemptedSubmit,
    triggerFormShake,
  ]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isSubmittingRef.current) return;
      const target = event.target as HTMLElement | null;

      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const cmdEnter =
        event.key === "Enter" && (isMac ? event.metaKey : event.ctrlKey);

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        if (cmdEnter) {
          event.preventDefault();
          triggerSubmit();
        }
        return;
      }

      if (cmdEnter) {
        event.preventDefault();
        triggerSubmit();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerSubmit]);

  if (!account) {
    return (
      <div className="py-6 text-[14px] text-[#78716C]">
        请先选择一个视频账号，再填写提交信息。
      </div>
    );
  }

  // 【主渲染】- 使用 Claude 设计系统重写 UI
  return (
    <>
      {isSubmitted ? (
        <SubmittedView
          meta={meta}
          setHasUserInteracted={setHasUserInteracted}
          handleGoToTopics={handleGoToTopics}
          setIsSubmitted={setIsSubmitted}
          setSubmittedReportId={setSubmittedReportId}
          submittedReportId={submittedReportId}
          submittedReportDate={submittedReportDate}
          submittedVideoId={submittedVideoId}
          setQualityCheck={setQualityCheck}
          qualityCheck={qualityCheck}
          onRequestEdit={onRequestEdit}
          onCancel={onCancel}
          onCreateAnother={onCreateAnother}
          handleQualityCheck={handleQualityCheck}
          handleFixIssue={handleFixIssue}
          onViewHistory={onViewHistory}
          onViewVideo={onViewVideo}
        />
      ) : (
        <>
          <FormV2Dialogs
            deleteTargetRole={deleteTargetRole}
            setDeleteTargetRole={setDeleteTargetRole}
            slots={slots}
            blobUrlsRef={blobUrlsRef}
            updateSlotsState={updateSlotsState}
            isAppealDialogOpen={isAppealDialogOpen}
            setIsAppealDialogOpen={setIsAppealDialogOpen}
            isAppealSubmitting={isAppealSubmitting}
            meta={meta}
            appealReason={appealReason}
            setAppealReason={setAppealReason}
            handleConfirmAppeal={handleConfirmAppeal}
          />

          {/* 主表单 */}
          <motion.form
            id="video-submit-form-v2"
            onSubmit={handleSubmit}
            initial={false}
            animate={shakeForm ? "animate" : "initial"}
            variants={shakeVariants}
            className="w-full min-[1330px]:grid min-[1330px]:grid-cols-[48rem_360px] min-[1330px]:items-start min-[1330px]:gap-6"
          >
            <div className="max-w-3xl min-w-0 space-y-5 py-0 pb-20 sm:pb-24">
              {/* 草稿 / 审批 / 关联选题的微提示：有才出现，状态句只在页头说 */}
              {workbenchNotices.length > 0 && (
                <div className="flex justify-end">
                  <WorkbenchNoticeCapsule notices={workbenchNotices} />
                </div>
              )}

              <FormV2Workspace
                editing={mode === "editToday"}
                slots={slots}
                slotsSectionRef={slotsSectionRef}
                metricsSectionRef={metricsSectionRef}
                handleSlotUpload={handleSlotUpload}
                handleUnifiedUpload={handleUnifiedUpload}
                setDeleteTargetRole={setDeleteTargetRole}
                handleSlotRetry={handleSlotRetry}
                updateSlotsState={updateSlotsState}
                screenshotsRequired={screenshotsRequired}
                focusedRole={focusedRole}
                onPreviewSlot={compareRailEnabled ? setCompareRole : undefined}
                pulseSlots={pulseSlots}
                isMoreOpen={isMoreOpen}
                setIsMoreOpen={setIsMoreOpen}
                hiddenRoleRestoreLabel={hiddenRoleRestoreLabel}
                showAllRoles={showAllRoles}
                hasAnyVisibleRole={hasAnyVisibleRole}
                roleVisible={{
                  script_author: isScriptAuthorVisible,
                  video_editor: isVideoEditorVisible,
                  operator: isOperatorVisible,
                }}
                resolveRoleDisplay={resolveRoleDisplay}
                meta={meta}
                loadOperatorMembers={loadOperatorMembers}
                setSelectingRole={setSelectingRole}
                hideRole={hideRole}
                topicTagSectionRef={topicTagSectionRef}
                updateMeta={updateMeta}
                publishedAtSectionRef={publishedAtSectionRef}
                issueSummary={issueSummary}
                publishedAtUnconfirmedReason={PUBLISHED_AT_UNCONFIRMED_REASON}
                fields={fields}
                metricsGroupRef={metricsGroupRef}
                updateField={updateField}
                restoreOcrValue={restoreOcrValue}
                handleFieldFocus={handleFieldFocus}
                handleFieldBlur={handleFieldBlur}
                hasAttemptedSubmit={hasAttemptedSubmit}
                metaSectionRef={metaSectionRef}
                metaVideoTitleRef={metaVideoTitleRef}
                selectedTopicId={selectedTopicId}
                selectedTopicTitle={selectedTopicTitle}
                handleSelectTopic={handleSelectTopic}
                handlePasteContent={handlePasteContent}
                isPastedFeedback={isPastedFeedback}
                contentTextareaRef={contentTextareaRef}
                videoFieldsEnabled={!isDailyReportOnly}
                disabledMetricKeys={isDailyReportOnly ? ["avg_play_ratio"] : []}
              />

              <FormV2RolePicker
                selectingRole={selectingRole}
                setSelectingRole={setSelectingRole}
                memberSearchQuery={memberSearchQuery}
                setMemberSearchQuery={setMemberSearchQuery}
                filteredModalMembers={filteredModalMembers}
                userId={userId}
                selfLabel={selfLabel}
                setScriptAuthorUser={setScriptAuthorUser}
                hideRole={hideRole}
                setRoleUser={setRoleUser}
                setOperatorUser={setOperatorUser}
              />

              <FormV2SubmitFooter
                canActuallySubmit={canActuallySubmit}
                issueSummary={issueSummary}
                isSubmitted={isSubmitted}
                lastSavedAt={lastSavedAt}
                appealRequired={appealRequired}
                appealStatus={appealStatus}
                appealResultReason={appealResultReason}
                appealPrecheckRequired={appealPrecheckRequired}
                requestLateSubmission={requestLateSubmission}
                retryAppealResume={retryAppealResume}
                onWithdrawAppeal={appealId ? withdrawAppeal : undefined}
                isAppealResuming={isAppealResuming}
                isAppealSubmitting={isAppealSubmitting}
                isBackfillMode={isBackfillMode}
                submittedViewActive={submittedViewActive}
                onCancel={onCancel}
                triggerSubmit={triggerSubmit}
                isSubmitting={isSubmitting}
                submitButtonLabel={submitButtonLabel}
              />
            </div>
            {/* 宽屏右栏：截图对照。外框不放宽，栏伸进右侧页边留白；表单宽度和位置跟没有栏时一样 */}
            {compareRailEnabled && (
              <截图对照栏
                images={{
                  screenshot_1: slots.screenshot_1.assetUrl,
                  screenshot_2: slots.screenshot_2.assetUrl,
                }}
                preferredRole={compareRole}
                onSelectRole={setCompareRole}
              />
            )}
          </motion.form>
        </>
      )}
      <ConfirmDialog
        open={discardConfirmOpen}
        title="确定丢弃未保存的草稿？"
        description="丢弃后将清除已填写的指标数值、标题文案与截图缓存。可在 5 秒内通过底部提示撤销。"
        confirmText="确定丢弃"
        cancelText="保留草稿"
        destructive
        onConfirm={confirmDiscardDraft}
        onOpenChange={setDiscardConfirmOpen}
      />
    </>
  );
}

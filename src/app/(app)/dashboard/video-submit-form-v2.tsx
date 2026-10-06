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
import { SectionHeading } from "@/components/ui/section-heading";
import { shakeVariants } from "@/lib/animations";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Video, VideoTagReviewDimension } from "@/types";

import { type MetricGroupHandle } from "@/components/submission/指标分组区";
import { type SelectedTopicInfo } from "@/components/submission/TopicSelectDropdown";
import { fetchCachedOperatorMembers } from "./history-report-edit-form";
import {
  WorkbenchNoticeCapsule,
  buildExemptionReviewNoticeItem,
  type WorkbenchNoticeItem,
} from "./components/workbench-notice-bar";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";

// 保留所有原有的业务逻辑导入
import {
  areSubmissionScreenshotsRequired,
  canSubmit,
  PUBLISHED_AT_UNCONFIRMED_REASON,
  type EditableMetricKey,
  type SubmissionSlotRole,
} from "@/components/submission/提交状态机";
import {
  filterOperatorMembers,
  getSlotRoleForMetric,
  parseMetric,
  resolveCompleteEditPayload,
} from "@/lib/video-submit/domain/form-rules";
import { isPublishedAtConfirmed } from "@/lib/video-submit-deadline";
import { hasActualFieldChange } from "@/lib/daily-report-data-source";
import {
  isInteractionExceedingPlayCount,
  restoreOcrFieldValue,
  summarizeSubmissionIssues,
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import {
  getVideoSubmissionEditDetailError,
  findNextScreenshotUploadRole,
  getHiddenRoleRestoreLabel,
  resolveAssigneeDisplay,
  resolveVideoSubmitMode,
  preserveBizDateWhenPublishedAtChanges,
  shouldMarkManualDailyReportSourceForMetaField,
  type HistoricalAssigneeProfile,
  type SubmissionAssigneeRole,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";

import {
  createEditableFields,
  createEditableFieldsFromEditDetail,
  createEditableSlots,
  createEditableSlotsFromEditDetail,
  createInitialMeta,
  createMetaFromEditDetail,
  METRIC_SUMMARY_LABELS,
  VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER,
  type EditableMetricField,
  type FormMetaState,
  type SlotViewState,
} from "./video-submit-form-model";

import type {
  SubmitPanelMode,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "@/lib/dashboard-submission-state";
import { createWorkflowState, workflowReducer } from "@/lib/video-submit-workflow/reducer";
import { buildSubmissionState } from "@/lib/video-submit-workflow/selectors";
import {
  createSubmissionUiState,
  submissionUiReducer,
  type SubmissionQualityIssue,
  type SubmissionQualityResponse,
  type SubmissionUiState,
} from "@/lib/video-submit-workflow/ui-state";
import { createOcrTaskRegistry, type OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import { FormV2Dialogs } from "./form-v2/dialogs";
import { FormV2RolePicker } from "./form-v2/role-picker";
import { FormV2SubmitFooter } from "./form-v2/submit-footer";
import { VideoStatusSegmented } from "./form-v2/role-controls";
import { FormV2Workspace } from "./form-v2/workspace";
import { SubmittedView } from "./form-v2/submitted-view";
import { createUploadHandler } from "./video-submit-form-v2/upload-controller";
import { createSubmitController } from "./video-submit-form-v2/submit-controller";
import { useAssigneeController } from "./video-submit-form-v2/assignee-controller";
import { useVideoSubmitDraftController } from "./video-submit-form-v2/draft-controller";

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
  userExemptionReviewNotice?: DashboardPageData["userExemptionReviewNotice"];
  isExemptionPending?: boolean;
  onDismissPendingExemption?: () => void;
  onSubmitted: (
    video: Video,
    aiTags: Array<{
      tag_dimension: VideoTagReviewDimension;
      tag_value: string;
      confidence: number | null;
      reason: string | null;
    }>,
    summaryOverride?: TodaySubmissionReportLike | null,
  ) => void;
  onCancel?: () => void;
  onRequestEdit?: () => void;
}

type OperatorMember = {
  id: string;
  name: string;
  display_name: string;
  department: string | null;
  team_id: string | null;
};


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
  userExemptionReviewNotice,
  isExemptionPending = false,
  onDismissPendingExemption,
  onSubmitted,
  onCancel,
  onRequestEdit,
}: VideoSubmitFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const selfLabel = userDisplayName?.trim() || "我";

  // 表单业务数据统一由 workflow reducer 持有；兼容 setter 适配器让现有渲染与异步流程分阶段迁移。
  const [workflow, dispatchWorkflow] = useReducer(workflowReducer, undefined, () => {
    const initial =
      editDetail
        ? createMetaFromEditDetail(editDetail, today, userId)
        : createInitialMeta(today, userId, initialBizDate ?? today);
    const meta = initial.uploadedAt
      ? initial
      : { ...initial, uploadedAt: new Date().toLocaleString("zh-CN") };
    return createWorkflowState({
      meta,
      fields: editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
      slots: editDetail ? createEditableSlotsFromEditDetail(editDetail) : createEditableSlots(),
    });
  });
  const { meta, fields, slots } = workflow;
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

  const slotsRef = useRef(slots);
  const ocrTasksRef = useRef<OcrTaskRegistry | null>(null);
  if (ocrTasksRef.current == null) {
    ocrTasksRef.current = createOcrTaskRegistry();
  }
  const updateSlotsState = useCallback(
    (
      updater:
        | Record<SubmissionSlotRole, SlotViewState>
        | ((current: Record<SubmissionSlotRole, SlotViewState>) => Record<SubmissionSlotRole, SlotViewState>),
    ) => {
      setSlots((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
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
    { hasManualEdit: editDetail?.dataSource === "manual", scriptText: editDetail?.conversionScript?.text ?? "" },
    createSubmissionUiState,
  );
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
    isAppealDialogOpen,
    appealReason,
    isAppealSubmitting,
    isSubmitted,
    hasAttemptedSubmit,
    shakeForm,
    submittedReportId,
    qualityCheck,
    keywordInput,
    scriptText,
    hasManualEdit,
    hasManualScriptAuthorSelection,
    hasManualOperatorSelection,
  } = uiState;
  const setIsSubmitting = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isSubmitting", next), [setUiField]);
  const setAppealRequired = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("appealRequired", next), [setUiField]);
  const setIsAppealDialogOpen = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isAppealDialogOpen", next), [setUiField]);
  const setAppealReason = useCallback((next: string | ((current: string) => string)) => setUiField("appealReason", next), [setUiField]);
  const setIsAppealSubmitting = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isAppealSubmitting", next), [setUiField]);
  const setIsSubmitted = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("isSubmitted", next), [setUiField]);
  const setHasAttemptedSubmit = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("hasAttemptedSubmit", next), [setUiField]);
  const setSubmittedReportId = useCallback((next: string | null | ((current: string | null) => string | null)) => setUiField("submittedReportId", next), [setUiField]);
  const setQualityCheck = useCallback((next: SubmissionUiState["qualityCheck"] | ((current: SubmissionUiState["qualityCheck"]) => SubmissionUiState["qualityCheck"])) => setUiField("qualityCheck", next), [setUiField]);
  const setKeywordInput = useCallback((next: string | ((current: string) => string)) => setUiField("keywordInput", next), [setUiField]);
  const setScriptText = useCallback((next: string | ((current: string) => string)) => setUiField("scriptText", next), [setUiField]);
  const setHasManualEdit = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("hasManualEdit", next), [setUiField]);
  const setHasManualScriptAuthorSelection = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("hasManualScriptAuthorSelection", next), [setUiField]);
  const setHasManualOperatorSelection = useCallback((next: boolean | ((current: boolean) => boolean)) => setUiField("hasManualOperatorSelection", next), [setUiField]);
  const triggerFormShake = useCallback(() => {
    setUiField("shakeForm", true);
    setTimeout(() => setUiField("shakeForm", false), 500);
  }, []);
  const [deleteTargetRole, setDeleteTargetRole] =
    useState<SubmissionSlotRole | null>(null);
  const [pendingSubmissionPayload, setPendingSubmissionPayload] = useState<Record<string, unknown> | null>(null);
  const [focusedRole, setFocusedRole] = useState<SubmissionSlotRole | null>(
    null,
  );
  const [highlightedOcrIndex, setHighlightedOcrIndex] = useState<number | null>(
    null,
  );
  const markManualEdit = useCallback(() => setHasManualEdit(true), []);
  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsSectionRef = useRef<HTMLDivElement | null>(null);

  // 保留团队分工相关状态
  const [operatorMembers, setOperatorMembers] = useState<OperatorMember[]>([]);

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

  const filteredModalMembers = useMemo(
    () => filterOperatorMembers(operatorMembers, memberSearchQuery),
    [operatorMembers, memberSearchQuery],
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

  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const { setRoleUser, hideRole, showAllRoles, setOperatorToSelf, setOperatorUser, setScriptAuthorUser } = useAssigneeController({
    userId, operatorMembers, metaRef, setMeta, markManualEdit, setHasManualScriptAuthorSelection, setHasManualOperatorSelection, setHiddenRoles,
  });

  // 初始化 operator
  useEffect(() => {
    if (mode === "editToday") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 新建/补交默认责任人设为本人，mode 切换时重置
    setOperatorToSelf();
  }, [mode, setOperatorToSelf]);

  // 团队成员使用内存快取 + 后台预取（0ms 秒开无延迟）
  const loadOperatorMembers = useCallback(() => {
    void fetchCachedOperatorMembers().then((members) => {
      if (Array.isArray(members) && members.length > 0) {
        setOperatorMembers(members as OperatorMember[]);
      }
    });
  }, []);

  useEffect(() => {
    loadOperatorMembers();
  }, [loadOperatorMembers]);

  const metricsGroupRef = useRef<MetricGroupHandle | null>(null);
  const metaVideoTitleRef = useRef<HTMLInputElement | null>(null);
  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const publishedAtSectionRef = useRef<HTMLDivElement | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scriptCaptureRef = useRef<HTMLDivElement | null>(null);

  const [interactionConfirm, setInteractionConfirm] = useState<{
    open: boolean;
    interactions: number;
    playCount: number;
  }>({
    open: false,
    interactions: 0,
    playCount: 0,
  });

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
    el.focus();
    const highlightClasses = ["ring-2", "ring-[#D97757]/60", "ring-offset-1"];
    el.classList.add(...highlightClasses);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      el.classList.remove(...highlightClasses);
      highlightTimerRef.current = null;
    }, 1500);
  }, []);

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
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isPastedFeedback, setIsPastedFeedback] = useState(false);

  const [isMoreSettingsExpanded, setIsMoreSettingsExpanded] = useState(false);

  useEffect(() => {
    if (!isSubmitted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 提交完成后复位交互标记，等待下一次提交
      setHasUserInteracted(false);
    }
  }, [isSubmitted]);

  const { clearDraft, lastSavedAt, showDraftBanner, handleRestoreDraft, handleDiscardDraft } = useVideoSubmitDraftController({
    userId, accountId: account?.id ?? null, today, mode, videoId: editDetail?.videoId ?? null, meta, fields, slots, scriptText, keywordInput, hasManualScriptAuthorSelection, hasManualOperatorSelection, hasManualEdit, isSubmitted, submittedViewActive, hasInitialSummary: Boolean(initialSummary), dispatchWorkflow, setHasManualScriptAuthorSelection, setHasManualOperatorSelection, setHasManualEdit, setScriptText, setKeywordInput,
  });

  // 豁免/请假审批通知本地关闭状态
  const [dismissedReviewNotice, setDismissedReviewNotice] = useState(false);

  useEffect(() => {
    if (!userExemptionReviewNotice) return;
    let nextDismissed = false;
    try {
      const key = `dydata:notice:${userExemptionReviewNotice.id || userExemptionReviewNotice.created_at || "review"}`;
      nextDismissed = window.sessionStorage.getItem(key) === "dismissed";
    } catch {}
    const timeoutId = window.setTimeout(() => setDismissedReviewNotice(nextDismissed), 0);
    return () => window.clearTimeout(timeoutId);
  }, [userExemptionReviewNotice]);

  const handleDismissReviewNotice = useCallback(() => {
    if (!userExemptionReviewNotice) return;
    setDismissedReviewNotice(true);
    try {
      const key = `dydata:notice:${userExemptionReviewNotice.id || userExemptionReviewNotice.created_at || "review"}`;
      window.sessionStorage.setItem(key, "dismissed");
    } catch {}
  }, [userExemptionReviewNotice]);

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
          <div className="inline-flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="font-normal text-[#1F1E1D] hover:text-[#D97757] transition-colors cursor-pointer"
            >
              恢复
            </button>
            <span className="text-[#A8A29E]" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-[#78716C] hover:text-status-danger transition-colors cursor-pointer"
            >
              丢弃
            </button>
          </div>
        ),
      });
    }

    // 2. 请假/豁免审批结果通知
    if (userExemptionReviewNotice && !dismissedReviewNotice) {
      items.push(
        buildExemptionReviewNoticeItem(
          userExemptionReviewNotice,
          handleDismissReviewNotice,
        ),
      );
    }

    // 3. 待审批中提示
    if (isExemptionPending) {
      items.push({
        id: "pending-exemption",
        type: "exemption_pending",
        statusTone: "amber",
        title: "特殊豁免申请审批中",
        description: "· 正在等待管理员审批",
        onDismiss: onDismissPendingExemption,
      });
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
    handleDiscardDraft,
    handleDismissReviewNotice,
    handleRestoreDraft,
    initialTopicId,
    initialTopicTitle,
    selectedTopicId,
    selectedTopicTitle,
    isExemptionPending,
    onDismissPendingExemption,
    showDraftBanner,
    userExemptionReviewNotice,
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
      : createInitialMeta(today, userId, initialBizDate ?? today);
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

    dispatchWorkflow({
      type: "draft/restore",
      meta: nextMeta,
      fields: editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
      slots: editDetail ? createEditableSlotsFromEditDetail(editDetail) : createEditableSlots(),
    });
    setIsSubmitted(false);
    setSubmittedReportId(null);
    setQualityCheck({ data: null, loading: false });
    setDeleteTargetRole(null);
    setKeywordInput("");
    setScriptText(editDetail?.conversionScript?.text ?? "");
    setFocusedRole(null);
    setHasManualScriptAuthorSelection(false);
    setHasManualOperatorSelection(false);
    setHasManualEdit(editDetail?.dataSource === "manual");
  }, [
    account?.id,
    editDetail,
    initialBizDate,
    initialSummary,
    isBackfillMode,
    today,
    userId,
    submittedViewActive,
  ]);

  // 提交验证相关计算
  const submissionState = buildSubmissionState(slots, fields, isSubmitted);
  const screenshotsRequired = areSubmissionScreenshotsRequired(meta.anomalyStatus);
  // 与后端同一判定：只有 create 会因「发布时间未确认」被拒
  // （edit = 编辑历史、abnormal = 异常上报，后端都跳过该门禁）。
  const publishedAtConfirmed = isPublishedAtConfirmed(meta.publishedAtText);
  const editDraftVideoId = editDetail?.videoId ?? null;
  const submitMode = resolveVideoSubmitMode({
    panelMode: mode,
    anomalyStatus: meta.anomalyStatus,
    videoId: editDraftVideoId,
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
      }),
    [
      submissionState,
      meta.topicTag,
      meta.anomalyStatus,
      meta.videoTitle,
      meta.content,
      submitMode,
      publishedAtConfirmed,
    ],
  );
  const issueSummaryRef = useRef(issueSummary);
  useEffect(() => {
    issueSummaryRef.current = issueSummary;
  }, [issueSummary]);
  // 发布时间提示在「更多设置」里，该区块默认折叠。等它成为唯一阻塞项时自动展开，
  // 否则用户只看到一个点不动的提交按钮，不知道要重新上传截图。
  const shouldRevealPublishedAtHint =
    issueSummary.publishedAtUnconfirmed && issueSummary.totalIssueCount === 1;
  useEffect(() => {
    if (!shouldRevealPublishedAtHint) return;
    setIsMoreSettingsExpanded(true);
  }, [shouldRevealPublishedAtHint]);
  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: meta.anomalyStatus,
    submissionMode: submitMode,
    publishedAtConfirmed,
  });
  const canActuallySubmit = issueSummary.canSubmit;
  const hasSlotIssues =
    issueSummary.missingRequiredSlots.length > 0 ||
    issueSummary.processingRequiredSlots.length > 0 ||
    issueSummary.failedRequiredSlots.length > 0;
  const submitButtonLabel = isSubmitting
    ? "提交中..."
    : isBackfillMode
      ? "确认补交立卷"
      : initialSummary
        ? "保存修改"
        : "确认提交立卷";

  function updateMeta<Key extends keyof FormMetaState>(
    key: Key,
    value: FormMetaState[Key],
  ) {
    if (
      shouldMarkManualDailyReportSourceForMetaField(key) &&
      hasActualFieldChange(meta[key], value)
    ) {
      markManualEdit();
    }
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

  function updateScriptText(value: string) {
    setScriptText(value);
  }

  function updatePublishedAt(nextPublishedAt: string) {
    const synced = syncPublishedAtAndText({
      nextPublishedAt,
      nextPublishedAtText: meta.publishedAtText,
      changedField: "published_at",
    });
    if (
      hasActualFieldChange(meta.publishedAt, synced.publishedAt) ||
      hasActualFieldChange(meta.publishedAtText, synced.publishedAtText)
    ) {
      markManualEdit();
    }
    setMeta((current) => ({
      ...current,
      bizDate: preserveBizDateWhenPublishedAtChanges(current.bizDate),
      publishedAt: synced.publishedAt,
      publishedAtText: synced.publishedAtText,
    }));
  }

  const scrollToIssueAnchor = useCallback((
    anchor: "slots" | "metrics" | "topicTag" | "meta" | "publishedAt" | null,
  ) => {
    if (anchor === "publishedAt") {
      setIsMoreSettingsExpanded(true);
      requestAnimationFrame(() => {
        setTimeout(() => {
          publishedAtSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      });
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

    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  function handleFieldFocus(key: EditableMetricKey) {
    const nextFocusedRole = getSlotRoleForMetric(key);
    setFocusedRole(nextFocusedRole);

    const slot = slots[nextFocusedRole];
    if (!slot?.ocrSummary) {
      setHighlightedOcrIndex(null);
      return;
    }

    // 摘要行格式固定为 `${METRIC_SUMMARY_LABELS[key]}：${值}`（生成端同源），
    // 必须按「标签 + 全角冒号」前缀精确匹配：旧实现用短词 includes 会让
    // 「整体完播率」被同一行里的「5秒完播率」抢先命中，且「5s完播」匹配不上中文写法。
    const prefix = `${METRIC_SUMMARY_LABELS[key]}：`;
    const idx = slot.ocrSummary.findIndex((line) => line.startsWith(prefix));
    setHighlightedOcrIndex(idx >= 0 ? idx : null);
  }

  function handleFieldBlur() {
    setFocusedRole(null);
    setHighlightedOcrIndex(null);
  }

  async function handleQualityCheck() {
    setHasUserInteracted(true);
    if (!submittedReportId) {
      feedbackToast.error("未获取到本次日报记录，无法进行 AI 检查，请稍后重试");
      return;
    }
    setQualityCheck({ data: null, loading: true });

    const failWith = (reason?: string) => {
      feedbackToast.error(
        reason ? `AI 检查未完成：${reason}（不影响您直接提交）` : "AI 检查未完成，不影响您直接提交",
      );
      setQualityCheck({ data: null, loading: false });
    };

    let res: Response;
    try {
      res = await fetch("/api/dashboard/sample-quality-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: submittedReportId }),
      });
    } catch {
      // 网络层失败，拿不到服务端给的原因
      failWith();
      return;
    }

    const payload = (await res.json().catch(() => null)) as
      | (SubmissionQualityResponse & { error?: string })
      | null;

    if (!res.ok) {
      // 服务端已把失败原因翻成人话，直接透出，不再吞成通用提示
      failWith(payload?.error?.trim() || undefined);
      return;
    }

    if (!payload?.overallStatus) {
      failWith("服务端返回内容无法解析");
      return;
    }

    setQualityCheck({ data: payload, loading: false });
  }

  function handleFixIssue(issue: SubmissionQualityIssue) {
    if (issue.suggestedFix === "edit_field") {
      onRequestEdit?.();
    } else if (issue.suggestedFix === "reupload_screenshot") {
      setIsSubmitted(false);
      setQualityCheck({ data: null, loading: false });
      updateSlotsState((current) => ({
        ...current,
        screenshot_1: { ...createEditableSlots().screenshot_1 },
        screenshot_2: { ...createEditableSlots().screenshot_2 },
      }));
    } else if (issue.suggestedFix === "manual_review") {
      toast.message("请联系管理员复核");
    }
  }

  // 用户手改过的字段不被二次识别覆盖；未手改的字段按最新识别结果刷新，并留存 OCR 原值供恢复。
  function restoreOcrValue(key: EditableMetricKey) {
    setFields((current) => ({
      ...current,
      [key]: restoreOcrFieldValue(current[key]),
    }));
  }

  // OCR 上传、识别与槽位归并由独立 controller 负责。
  const handleSlotUpload = useCallback(
    (role: SubmissionSlotRole, file: File) => createUploadHandler({ account, userId, initialSummary, supabase, ocrTasksRef, slotsRef, blobUrlsRef, updateSlotsState, dispatchWorkflow })(role, file),
    [account, userId, initialSummary, supabase, updateSlotsState, dispatchWorkflow],
  );

  function handleSlotRetry(role: SubmissionSlotRole) {
    const slot = slots[role];
    if (
      !slot.file ||
      !(slot.status === "failed" || slot.status === "pending_confirm" || slot.ocrFallback)
    ) {
      return;
    }
    void handleSlotUpload(role, slot.file);
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
      feedbackToast.error("无法读取剪贴板，请手动粘贴");
    }
  }

  // Controller receives event-time callbacks; refs are read only when submit/appeal handlers run.
  // eslint-disable-next-line react-hooks/refs
  const { executeSubmit, requestLateSubmission, handleConfirmAppeal } = createSubmitController({
    account, userId, mode, today, meta, fields, slots, editDetail, selectedTopicId, initialTopicId, scriptText, hasManualEdit, supabase,
    setPendingSubmissionPayload,
    getPendingSubmissionPayload: () => pendingSubmissionPayload,
    setIsSubmitting, setAppealRequired, setIsSubmitted, setSubmittedReportId, setIsAppealDialogOpen, setIsAppealSubmitting, isAppealSubmitting, appealReason, onSubmitted, clearDraft, scrollToIssueAnchor,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasAttemptedSubmit(true);

    if (!account) {
      triggerFormShake();
      return;
    }

    // 智能兜底：若截图已上传但处于识别失败态，且用户已手工录入关键指标，自动解除失败状态转手动确认
    const canAutoResolve1 = slots.screenshot_1.status === "failed" && Boolean(slots.screenshot_1.assetUrl) && hasManualEdit;
    const canAutoResolve2 = slots.screenshot_2.status === "failed" && Boolean(slots.screenshot_2.assetUrl) && hasManualEdit;

    if (canAutoResolve1 || canAutoResolve2) {
      updateSlotsState((curr) => ({
        ...curr,
        ...(canAutoResolve1 ? { screenshot_1: { ...curr.screenshot_1, status: "confirmed", confirmed: true, ocrFallback: true, error: null } } : {}),
        ...(canAutoResolve2 ? { screenshot_2: { ...curr.screenshot_2, status: "confirmed", confirmed: true, ocrFallback: true, error: null } } : {}),
      }));
    }

    if (!submitCheck.ok || !issueSummary.canSubmit) {
      triggerFormShake();
      scrollToIssueAnchor(issueSummary.firstIssueAnchor);
      const invalidKey = issueSummary.firstInvalidFieldKey;
      if (invalidKey) {
        if (invalidKey === "videoTitle") {
          focusWithHighlight(metaVideoTitleRef.current);
        } else if (invalidKey === "content") {
          focusWithHighlight(contentTextareaRef.current);
        } else if (invalidKey === "topicTag") {
          // 维持现状仅滚动
        } else {
          metricsGroupRef.current?.focusMetric(invalidKey);
        }
      } else if (issueSummary.missingRequiredSlots.length > 0) {
        triggerSlotsPulse();
      }
      return;
    }

    if (!meta.topicTag) {
      triggerFormShake();
      scrollToIssueAnchor("topicTag");
      const topicBtn = topicTagSectionRef.current?.querySelector("button");
      if (topicBtn) {
        focusWithHighlight(topicBtn);
      }
      return;
    }

    if (parseMetric(fields.follower_convert.value) > 0 && !scriptText.trim()) {
      triggerFormShake();
      const scriptEl = scriptCaptureRef.current?.querySelector("textarea");
      if (scriptEl) {
        focusWithHighlight(scriptEl);
      }
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
    if (editDetailError || (mode === "editToday" && !editPayload)) {
      triggerFormShake();
      feedbackToast.error(editDetailError ?? "缺少原视频完整详情，已停止保存以避免覆盖旧数据");
      return;
    }

    const interactionCheck = isInteractionExceedingPlayCount({
      play_count: fields.play_count?.value ?? null,
      likes: fields.likes?.value ?? null,
      comments: fields.comments?.value ?? null,
      shares: fields.shares?.value ?? null,
      favorites: fields.favorites?.value ?? null,
    });
    if (interactionCheck.exceeded) {
      setInteractionConfirm({ open: true, ...interactionCheck });
      return;
    }

    await executeSubmit();
  }

  // 队列多图上传
  const handleUnifiedUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      let uploadedCount = 0;
      for (const file of files) {
        const role = findNextScreenshotUploadRole(
          slotsRef.current,
          VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER,
        );
        if (!role) break;

        await handleSlotUpload(role, file);
        uploadedCount++;
      }

      if (uploadedCount < files.length) {
        toast.warning(`槽位已满，仅上传了前 ${uploadedCount} 张图片`);
      }
    },
    [handleSlotUpload],
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
      const invalidKey = issueSummaryRef.current.firstInvalidFieldKey;
      if (invalidKey) {
        if (invalidKey === "videoTitle") {
          focusWithHighlight(metaVideoTitleRef.current);
        } else if (invalidKey === "content") {
          focusWithHighlight(contentTextareaRef.current);
        } else if (invalidKey === "topicTag") {
          // 维持现状仅滚动
        } else {
          metricsGroupRef.current?.focusMetric(invalidKey);
        }
      } else if (issueSummaryRef.current.missingRequiredSlots.length > 0) {
        triggerSlotsPulse();
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
  }, [canActuallySubmit, scrollToIssueAnchor, triggerFormShake, triggerSlotsPulse]);

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
      <div className="py-6 text-[13px] text-[#78716C]">
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
          setQualityCheck={setQualityCheck}
          qualityCheck={qualityCheck}
          onRequestEdit={onRequestEdit}
          onCancel={onCancel}
          handleQualityCheck={handleQualityCheck}
          handleFixIssue={handleFixIssue}
        />
      ) : (
        <>
          <FormV2Dialogs
            deleteTargetRole={deleteTargetRole}
            setDeleteTargetRole={setDeleteTargetRole}
            ocrTasksRef={ocrTasksRef}
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
            className="w-full"
          >
            <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5 py-0">
              {/* 主工作区 - Claude 设计系统 */}
              <div className="space-y-4 sm:space-y-5">
                {/* 头部：状态 + 提示微胶囊 + 日期 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 sm:pb-4 border-b border-[#E2E2DF]/60">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <SectionHeading as="h2">
                      {mode === "editToday"
                        ? meta.bizDate !== today
                          ? `修改历史作品 · ${meta.bizDate}`
                          : `修改今日作品 · ${meta.bizDate}`
                        : isBackfillMode
                          ? `创作纪事补录 (${meta.bizDate})`
                          : "创作表达录入"}
                    </SectionHeading>
                    <VideoStatusSegmented
                      value={meta.anomalyStatus}
                      onChange={(value) => updateMeta("anomalyStatus", value)}
                    />
                    {meta.anomalyStatus === "abnormal" && (
                      <Select
                        value={meta.punishType || "限流"}
                        onValueChange={(value) => updateMeta("punishType", value || undefined)}
                      >
                        <SelectTrigger className="h-6 rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[12px] font-normal text-[#1F1E1D] shadow-input hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10">
                          <SelectValue>{meta.punishType || "限流"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-[#E2E2DF] bg-white shadow-claude-float min-w-28">
                          <SelectItem value="限流">限流</SelectItem>
                          <SelectItem value="删稿">删稿</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* 右上角：草稿 / 审批微提示 */}
                    {workbenchNotices.length > 0 && (
                      <WorkbenchNoticeCapsule notices={workbenchNotices} />
                    )}

                    {meta.bizDate !== today && (
                      <div className="text-[12px] text-[#78716C] tabular-nums">
                        归属：{meta.bizDate}
                      </div>
                    )}
                  </div>
                </div>

                <FormV2Workspace
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
                  highlightedOcrIndex={highlightedOcrIndex}
                  pulseSlots={pulseSlots}
                  hiddenRoleRestoreLabel={hiddenRoleRestoreLabel}
                  showAllRoles={showAllRoles}
                  hasAnyVisibleRole={hasAnyVisibleRole}
                  isScriptAuthorVisible={isScriptAuthorVisible}
                  isVideoEditorVisible={isVideoEditorVisible}
                  isOperatorVisible={isOperatorVisible}
                  resolveRoleDisplay={resolveRoleDisplay}
                  meta={meta}
                  loadOperatorMembers={loadOperatorMembers}
                  setSelectingRole={setSelectingRole}
                  hideRole={hideRole}
                  topicTagSectionRef={topicTagSectionRef}
                  updateMeta={updateMeta}
                  isMoreSettingsExpanded={isMoreSettingsExpanded}
                  setIsMoreSettingsExpanded={setIsMoreSettingsExpanded}
                  publishedAtSectionRef={publishedAtSectionRef}
                  updatePublishedAt={updatePublishedAt}
                  issueSummary={issueSummary}
                  publishedAtUnconfirmedReason={PUBLISHED_AT_UNCONFIRMED_REASON}
                  fields={fields}
                  metricsGroupRef={metricsGroupRef}
                  updateField={updateField}
                  restoreOcrValue={restoreOcrValue}
                  handleFieldFocus={handleFieldFocus}
                  handleFieldBlur={handleFieldBlur}
                  scriptCaptureRef={scriptCaptureRef}
                  scriptText={scriptText}
                  updateScriptText={updateScriptText}
                  hasAttemptedSubmit={hasAttemptedSubmit}
                  hasSlotIssues={hasSlotIssues}
                  metaSectionRef={metaSectionRef}
                  metaVideoTitleRef={metaVideoTitleRef}
                  selectedTopicId={selectedTopicId}
                  selectedTopicTitle={selectedTopicTitle}
                  handleSelectTopic={handleSelectTopic}
                  handlePasteContent={handlePasteContent}
                  isPastedFeedback={isPastedFeedback}
                  contentTextareaRef={contentTextareaRef}
                />
              </div>

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
                hasAttemptedSubmit={hasAttemptedSubmit}
                issueSummary={issueSummary}
                scrollToIssueAnchor={scrollToIssueAnchor}
                triggerSlotsPulse={triggerSlotsPulse}
                isSubmitted={isSubmitted}
                lastSavedAt={lastSavedAt}
                appealRequired={appealRequired}
                requestLateSubmission={requestLateSubmission}
                isAppealSubmitting={isAppealSubmitting}
                isBackfillMode={isBackfillMode}
                submittedViewActive={submittedViewActive}
                onCancel={onCancel}
                triggerSubmit={triggerSubmit}
                isSubmitting={isSubmitting}
                submitButtonLabel={submitButtonLabel}
              />
            </div>
          </motion.form>
        </>
      )}
      <ConfirmDialog
        open={interactionConfirm.open}
        title="互动数据异常确认"
        description={`点赞+评论+转发+收藏总和（${interactionConfirm.interactions}）超过了播放量（${interactionConfirm.playCount}），请核对是否存在识别错误。确认无误后继续提交？`}
        confirmText="确认提交"
        cancelText="取消"
        onConfirm={async () => {
          setInteractionConfirm((prev) => ({ ...prev, open: false }));
          await executeSubmit();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setInteractionConfirm((prev) => ({ ...prev, open: false }));
          }
        }}
      />
    </>
  );
}

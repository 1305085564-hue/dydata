"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Compass,
  XCircle,
  AlertTriangle,
  CheckCircle,
  ClipboardPaste,
  ChevronDown,
  Search,
  Check,
  X,
  FileText,
  Scissors,
  Rocket,
  PencilLine,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { SectionHeading } from "@/components/ui/section-heading";
import { ItemHeading } from "@/components/ui/item-heading";
import { Badge } from "@/components/ui/badge";
import { shakeVariants } from "@/lib/animations";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ZenFinishedIllustration } from "@/components/editorial/editorial-illustrations";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AnomalyStatus, Video, VideoTagReviewDimension } from "@/types";

import { 指标分组区, type MetricGroupHandle } from "@/components/submission/指标分组区";
import { 导粉话术采集区 } from "@/components/submission/导粉话术采集区";
import { 截图槽位区 } from "@/components/submission/截图槽位区";
import { TopicSelectDropdown, type SelectedTopicInfo } from "@/components/submission/TopicSelectDropdown";
import { PublishedAtPicker, fetchCachedOperatorMembers } from "./history-report-edit-form";
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
  type EditableMetricKey,
  type SubmissionSlotRole,
  type SubmissionState,
} from "@/components/submission/提交状态机";
import {
  OCR_FAIL_MESSAGE,
  resolveOcrErrorMessage,
  toOcrErrorMessage,
  toScreenshotUploadErrorMessage,
} from "@/components/submission/截图上传错误";
import { useFormDraft } from "@/hooks/use-form-draft";
import { parseMetricFieldOrNull } from "@/lib/dashboard-logic/use-video-submit-form";
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import { hasActualFieldChange } from "@/lib/daily-report-data-source";
import {
  buildVideoSubmitDraftKey,
  resolveVideoSubmitCreateDraftStorageKey,
  type VideoSubmitDraftMode,
} from "@/lib/video-submit-draft-key";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  applyOcrMetricValues,
  isInteractionExceedingPlayCount,
  restoreOcrFieldValue,
  summarizeSubmissionIssues,
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import {
  addRoleOverride as addSubmissionRoleOverride,
  getVideoSubmissionEditDetailError,
  normalizeOptionalText,
  removeRoleOverride as removeSubmissionRoleOverride,
  findNextScreenshotUploadRole,
  getHiddenRoleRestoreLabel,
  getDefaultPublishedAtForBizDate,
  resolveAssigneeDisplay,
  resolveVideoSubmitMetaFields,
  resolveVideoSubmitMode,
  preserveBizDateWhenPublishedAtChanges,
  setOperatorToSelf as resolveSelfOperatorUserId,
  setOperatorUser as resolveSelectedOperatorUserId,
  shouldMarkManualDailyReportSourceForMetaField,
  type AssigneeDisplay,
  type HistoricalAssigneeProfile,
  type SubmissionAssigneeRole,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";

import {
  buildOcrSummary,
  createEditableFields,
  createEditableFieldsFromEditDetail,
  createEditableSlots,
  createEditableSlotsFromEditDetail,
  createInitialMeta,
  createMetaFromEditDetail,
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
import { buildSubmissionAssets, buildSubmissionState } from "@/lib/video-submit-workflow/selectors";

// 保留所有原有类型定义
interface SampleQualityIssue {
  severity: "critical" | "warning" | "info";
  field?: string;
  title: string;
  detail: string;
  suggestedFix?: "edit_field" | "reupload_screenshot" | "manual_review";
}

interface SampleQualityResponse {
  reportId: string;
  overallStatus: "pass" | "warning" | "fail";
  issues: SampleQualityIssue[];
  checkedAt: string;
}

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

type SubmitResponse = {
  data?: Video;
  video?: Video;
  daily_report_id?: string;
  ai_tags?: Array<{
    tag_dimension: VideoTagReviewDimension;
    tag_value: string;
    confidence: number | null;
    reason: string | null;
  }>;
  error?: string;
  code?: string;
};

type CompleteEditPayload = {
  video_id: string;
  account_id: string;
  biz_date: string;
  metrics: Record<string, unknown>;
  assignees: {
    script_author_user_id: string | null;
    video_editor_user_id: string | null;
    operator_user_id: string | null;
  };
  script_format: string | null;
};

function resolveCompleteEditPayload(
  detail: VideoSubmissionEditDetail | null | undefined,
  expected: { accountId: string; bizDate: string },
): CompleteEditPayload | null {
  if (getVideoSubmissionEditDetailError(detail, expected)) return null;
  if (!detail) return null;

  return {
    video_id: detail.videoId,
    account_id: detail.accountId,
    biz_date: detail.bizDate,
    metrics: detail.metrics,
    assignees: {
      script_author_user_id: detail.meta.scriptAuthorUserId,
      video_editor_user_id: detail.meta.videoEditorUserId,
      operator_user_id: detail.meta.operatorUserId,
    },
    script_format: detail.conversionScript?.format ?? "oral",
  };
}

type OcrApiPayload = {
  data?: {
    slot_status: "pending_confirm" | "confirmed" | "failed";
    screenshot_type: "data" | "curve" | "retention";
    confidence_score: number;
    requires_manual_confirmation: boolean;
    recognized_fields: Record<string, string | number | boolean | null> | null;
    confidence?: Partial<
      Record<
        | "play_count"
        | "likes"
        | "comments"
        | "shares"
        | "favorites"
        | "follower_gain"
        | "follower_convert",
        "high" | "medium" | "low"
      >
    >;
    error?: string;
    error_code?: string;
  };
  error?: string;
  error_code?: string;
  retry_after?: number;
  screenshot_type_source?: "explicit" | "asset_role" | "asset_role_fallback";
  timings?: {
    download_ms?: number;
    ocr_ms?: number;
    parse_ms?: number;
    total_ms: number;
  };
};

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ScreenshotUploadResponse = {
  data?: {
    bucket: string;
    path: string;
    url: string;
  };
  error?: string;
};

type OperatorMember = {
  id: string;
  name: string;
  display_name: string;
  department: string | null;
  team_id: string | null;
};

const SLOT_LABELS: Record<SubmissionSlotRole, string> = {
  screenshot_1: "互动截图",
  screenshot_2: "完播截图",
};

// 保留所有辅助函数
function parseMetric(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isVideo(value: unknown): value is Video {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    "account_id" in value
  );
}

async function uploadSubmissionScreenshot(input: {
  accountId: string;
  role: SubmissionSlotRole;
  file: File;
}) {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("account_id", input.accountId);
  formData.append("asset_role", input.role);

  const response = await fetch("/api/submission-screenshots", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as ScreenshotUploadResponse;
  if (!response.ok || !payload.data?.url) {
    throw new Error(payload.error || "截图上传失败，请稍后重试");
  }

  return payload.data;
}

function createSummaryOverride(
  accountId: string,
  meta: FormMetaState,
  fields: SubmissionState["fields"],
): TodaySubmissionReportLike {
  const stringifyMetric = (value: string) => {
    const trimmed = value.trim();
    return trimmed || "0";
  };

  return {
    account_id: accountId,
    title: normalizeOptionalText(meta.videoTitle),
    content: normalizeOptionalText(meta.content),
    report_date: meta.bizDate,
    play_count: parseMetric(fields.play_count.value),
    likes: parseMetric(fields.likes.value),
    comments: parseMetric(fields.comments.value),
    shares: parseMetric(fields.shares.value),
    favorites: parseMetric(fields.favorites.value),
    follower_gain: parseMetric(fields.follower_gain.value),
    follower_convert: parseMetric(fields.follower_convert.value),
    completion_rate: stringifyMetric(fields.completion_rate.value),
    avg_play_duration: stringifyMetric(fields.avg_play_duration.value),
    bounce_rate_2s: stringifyMetric(fields.bounce_rate_2s.value),
    completion_rate_5s: stringifyMetric(fields.completion_rate_5s.value),
    published_at: meta.publishedAt || null,
    uploaded_at: meta.uploadedAt,
  };
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

  // 继续保留所有原有状态...
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealRequired, setAppealRequired] = useState(false);
  const [isAppealSubmitting, setIsAppealSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);
  const triggerFormShake = useCallback(() => {
    setShakeForm(true);
    setTimeout(() => setShakeForm(false), 500);
  }, []);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [qualityCheck, setQualityCheck] = useState<{
    data: SampleQualityResponse | null;
    loading: boolean;
  }>({ data: null, loading: false });
  const [deleteTargetRole, setDeleteTargetRole] =
    useState<SubmissionSlotRole | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [focusedRole, setFocusedRole] = useState<SubmissionSlotRole | null>(
    null,
  );
  const [highlightedOcrIndex, setHighlightedOcrIndex] = useState<number | null>(
    null,
  );
  const [scriptText, setScriptText] = useState("");
  // 默认值、编辑详情回填和 OCR 回填都不是手工操作；只有用户修改业务字段才置为 true。
  // 它随草稿保存，OCR 重试与恢复草稿都不能把手工来源降级。
  const [hasManualEdit, setHasManualEdit] = useState(
    () => editDetail?.dataSource === "manual",
  );
  const markManualEdit = useCallback(() => setHasManualEdit(true), []);
  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsSectionRef = useRef<HTMLDivElement | null>(null);

  // 保留团队分工相关状态
  const [hasManualScriptAuthorSelection, setHasManualScriptAuthorSelection] =
    useState(false);
  const [hasManualOperatorSelection, setHasManualOperatorSelection] =
    useState(false);
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

  const filteredModalMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return operatorMembers;
    const q = memberSearchQuery.trim().toLowerCase();
    return operatorMembers.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.display_name?.toLowerCase().includes(q),
    );
  }, [operatorMembers, memberSearchQuery]);

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

  // 保留所有团队分工相关函数
  const setRoleUser = useCallback(
    (
      role: SubmissionAssigneeRole,
      id: string,
      options: { isManual?: boolean } = {},
    ) => {
      const operatorUserId = resolveSelectedOperatorUserId(id);
      if (
        operatorMembers.length > 0 &&
        !operatorMembers.some((member) => member.id === operatorUserId)
      ) {
        feedbackToast.error("责任人必须是当前团队或小组中的成员");
        return;
      }
      const assignmentKey =
        role === "script_author"
          ? "scriptAuthorUserId"
          : role === "video_editor"
            ? "videoEditorUserId"
            : "operatorUserId";
      const currentMeta = metaRef.current;
      const roleOverrideChanged = operatorUserId === userId
        ? currentMeta.roleOverrides.includes(role)
        : !currentMeta.roleOverrides.includes(role);
      if (
        (options.isManual ?? true) &&
        (hasActualFieldChange(currentMeta[assignmentKey], operatorUserId) || roleOverrideChanged)
      ) {
        markManualEdit();
      }
      setMeta((current) => {
        const next =
          operatorUserId === userId
            ? removeSubmissionRoleOverride({
                userId,
                role,
                assignments: current,
                overrides: current.roleOverrides,
              })
            : addSubmissionRoleOverride({
                userId,
                role,
                assignments: current,
                overrides: current.roleOverrides,
              });
        return {
          ...current,
          ...next.assignments,
          [assignmentKey]: operatorUserId,
          roleOverrides: next.overrides,
        };
      });
      if (role === "script_author")
        setHasManualScriptAuthorSelection(options.isManual ?? true);
      if (role === "operator")
        setHasManualOperatorSelection(options.isManual ?? true);
    },
    [markManualEdit, operatorMembers, setMeta, userId],
  );

  const removeRoleOverride = useCallback(
    (role: SubmissionAssigneeRole) => {
      const assignmentKey =
        role === "script_author"
          ? "scriptAuthorUserId"
          : role === "video_editor"
            ? "videoEditorUserId"
            : "operatorUserId";
      const currentMeta = metaRef.current;
      if (
        hasActualFieldChange(currentMeta[assignmentKey], userId) ||
        currentMeta.roleOverrides.includes(role)
      ) {
        markManualEdit();
      }
      setMeta((current) => {
        const next = removeSubmissionRoleOverride({
          userId,
          role,
          assignments: current,
          overrides: current.roleOverrides,
        });
        return {
          ...current,
          ...next.assignments,
          roleOverrides: next.overrides,
        };
      });
      if (role === "script_author") setHasManualScriptAuthorSelection(false);
      if (role === "operator") setHasManualOperatorSelection(false);
    },
    [markManualEdit, setMeta, userId],
  );

  const hideRole = useCallback(
    (role: SubmissionAssigneeRole) => {
      removeRoleOverride(role);
      setHiddenRoles((prev) => {
        const next = new Set(prev);
        next.add(role);
        return next;
      });
    },
    [removeRoleOverride],
  );

  const showAllRoles = useCallback(() => {
    setHiddenRoles(new Set());
  }, []);

  const setOperatorToSelf = useCallback(() => {
    removeRoleOverride("operator");
  }, [removeRoleOverride]);

  const setOperatorUser = useCallback(
    (id: string, options: { isManual?: boolean } = {}) => {
      setRoleUser("operator", id, options);
    },
    [setRoleUser],
  );

  const setScriptAuthorUser = useCallback(
    (id: string, options: { isManual?: boolean } = {}) => {
      setRoleUser("script_author", id, options);
    },
    [setRoleUser],
  );

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

  // 草稿管理：新建 / 补交 / 编辑使用互相隔离的草稿 key
  const draftMode: VideoSubmitDraftMode =
    mode === "editToday" ? "edit" : mode === "backfill" ? "backfill" : "create";
  const createDraftStorageKey = useMemo(
    () =>
      resolveVideoSubmitCreateDraftStorageKey({
        userId,
        accountId: account?.id ?? null,
        bizDate: today,
      }),
    [account?.id, userId, today],
  );
  const editDraftVideoId = editDetail?.videoId ?? null;
  const draftKey = useMemo(() => {
    if (draftMode === "create") return createDraftStorageKey;
    return buildVideoSubmitDraftKey({
      userId,
      mode: draftMode,
      accountId: account?.id ?? null,
      bizDate: meta.bizDate || today,
      videoId: editDraftVideoId,
    });
  }, [account?.id, createDraftStorageKey, draftMode, editDraftVideoId, meta.bizDate, today, userId]);

  type DraftData = {
    meta: FormMetaState;
    fields: Record<EditableMetricKey, EditableMetricField>;
    slots: Record<SubmissionSlotRole, SlotViewState>;
    scriptText: string;
    keywordInput: string;
    hasManualScriptAuthorSelection?: boolean;
    hasManualOperatorSelection?: boolean;
    hasManualEdit?: boolean;
  };

  const draftData: DraftData = useMemo(
    () => ({
      meta,
      fields,
      slots: {
        screenshot_1: { ...slots.screenshot_1, file: null, previewUrl: null },
        screenshot_2: { ...slots.screenshot_2, file: null, previewUrl: null },
      },
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
    useFormDraft<DraftData>(
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
    hasDraft && !isSubmitted && !submittedViewActive && !initialSummary;

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
  }, [restoreDraft, userId]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

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
  const issueSummary = useMemo(
    () =>
      summarizeSubmissionIssues(submissionState, {
        topicTag: meta.topicTag,
        anomalyStatus: meta.anomalyStatus,
        videoTitle: meta.videoTitle,
        content: meta.content,
      }),
    [
      submissionState,
      meta.topicTag,
      meta.anomalyStatus,
      meta.videoTitle,
      meta.content,
    ],
  );
  const issueSummaryRef = useRef(issueSummary);
  useEffect(() => {
    issueSummaryRef.current = issueSummary;
  }, [issueSummary]);
  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: meta.anomalyStatus,
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
    anchor: "slots" | "metrics" | "topicTag" | "meta" | null,
  ) => {
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

  function getSlotRoleForMetric(key: EditableMetricKey): SubmissionSlotRole {
    if (
      [
        "avg_play_duration",
        "bounce_rate_2s",
        "completion_rate_5s",
        "completion_rate",
      ].includes(key)
    ) {
      return "screenshot_2";
    }
    return "screenshot_1";
  }

  function handleFieldFocus(key: EditableMetricKey) {
    const nextFocusedRole = getSlotRoleForMetric(key);
    setFocusedRole(nextFocusedRole);

    const slot = slots[nextFocusedRole];
    if (!slot?.ocrSummary) {
      setHighlightedOcrIndex(null);
      return;
    }

    const labelMap: Record<EditableMetricKey, string> = {
      play_count: "播放量",
      follower_gain: "涨粉",
      follower_convert: "导粉",
      likes: "点赞",
      comments: "评论",
      shares: "分享",
      favorites: "收藏",
      avg_play_duration: "均播",
      bounce_rate_2s: "跳出",
      completion_rate_5s: "5s完播",
      completion_rate: "完播",
    };
    const keyword = labelMap[key];
    const idx = slot.ocrSummary.findIndex((line) => line.includes(keyword));
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
      | (SampleQualityResponse & { error?: string })
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

  function handleFixIssue(issue: SampleQualityIssue) {
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

  // 【核心】OCR 上传处理 - 保留完整业务逻辑
  const handleSlotUpload = useCallback(
    async (role: SubmissionSlotRole, file: File) => {
      if (!account) {
        feedbackToast.error("请先选择提交账号");
        return;
      }

      const oldUrl = slotsRef.current[role]?.previewUrl ?? slotsRef.current[role]?.assetUrl;
      if (oldUrl && oldUrl.startsWith("blob:")) {
        URL.revokeObjectURL(oldUrl);
        blobUrlsRef.current.delete(oldUrl);
      }

      updateSlotsState((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: "uploading",
          fileName: file.name,
          file,
          error: null,
        },
      }));

      let phase: "upload" | "ocr" = "upload";
      let uploadedAssetUrl: string | null = null;
      let uploadedPreviewUrl: string | null = null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user && !userId) {
          throw new Error("登录状态已失效，请刷新页面后重试");
        }

        const uploadStart = performance.now();
        const {
          url: assetUrl,
          bucket,
          path,
        } = await uploadSubmissionScreenshot({
          accountId: account.id,
          role,
          file,
        });
        const uploadMs = Math.round(performance.now() - uploadStart);
        const previewUrl = URL.createObjectURL(file);
        uploadedAssetUrl = assetUrl;
        uploadedPreviewUrl = previewUrl;
        blobUrlsRef.current.add(previewUrl);

        phase = "ocr";
        updateSlotsState((current) => ({
          ...current,
          [role]: {
            ...current[role],
            status: "recognizing",
            assetUrl,
            previewUrl,
          },
        }));

        const ocrRequestStart = performance.now();
        const response = await fetch("/api/ocr-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket,
            path,
            asset_role: role,
          }),
        });
        const ocrRequestMs = Math.round(performance.now() - ocrRequestStart);

        const payload = (await response.json()) as OcrApiPayload;
        const totalMs = Math.round(performance.now() - uploadStart);
        const serverTimings = payload.timings;
        console.log("[OCR 耗时]", {
          role,
          upload_ms: uploadMs,
          ocr_request_ms: ocrRequestMs,
          server_download_ms: serverTimings?.download_ms,
          server_ocr_ms: serverTimings?.ocr_ms,
          server_parse_ms: serverTimings?.parse_ms,
          server_total_ms: serverTimings?.total_ms,
          total_ms: totalMs,
        });

        if (!response.ok || !payload.data) {
          throw new Error(toOcrErrorMessage(payload.error_code ?? payload.error));
        }

        const { data } = payload;
        const recognizedFields = data.recognized_fields;
        const recognizedPublishedAt = typeof recognizedFields?.published_at === "string"
          ? toDateTimeLocalValue(recognizedFields.published_at)
          : null;
        const recognizedPublishedAtText = typeof recognizedFields?.published_at_text === "string"
          ? recognizedFields.published_at_text
          : null;
        const recognizedVideoTitle = typeof recognizedFields?.video_title === "string"
          ? recognizedFields.video_title.trim()
          : "";
        if (recognizedPublishedAt && !hasManualEdit && !initialSummary) {
          setMeta((current) => ({
            ...current,
            publishedAt: recognizedPublishedAt,
            publishedAtText: recognizedPublishedAtText || current.publishedAtText,
          }));
        }
        if (recognizedVideoTitle && !initialSummary) {
          setMeta((current) => current.videoTitle.trim()
            ? current
            : { ...current, videoTitle: recognizedVideoTitle });
        }
        const detectedType = data.screenshot_type;
        const usedAssetRoleFallback = payload.screenshot_type_source === "asset_role_fallback";
        const ocrSummary = buildOcrSummary(
          detectedType,
          data.recognized_fields,
        );

        const resolvedError = data.error_code
          ? resolveOcrErrorMessage(data.error_code)
          : data.error
            ? toOcrErrorMessage(data.error)
            : null;

        // 智能对调逻辑
        let targetRole: SubmissionSlotRole = role;
        if (detectedType === "data") {
          targetRole = "screenshot_1";
        } else if (detectedType === "retention") {
          targetRole = "screenshot_2";
        }

        updateSlotsState((current) => {
          const newSlotData = {
            ...current[role],
            status:
              data.slot_status === "failed" && assetUrl
                ? "pending_confirm"
                : data.slot_status,
            confirmed:
              data.slot_status === "confirmed" &&
              !data.requires_manual_confirmation,
            requiresManualConfirmation:
              data.requires_manual_confirmation ||
              data.slot_status === "failed" ||
              usedAssetRoleFallback,
            confidenceScore: data.confidence_score,
            error:
              data.slot_status === "failed"
                ? (resolvedError ?? OCR_FAIL_MESSAGE)
                : resolvedError,
            assetUrl,
            previewUrl,
            screenshotType: detectedType,
            recognizedFields: data.recognized_fields,
            ocrSummary,
            ocrFallback: data.slot_status === "failed" || usedAssetRoleFallback,
          };

          if (role !== targetRole) {
            const targetSlot = current[targetRole];
            const canMoveToTarget =
              targetSlot.status === "empty" || targetSlot.status === "failed";
            const canSwapWithFallback =
              !canMoveToTarget &&
              (targetSlot.status === "pending_confirm" ||
                Boolean(targetSlot.ocrFallback));

            if (canMoveToTarget) {
              return {
                ...current,
                [targetRole]: {
                  ...newSlotData,
                  role: targetRole,
                },
                [role]: {
                  role,
                  required: current[role].required,
                  status: "empty",
                  confidenceScore: null,
                  requiresManualConfirmation: false,
                  confirmed: false,
                  fileName: undefined,
                  error: null,
                  assetUrl: null,
                  previewUrl: null,
                  file: null,
                  recognizedFields: null,
                  ocrSummary: undefined,
                  ocrFallback: false,
                },
              };
            }

            if (canSwapWithFallback) {
              return {
                ...current,
                [targetRole]: {
                  ...newSlotData,
                  role: targetRole,
                  required: current[targetRole].required,
                },
                [role]: {
                  ...targetSlot,
                  role,
                  required: current[role].required,
                },
              };
            }
          }

          return {
            ...current,
            [role]: newSlotData,
          };
        });

        if (detectedType === "data" && data.recognized_fields) {
          setFields((current) =>
            applyOcrMetricValues(current, data.recognized_fields, data.confidence),
          );
        }

        if (data.slot_status === "failed") {
          feedbackToast.warning("截图已留存，部分指标请直接在右侧/下方核对或补全");
          return;
        }

        if (detectedType === "retention" && data.recognized_fields) {
          const retentionMetrics = data.recognized_fields
            .retention_metrics as unknown as
            Record<string, number | null> | undefined;
          setFields((current) => applyOcrMetricValues(current, retentionMetrics));
        }
      } catch (error) {
        const message =
          phase === "upload"
            ? toScreenshotUploadErrorMessage(error)
            : toOcrErrorMessage(error);
        updateSlotsState((current) => ({
          ...current,
          [role]: {
            ...current[role],
            status: uploadedAssetUrl ? "pending_confirm" : "failed",
            confirmed: false,
            requiresManualConfirmation: true,
            assetUrl: uploadedAssetUrl ?? current[role].assetUrl ?? null,
            previewUrl: uploadedPreviewUrl ?? current[role].previewUrl ?? null,
            error: uploadedAssetUrl
              ? `${message}，截图已保留，可直接手动填写指标`
              : message,
            ocrFallback: Boolean(uploadedAssetUrl),
          },
        }));
      }
    },
    [account, hasManualEdit, initialSummary, setFields, setMeta, supabase.auth, updateSlotsState, userId],
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

  // 【核心】提交处理 - 保留完整业务逻辑
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

      const response = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: resolveVideoSubmitMode({
            panelMode: mode,
            anomalyStatus: meta.anomalyStatus,
            videoId: editPayload?.video_id ?? null,
          }),
          video_id: editPayload?.video_id ?? null,
          account_id: editPayload?.account_id ?? account.id,
          biz_date: editPayload?.biz_date ?? meta.bizDate,
          video_url: normalizeOptionalText(meta.videoUrl),
          video_title: normalizeOptionalText(meta.videoTitle),
          content: normalizeOptionalText(meta.content),
          published_at: submitMeta.publishedAt,
          published_at_text: normalizeOptionalText(meta.publishedAtText),
          anomaly_status: meta.anomalyStatus,
          punish_type: submitMeta.punishType,
          platform_notice: submitMeta.platformNotice,
          appeal: submitMeta.appeal,
          topic_tag: meta.topicTag || null,
          video_form: meta.videoForm || null,
          topic_id: selectedTopicId || initialTopicId || null,
          script_author_user_id: meta.scriptAuthorUserId,
          video_editor_user_id: meta.videoEditorUserId,
          operator_user_id: meta.operatorUserId,
          manual_edit: hasManualEdit,
          content_keywords: meta.contentKeywords,
          assets: shouldReuseExistingScreenshots ? [] : buildSubmissionAssets(slots),
          script_text:
            parseMetric(fields.follower_convert.value) > 0
              ? scriptText.trim() || null
              : null,
          script_format: editPayload?.script_format ?? "oral",
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
        }),
      });

      const payload = (await response.json()) as SubmitResponse | Video;
      if (!response.ok) {
        if (!isVideo(payload) && payload.code === "SUBMISSION_APPEAL_REQUIRED") {
          setAppealRequired(true);
        }
        if (!isVideo(payload) && payload.code === "PUBLISH_TIME_CONFIRM_REQUIRED") {
          setIsMoreSettingsExpanded(true);
          scrollToIssueAnchor("meta");
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

  async function requestLateSubmission() {
    if (!account || isAppealSubmitting) return;
    const reason = window.prompt("请输入补交原因（最多 1000 字）", "超过 72 小时，需要补交数据")?.trim();
    if (!reason) return;
    setIsAppealSubmitting(true);
    try {
      const response = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, recordDate: meta.bizDate, reason }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "补交申请提交失败");
      setAppealRequired(false);
      feedbackToast.success("补交申请已提交，请等待管理人员审批");
    } catch (error) {
      feedbackToast.error((error as Error).message || "补交申请提交失败");
    } finally {
      setIsAppealSubmitting(false);
    }
  }

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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4 pb-2"
        >
          {/* 提交成功页面 - 禅意立卷与挑选明日选题闭环 */}
          <div className="py-8 text-center select-none space-y-4">
            <div className="flex justify-center -mt-2 -mb-2">
              <ZenFinishedIllustration size={96} />
            </div>
            <div className="space-y-1">
              <SectionHeading as="h3">
                今日创作已成功立卷
              </SectionHeading>
              <p className="text-[13px] text-[#78716C]">
                归属日期：<span className="tabular-nums font-normal text-[#141413]">{meta.bizDate}</span> · 记录已安全落库
              </p>
            </div>

            {/* 主行动：挑选明日选题闭环 */}
            <div className="pt-2 flex flex-col items-center gap-3">
              <Button
                type="button"
                size="l"
                onClick={(e) => {
                  e.stopPropagation();
                  setHasUserInteracted(true);
                  handleGoToTopics();
                }}
                className="w-full max-w-xs font-normal text-[13px] shadow-input cursor-pointer"
              >
                <Compass className="size-4" />
                <span>去选题库挑选明日选题</span>
              </Button>

              {/* 辅助操作 */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="m"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasUserInteracted(true);
                    setIsSubmitted(false);
                    setSubmittedReportId(null);
                    setQualityCheck({ data: null, loading: false });
                    onRequestEdit ? onRequestEdit() : onCancel?.();
                  }}
                  className="px-3 text-[12px] text-[#1F1E1D] cursor-pointer font-normal"
                >
                  <PencilLine className="mr-1 size-3.5 text-[#78716C]" />
                  查看并修改
                </Button>
                <Button
                  variant="secondary"
                  size="m"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasUserInteracted(true);
                    setIsSubmitted(false);
                    setSubmittedReportId(null);
                    setQualityCheck({ data: null, loading: false });
                    onCancel?.();
                  }}
                  className="px-3 text-[12px] text-[#1F1E1D] cursor-pointer"
                >
                  留在工作台
                </Button>
                <Button
                  variant="secondary"
                  size="m"
                  disabled={qualityCheck.loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasUserInteracted(true);
                    handleQualityCheck();
                  }}
                  className="px-3 text-[12px] text-[#1F1E1D] cursor-pointer"
                >
                  {qualityCheck.loading ? (
                    <>AI 分析中…</>
                  ) : (
                    <>
                      <Sparkles className="mr-1 size-3.5 text-[#D97757]" />
                      AI 检查样本质量
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {qualityCheck.data ? (
            <div className="rounded-xl border border-[#E2E2DF] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge
                  variant={
                    qualityCheck.data.overallStatus === "pass"
                      ? "success"
                      : qualityCheck.data.overallStatus === "warning"
                        ? "warning"
                        : "danger"
                  }
                >
                  {qualityCheck.data.overallStatus === "pass"
                    ? "通过"
                    : qualityCheck.data.overallStatus === "warning"
                      ? "警告"
                      : "未通过"}
                </Badge>
                <span className="text-[12px] text-[#78716C]">
                  检查于{" "}
                  {new Date(qualityCheck.data.checkedAt).toLocaleTimeString(
                    "zh-CN",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </span>
              </div>
              <div className="space-y-3">
                {qualityCheck.data.issues.map((issue, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {issue.severity === "critical" ? (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
                      ) : (
                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-status-success" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-normal text-[#1F1E1D]">
                          {issue.title}
                        </p>
                        <p className="text-[12px] text-[#78716C]">
                          {issue.detail}
                        </p>
                      </div>
                    </div>
                    {issue.suggestedFix ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={issue.suggestedFix === "manual_review"}
                        onClick={() => handleFixIssue(issue)}
                        className="h-8 shrink-0 rounded-xl border-[#E2E2DF] px-3 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                      >
                        {issue.suggestedFix === "edit_field"
                          ? "修改"
                          : issue.suggestedFix === "reupload_screenshot"
                            ? "重传"
                            : "需复核"}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </motion.div>
      ) : (
        <>
          {/* 删除确认弹窗 */}
          <Dialog
            open={deleteTargetRole !== null}
            onOpenChange={(open) => !open && setDeleteTargetRole(null)}
          >
            <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-0 shadow-claude-dialog">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>确认删除此截图</DialogTitle>
                <DialogDescription>
                  删除后需要重新上传并识别该槽位截图。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="px-6 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteTargetRole(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (!deleteTargetRole) return;
                    const targetSlot = slots[deleteTargetRole];
                    if (
                      targetSlot.previewUrl &&
                      targetSlot.previewUrl.startsWith("blob:")
                    ) {
                      URL.revokeObjectURL(targetSlot.previewUrl);
                      blobUrlsRef.current.delete(targetSlot.previewUrl);
                    }
                    updateSlotsState((current) => ({
                      ...current,
                      [deleteTargetRole]: {
                        ...createEditableSlots()[deleteTargetRole],
                      },
                    }));
                    setDeleteTargetRole(null);
                  }}
                >
                  确认删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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

                {/* 两栏布局：左侧截图 + 右侧数据；lg 起两栏各拆上下两半，中间留一行通栏发丝线 */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto] lg:gap-x-5 lg:gap-y-0 items-start">
                  {/* 左栏：截图上传 */}
                  <div className="flex min-w-0 flex-col gap-3 lg:contents">
                    <div ref={slotsSectionRef} className="lg:col-start-1 lg:row-start-1">
                      <截图槽位区
                        slots={slots}
                        onSelectFile={handleSlotUpload}
                        onUploadFiles={handleUnifiedUpload}
                        onDelete={(role) => setDeleteTargetRole(role)}
                        onRetry={handleSlotRetry}
                        onManualFill={(role) => {
                          updateSlotsState((current) => {
                            const hasUploadedScreenshot = Boolean(current[role].assetUrl);
                            return {
                              ...current,
                              [role]: {
                                ...current[role],
                                status: hasUploadedScreenshot ? "confirmed" : "empty",
                                confirmed: hasUploadedScreenshot,
                                requiresManualConfirmation: false,
                                error: null,
                                assetUrl: hasUploadedScreenshot ? current[role].assetUrl : null,
                                previewUrl: hasUploadedScreenshot ? current[role].previewUrl : null,
                                file: hasUploadedScreenshot ? current[role].file : null,
                                fileName: hasUploadedScreenshot ? current[role].fileName : undefined,
                                recognizedFields: null,
                                ocrSummary: undefined,
                                ocrFallback: hasUploadedScreenshot,
                              },
                            };
                          });
                          metricsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        screenshotsRequired={screenshotsRequired}
                        focusedRole={focusedRole}
                        highlightedOcrIndex={highlightedOcrIndex}
                        pulseEmptySlots={pulseSlots}
                      />
                    </div>

                    {/* 左栏下半：设置组。lg 起与右栏「标题文案」同处第三行，共用一条通栏发丝线 */}
                    <div className="flex min-w-0 flex-col gap-3 lg:gap-6 lg:col-start-1 lg:row-start-3">
                    {/* 共创伙伴 - 底纸纯排版解套，单条发丝线自然分界（lg 起交给通栏线） */}
                    <div className="space-y-2 pt-2.5 border-t border-[#E2E2DF]/60 lg:border-t-0 lg:flex-1">
                      <div className="flex items-center justify-between">
                        <ItemHeading as="h3" className="flex items-center gap-1">
                          <span>共创伙伴</span>
                        </ItemHeading>
                        {hiddenRoleRestoreLabel && (
                          <button
                            type="button"
                            onClick={showAllRoles}
                            className="text-[12px] font-normal text-[#D97757] hover:underline"
                          >
                            {hiddenRoleRestoreLabel}
                          </button>
                        )}
                      </div>

                      {!hasAnyVisibleRole ? (
                        <div className="text-[12px] text-[#78716C]">
                          独立创作完成 · 文案 / 剪辑 / 运营
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {isScriptAuthorVisible && (
                            <RoleItemRow
                              label="文案"
                              icon={<FileText className="size-3.5 text-[#78716C]" />}
                              display={resolveRoleDisplay(meta.scriptAuthorUserId)}
                              onOpenSelector={() => {
                                loadOperatorMembers();
                                setSelectingRole({
                                   role: "script_author",
                                   label: "文案",
                                   selectedUserId: meta.scriptAuthorUserId,
                                 })
                              }}
                              onResetSelf={() => hideRole("script_author")}
                            />
                          )}
                          {isVideoEditorVisible && (
                            <RoleItemRow
                              label="剪辑"
                              icon={<Scissors className="size-3.5 text-[#78716C]" />}
                              display={resolveRoleDisplay(meta.videoEditorUserId)}
                              onOpenSelector={() => {
                                loadOperatorMembers();
                                setSelectingRole({
                                   role: "video_editor",
                                   label: "剪辑",
                                   selectedUserId: meta.videoEditorUserId,
                                 })
                              }}
                              onResetSelf={() => hideRole("video_editor")}
                            />
                          )}
                          {isOperatorVisible && (
                            <RoleItemRow
                              label="运营"
                              icon={<Rocket className="size-3.5 text-[#78716C]" />}
                              display={resolveRoleDisplay(meta.operatorUserId)}
                              onOpenSelector={() => {
                                loadOperatorMembers();
                                setSelectingRole({
                                   role: "operator",
                                   label: "运营",
                                   selectedUserId: meta.operatorUserId,
                                 })
                              }}
                              onResetSelf={() => hideRole("operator")}
                            />
                          )}
                        </div>
                      )}

                      {/* 题材与形式：标准分段微滑块 */}
                      <div className="space-y-2 border-t border-[#E2E2DF]/60 pt-2.5" ref={topicTagSectionRef}>
                        {/* 题材标签 */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-normal text-[#1F1E1D]">
                            题材标签
                          </span>
                          <div className="flex items-center p-0.5 rounded-xl bg-[#F1F1F0] sm:h-7">
                            {(["干货", "复盘"] as const).map((tag) => {
                              const isSelected = meta.topicTag === tag;
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => updateMeta("topicTag", isSelected ? "" : tag)}
                                  className={cn(
                                    "inline-flex items-center justify-center h-7 sm:h-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 rounded-md text-[12px] sm:text-[13px] font-normal transition-all cursor-pointer",
                                    isSelected
                                      ? "bg-white text-[#141413] shadow-input font-normal"
                                      : "text-[#78716C] hover:text-[#141413]"
                                  )}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 视频形式 */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-normal text-[#1F1E1D]">
                            视频形式
                          </span>
                          <div className="flex items-center p-0.5 rounded-xl bg-[#F1F1F0] sm:h-7">
                            {(["出镜", "图文"] as const).map((form) => {
                              const isSelected = meta.videoForm === form;
                              return (
                                <button
                                  key={form}
                                  type="button"
                                  onClick={() => updateMeta("videoForm", form)}
                                  className={cn(
                                    "inline-flex items-center justify-center h-7 sm:h-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-3 rounded-md text-[12px] sm:text-[13px] font-normal transition-all cursor-pointer",
                                    isSelected
                                      ? "bg-white text-[#141413] shadow-input font-normal"
                                      : "text-[#78716C] hover:text-[#141413]"
                                  )}
                                >
                                  {form}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* 异常状态补充 */}
                      {meta.anomalyStatus === "abnormal" && (
                        <div className="pt-2 space-y-2 border-t border-[#E2E2DF]/60">
                          {/* 计入月度产量定心丸提示 */}
                          <div className="rounded-xl bg-[#F1F1F0] p-2.5 text-[12px] leading-relaxed text-[#78716C] shadow-card-ring">
                            <span className="font-normal text-[#141413]">💡 计入月度产量：</span>限流与删稿依然算作今日创作成果，请如实录入已产生的数据或平台处罚通知。
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="platform_notice">
                              平台通知 (选填)
                            </Label>
                            <Input
                              id="platform_notice"
                              value={meta.platformNotice || ""}
                              onChange={(e) => updateMeta("platformNotice", e.target.value)}
                              placeholder="如处罚通知文案"
                              className="h-8 rounded-md bg-white border-[#E2E2DF] text-[12px] text-[#1F1E1D] shadow-input focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="appeal">
                              申诉进展 (选填)
                            </Label>
                            <Input
                              id="appeal"
                              value={meta.appeal || ""}
                              onChange={(e) => updateMeta("appeal", e.target.value)}
                              placeholder="如申诉处理中"
                              className="h-8 rounded-md bg-white border-[#E2E2DF] text-[12px] text-[#1F1E1D] shadow-input focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
                            />
                          </div>
                        </div>
                      )}

                      {/* 更多设置 */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setIsMoreSettingsExpanded(!isMoreSettingsExpanded)}
                          className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 text-[12px] font-normal text-[#78716C] hover:text-[#1F1E1D] cursor-pointer"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              isMoreSettingsExpanded && "rotate-180"
                            )}
                          />
                          {isMoreSettingsExpanded ? "收起" : "更多设置"}
                        </button>

                        <AnimatePresence initial={false}>
                          {isMoreSettingsExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-2 pt-2"
                            >
                              <div className="space-y-1">
                                <Label>
                                  发布时间（以完播截图识别为准）
                                </Label>
                                <PublishedAtPicker
                                  value={meta.publishedAt}
                                  onChange={updatePublishedAt}
                                  disabled
                                />
                                <p className="text-[11px] leading-relaxed text-[#78716C]">
                                  所有提交均以完播截图识别的发布时间为准，不能手动修改。
                                </p>
                              </div>
                              <div className="flex justify-between text-[12px] text-[#78716C]">
                                <span>上传时间戳</span>
                                <span className="tabular-nums">{meta.uploadedAt || "—"}</span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    </div>
                  </div>

                  {/* 右栏：核心数据 + 标题文案 */}
                  <div className="flex min-w-0 flex-col gap-6 lg:contents">
                    {/* 核心数据指标 - 内部保持紧凑，头尾适度留白舒展以对齐左栏 */}
                    <div ref={metricsSectionRef} className="space-y-4 pt-1 pb-1.5 lg:pb-2.5 lg:col-start-2 lg:row-start-1">
                      {issueSummary.unconfirmedSlots.length > 0 && (
                        <div className="mb-2 flex items-center gap-2 rounded-xl bg-status-warning/[0.08] px-3 py-2 text-[12px] text-status-warning" role="status">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          {issueSummary.unconfirmedSlots.length} 张截图识别未确认，请对照原图核对指标后提交
                        </div>
                      )}
                      <指标分组区
                        ref={metricsGroupRef}
                        fields={fields}
                        onFieldChange={updateField}
                        onRestoreOcrValue={restoreOcrValue}
                        onFocusField={handleFieldFocus}
                        onBlurField={handleFieldBlur}
                        anomalyStatus={meta.anomalyStatus}
                        onCompleteMetrics={() => document.getElementById("video_title")?.focus()}
                      />
                      <div ref={scriptCaptureRef}>
                        <导粉话术采集区
                          visible={parseMetric(fields.follower_convert.value) > 0}
                          value={scriptText}
                          onChange={updateScriptText}
                          hasAttemptedSubmit={hasAttemptedSubmit}
                        />
                      </div>
                    </div>

                    {/* 右栏下半：内容组（视频标题 + 文案）。lg 起与左栏设置组同处第三行，共用一条通栏发丝线 */}
                    <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-3">
                    {/* 视频标题 - 纯排版平铺，与文案和指标网格严格左对齐；lg 起分隔线交给通栏线 */}
                    <div
                      ref={metaSectionRef}
                      className="space-y-1 pt-3 border-t border-[#E2E2DF]/60 lg:border-t-0 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="video_title" className="flex items-center gap-1">
                          <span>视频标题</span>
                          {meta.anomalyStatus !== "abnormal" && (
                            <span className="text-status-danger">*</span>
                          )}
                          {hasAttemptedSubmit &&
                            !hasSlotIssues &&
                            meta.anomalyStatus !== "abnormal" &&
                            issueSummary.missingRequiredMeta.includes("videoTitle") && (
                              <span className="text-[12px] font-normal text-status-danger">请填写标题</span>
                            )}
                        </Label>
                        <TopicSelectDropdown
                          selectedTopicId={selectedTopicId}
                          selectedTopicTitle={selectedTopicTitle}
                          onSelectTopic={handleSelectTopic}
                        />
                      </div>
                      <Input
                        id="video_title"
                        ref={metaVideoTitleRef}
                        value={meta.videoTitle}
                        onChange={(event) => updateMeta("videoTitle", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            contentTextareaRef.current?.focus();
                          }
                        }}
                        placeholder="输入视频标题"
                        className={cn(
                          "h-9 min-h-0 rounded-md bg-white text-[#1F1E1D] text-[13px] font-sans shadow-input transition-colors focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:border-[#78716C]",
                          hasAttemptedSubmit &&
                            !hasSlotIssues &&
                            meta.anomalyStatus !== "abnormal" &&
                            issueSummary.missingRequiredMeta.includes("videoTitle")
                            ? "border border-status-danger/40 ring-1 ring-status-danger/10 bg-white"
                            : "border border-[#E2E2DF]"
                        )}
                      />
                    </div>

                    {/* 视频文案 - 与视频标题同属内容组，不再单独加分隔线（底纸纯排版解套，消灭纸内卡片套娃） */}
                    <div
                      className="flex flex-col min-h-0 bg-white transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="content" className="flex items-center gap-1">
                          <span>文案</span>
                          <span className="text-status-danger">*</span>
                          {hasAttemptedSubmit &&
                            !hasSlotIssues &&
                            issueSummary.missingRequiredMeta.includes("content") && (
                              <span className="text-[12px] font-normal text-status-danger">请填写文案</span>
                            )}
                        </Label>
                        <button
                          type="button"
                          onClick={handlePasteContent}
                          className={cn(
                            "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center sm:justify-start gap-1 text-[12px] font-normal transition-colors cursor-pointer py-1 px-2 sm:p-0",
                            isPastedFeedback
                              ? "text-status-success"
                              : "text-[#78716C] hover:text-[#1F1E1D]"
                          )}
                        >
                          {isPastedFeedback ? (
                            <>
                              <Check size={13} className="stroke-[2.5]" />
                              已粘贴
                            </>
                          ) : (
                            <>
                              <ClipboardPaste size={13} />
                              一键粘贴
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        ref={contentTextareaRef}
                        id="content"
                        value={meta.content}
                        onChange={(event) => updateMeta("content", event.target.value)}
                        placeholder="粘贴视频文案..."
                        className={cn(
                          "min-h-[140px] w-full resize-none rounded-md p-3 bg-white border shadow-input text-[13px] leading-relaxed text-[#1F1E1D] placeholder:text-[#78716C]/60 outline-none transition-colors lg:min-h-[120px]",
                          hasAttemptedSubmit &&
                            !hasSlotIssues &&
                            issueSummary.missingRequiredMeta.includes("content")
                            ? "border-status-danger/40 ring-1 ring-status-danger/10 bg-white"
                            : "border-[#E2E2DF]/60 focus:border-[#78716C] focus:ring-1 focus:ring-[#141413]/10"
                        )}
                      />
                    </div>
                    </div>
                  </div>

                  {/* 通栏发丝线：lg 起切分「上传 + 数据指标」与「设置 + 标题文案」两个语义组 */}
                  <div
                    aria-hidden="true"
                    className="hidden lg:block lg:col-span-2 lg:row-start-2 lg:mt-5 h-px bg-[#E2E2DF]/60"
                  />
                </div>
              </div>

              {/* 岗位成员选择弹窗 */}
              <Dialog
                open={Boolean(selectingRole)}
                onOpenChange={(open) => {
                  if (!open) {
                    setSelectingRole(null);
                    setMemberSearchQuery("");
                  }
                }}
              >
                <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl bg-white border border-[#E2E2DF] p-3.5 sm:p-4 shadow-claude-dialog">
                  <DialogHeader className="pb-2 border-b border-[#E2E2DF]/60">
                    <DialogTitle>选择{selectingRole?.label}负责人</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-2 pt-2.5">
                    {/* 搜索框 */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                      <Input
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder="搜索团队成员..."
                        className="h-8 rounded-md border-[#E2E2DF] bg-white pl-8 text-[12px] text-[#1F1E1D] placeholder:text-[#A8A29E] focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:border-[#78716C]"
                      />
                    </div>

                    {/* 成员列表 (扩大视口至 320px~340px，搭配发丝细滚条) */}
                    <div className="max-h-[300px] sm:max-h-[340px] overflow-y-auto space-y-0.5 pr-1 scrollbar-thin [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#E2E2DF] [&::-webkit-scrollbar-track]:bg-transparent [scrollbar-width:thin] [scrollbar-color:#E2E2DF_transparent]">
                      {/* 本人快捷置顶项 */}
                      {!memberSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectingRole) return;
                            if (selectingRole.role === "script_author") {
                              setScriptAuthorUser(userId, { isManual: true });
                              hideRole("script_author");
                            } else if (selectingRole.role === "video_editor") {
                              setRoleUser("video_editor", userId, { isManual: true });
                              hideRole("video_editor");
                            } else if (selectingRole.role === "operator") {
                              setOperatorUser(userId, { isManual: true });
                              hideRole("operator");
                            }
                            setSelectingRole(null);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between rounded-md px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-[12px] sm:text-[13px] transition-colors border cursor-pointer",
                            selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId
                              ? "bg-[#F1F1F0] text-[#141413] font-normal border-[#E2E2DF]/60 shadow-input"
                              : "border-transparent text-[#1F1E1D] hover:bg-white hover:border-[#E2E2DF]"
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <span>{selfLabel}</span>
                            <span className="rounded-md bg-[#E2E2DF] px-1 py-0.5 text-[12px] text-[#78716C] font-normal">
                              本人
                            </span>
                          </div>
                          {(selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId) && (
                            <Check className="size-3.5 stroke-[2.5] text-[#D97757]" />
                          )}
                        </button>
                      )}

                      {/* 过滤成员列表 */}
                      {filteredModalMembers
                        .filter((m) => m.id !== userId)
                        .map((member) => {
                          const isSelected = selectingRole?.selectedUserId === member.id;
                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => {
                                if (!selectingRole) return;
                                if (selectingRole.role === "script_author") {
                                  setScriptAuthorUser(member.id, { isManual: true });
                                } else if (selectingRole.role === "video_editor") {
                                  setRoleUser("video_editor", member.id, { isManual: true });
                                } else if (selectingRole.role === "operator") {
                                  setOperatorUser(member.id, { isManual: true });
                                }
                                setSelectingRole(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between rounded-md px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-[12px] sm:text-[13px] transition-colors border cursor-pointer",
                                isSelected
                                  ? "bg-[#F1F1F0] text-[#141413] font-normal border-[#E2E2DF]/60 shadow-input"
                                  : "border-transparent text-[#1F1E1D] hover:bg-white hover:border-[#E2E2DF]"
                              )}
                            >
                              <span>{member.display_name || member.name}</span>
                              {isSelected && <Check className="size-3.5 stroke-[2.5] text-[#D97757]" />}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* 底部提交按钮：移动端吸底（避让底部导航 --app-bottom-offset） */}
              <div className="sticky bottom-[var(--app-bottom-offset,0px)] z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-t border-[#E2E2DF] bg-[#FCFCFB]/95 px-3 py-3 backdrop-blur-md md:static md:z-auto md:border-t md:border-[#E2E2DF]/60 md:bg-transparent md:p-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  {!canActuallySubmit ? (
                    hasAttemptedSubmit ? (
                      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-sans text-[12px] text-[#78716C]">
                        <div className="inline-flex items-center gap-1 shrink-0 font-normal text-[#1F1E1D]">
                          <span className="size-1.5 shrink-0 rounded-full bg-[#A8A29E]/80" aria-hidden="true" />
                          <span>待补全：</span>
                        </div>
                        <div
                          className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 [&>button:not(:last-child)]:after:content-['·'] [&>button:not(:last-child)]:after:ml-1.5 [&>button:not(:last-child)]:after:text-[#E2E2DF] [&>button:not(:last-child)]:after:inline-block"
                          aria-label="提交缺项"
                        >
                          {issueSummary.processingRequiredSlots.length > 0 && (
                            <button
                              type="button"
                              onClick={() => scrollToIssueAnchor("slots")}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              {issueSummary.processingRequiredSlots.map((role) => SLOT_LABELS[role] || "截图").join("、")}识别中
                            </button>
                          )}
                          {issueSummary.missingRequiredSlots.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                scrollToIssueAnchor("slots");
                                triggerSlotsPulse();
                              }}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              缺少{issueSummary.missingRequiredSlots.map((role) => SLOT_LABELS[role] || "截图").join("、")}
                            </button>
                          )}
                          {issueSummary.failedRequiredSlots.length > 0 && (
                            <button
                              type="button"
                              onClick={() => scrollToIssueAnchor("slots")}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              {issueSummary.failedRequiredSlots.map((role) => SLOT_LABELS[role] || "截图").join("、")}需核对
                            </button>
                          )}
                          {issueSummary.missingRequiredMetrics.length > 0 && (
                            <button
                              type="button"
                              onClick={() => scrollToIssueAnchor("metrics")}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              缺少 {issueSummary.missingRequiredMetrics.length} 项必填指标
                            </button>
                          )}
                          {issueSummary.missingRequiredMeta.includes("videoTitle") && (
                            <button
                              type="button"
                              onClick={() => scrollToIssueAnchor("meta")}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              缺少视频标题
                            </button>
                          )}
                          {issueSummary.missingRequiredMeta.includes("content") && (
                            <button
                              type="button"
                              onClick={() => scrollToIssueAnchor("meta")}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              缺少视频文案
                            </button>
                          )}
                          {issueSummary.topicTagMissing && (
                            <button
                              type="button"
                              onClick={() => scrollToIssueAnchor("topicTag")}
                              className="hover:text-[#D97757] hover:underline transition-colors cursor-pointer"
                            >
                              缺少选题标签
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null
                  ) : (
                    <div className="text-[12px] text-[#78716C] flex items-center gap-1 font-sans">
                      <span className="h-1.5 w-1.5 rounded-full bg-current text-status-success" />
                      <span className="text-[#1F1E1D] font-normal">信息已齐备，可提交</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[12px] text-[#78716C]/80 font-sans">
                    {!isSubmitted && lastSavedAt ? (
                      <>
                        <span className="tabular-nums">
                          已自动保存 {lastSavedAt.getHours().toString().padStart(2, "0")}:{lastSavedAt.getMinutes().toString().padStart(2, "0")}
                        </span>
                        <span> · </span>
                      </>
                    ) : null}
                    <span>⌘/Ctrl+Enter 提交</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {appealRequired && !isSubmitted && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="l"
                      onClick={requestLateSubmission}
                      disabled={isAppealSubmitting}
                      className="flex-1 sm:flex-initial px-4 text-[13px] font-normal"
                    >
                      {isAppealSubmitting ? "申请中..." : "申请补交"}
                    </Button>
                  )}
                  {isBackfillMode || submittedViewActive ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="l"
                      onClick={onCancel}
                      className="flex-1 sm:flex-initial px-4 text-[13px] font-normal"
                    >
                      取消
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant={canActuallySubmit && !isSubmitting ? "default" : "secondary"}
                    size="l"
                    onClick={triggerSubmit}
                    disabled={isSubmitting}
                    aria-disabled={!canActuallySubmit || undefined}
                    className={cn(
                      "flex-1 sm:flex-initial px-6 text-[14px] select-none cursor-pointer",
                      canActuallySubmit && !isSubmitting
                        ? ""
                        : "bg-[#F1F1F0] text-[#78716C]/60 shadow-none hover:bg-[#F1F1F0] disabled:cursor-not-allowed disabled:opacity-100",
                    )}
                  >
                    <span>{submitButtonLabel}</span>
                  </Button>
                </div>
              </div>
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

// 视频状态分段控件
const VIDEO_STATUS_OPTIONS: Array<{
  value: AnomalyStatus;
  label: string;
  tip?: string;
}> = [
  {
    value: "normal",
    label: "正常发布",
  },
  {
    value: "abnormal",
    label: "作品异常",
    tip: "如：账号限流、平台违规删稿等；依然计入当月产量与工作量，请如实录入已产生的数据与平台通知。",
  },
];

function VideoStatusSegmented({
  value,
  onChange,
}: {
  value: AnomalyStatus;
  onChange: (next: AnomalyStatus) => void;
}) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = VIDEO_STATUS_OPTIONS.findIndex(
      (option) => option.value === value,
    );
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % VIDEO_STATUS_OPTIONS.length
        : (currentIndex - 1 + VIDEO_STATUS_OPTIONS.length) %
          VIDEO_STATUS_OPTIONS.length;
    onChange(VIDEO_STATUS_OPTIONS[nextIndex].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label="视频状态"
      onKeyDown={handleKeyDown}
      className="inline-flex h-7 items-center rounded-md bg-[#F1F1F0] p-0.5"
    >
      {VIDEO_STATUS_OPTIONS.map((option) => {
        const isActive = value === option.value;
        const buttonEl = (
          <button
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            title={option.tip}
            className={cn(
              "inline-flex h-full items-center justify-center rounded-md px-2.5 text-[13px] transition-all cursor-pointer",
              isActive
                ? "bg-white text-[#1F1E1D] shadow-input font-normal"
                : "text-[#78716C] hover:text-[#1F1E1D] font-normal"
            )}
          >
            <span>{option.label}</span>
          </button>
        );

        if (!option.tip) {
          return <span key={option.value}>{buttonEl}</span>;
        }

        return (
          <TooltipProvider key={option.value} delay={150}>
            <Tooltip>
              <TooltipTrigger render={buttonEl} />
              <TooltipContent
                side="top"
                sideOffset={6}
                className="max-w-xs text-[12px] leading-relaxed bg-[#141413] text-white p-2.5 rounded-xl shadow-claude-float border border-[#1F1E1D]"
              >
                {option.tip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// 岗位选择行组件
interface RoleItemRowProps {
  label: string;
  icon?: React.ReactNode;
  display: AssigneeDisplay;
  onOpenSelector: () => void;
  onResetSelf: () => void;
}

function RoleItemRow({
  label,
  icon,
  display,
  onOpenSelector,
  onResetSelf,
}: RoleItemRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* 左侧岗位 */}
      <div className="flex items-center gap-1 text-[12px] font-normal text-[#1F1E1D]">
        {icon}
        <span>{label}</span>
      </div>

      {/* 右侧人员选择 - 一体化内嵌设计 */}
      <div
        className={cn(
          "group flex h-6 items-center rounded-md transition-all",
          display.external
            ? "bg-status-warning/[0.08] text-status-warning hover:bg-status-warning/[0.12] font-normal"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
        )}
      >
        <button
          type="button"
          onClick={onOpenSelector}
          className={cn(
            "flex h-full items-center gap-1 px-2 text-[12px] font-normal transition-colors cursor-pointer",
            display.historical ? "text-[#78716C]" : display.external ? "text-status-warning" : "text-[#78716C] group-hover:text-[#141413]"
          )}
        >
          <span>{display.text}</span>
          {!display.external && <ChevronDown className="size-3 text-[#A8A29E] transition-colors group-hover:text-[#78716C]" />}
        </button>

        {display.external && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetSelf();
            }}
            title="恢复由我完成"
            className="flex h-full items-center pr-1.5 pl-0.5 text-status-warning/70 hover:text-status-warning transition-colors cursor-pointer"
          >
            <X className="size-3 stroke-[2]" />
          </button>
        )}
      </div>
    </div>
  );
}

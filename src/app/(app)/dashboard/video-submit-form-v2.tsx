"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  Loader2,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { shakeVariants } from "@/lib/animations";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ZenFinishedIllustration } from "@/components/editorial/editorial-illustrations";

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
import type { AnomalyStatus, Video, VideoTagReviewDimension } from "@/types";

import { 指标分组区 } from "@/components/submission/指标分组区";
import { 导粉话术采集区 } from "@/components/submission/导粉话术采集区";
import { 截图槽位区 } from "@/components/submission/截图槽位区";
import { PublishedAtPicker, fetchCachedOperatorMembers } from "./history-report-edit-form";
import {
  WorkbenchNoticeBar,
  WorkbenchNoticeCapsule,
  buildExemptionReviewNoticeItem,
  type WorkbenchNoticeItem,
} from "./components/workbench-notice-bar";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";

// 保留所有原有的业务逻辑导入
import {
  areSubmissionScreenshotsRequired,
  canSubmit,
  createInitialSubmissionState,
  summarizeSubmissionIssues,
  type EditableMetricKey,
  type SubmissionFieldState,
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
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import {
  buildVideoSubmitDraftKey,
  resolveVideoSubmitCreateDraftStorageKey,
  type VideoSubmitDraftMode,
} from "@/lib/video-submit-draft-key";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import {
  addRoleOverride as addSubmissionRoleOverride,
  buildVideoSubmissionEditRefill,
  getVideoSubmissionEditDetailError,
  normalizeOptionalText,
  removeRoleOverride as removeSubmissionRoleOverride,
  findNextScreenshotUploadRole,
  getHiddenRoleRestoreLabel,
  getDefaultPublishedAtForBizDate,
  resolveAssigneeDisplay,
  resolveVideoSubmitMetaFields,
  resolveVideoSubmitMode,
  type ScreenshotUploadSlotRole,
  preserveBizDateWhenPublishedAtChanges,
  setOperatorToSelf as resolveSelfOperatorUserId,
  setOperatorUser as resolveSelectedOperatorUserId,
  shouldAutoRedirectToGrowthAfterSubmit,
  type AssigneeDisplay,
  type HistoricalAssigneeProfile,
  type SubmissionAssigneeRole,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";

import type {
  SubmitPanelMode,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "./video-submit-panel-state";

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
  ai_tags?: Array<{
    tag_dimension: VideoTagReviewDimension;
    tag_value: string;
    confidence: number | null;
    reason: string | null;
  }>;
  error?: string;
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

type OcrData = NonNullable<OcrApiPayload["data"]>;

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

type FormMetaState = {
  videoUrl: string;
  videoTitle: string;
  content: string;
  bizDate: string;
  publishedAt: string;
  publishedAtText: string;
  anomalyStatus: AnomalyStatus;
  uploadedAt: string;
  topicTag: string;
  videoForm: string;
  contentKeywords: string[];
  punishType?: string;
  platformNotice?: string;
  appeal?: string;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
  roleOverrides: SubmissionAssigneeRole[];
};

type SlotViewState = SubmissionState["slots"][SubmissionSlotRole] & {
  fileName?: string;
  error?: string | null;
  assetUrl?: string | null;
  previewUrl?: string | null;
  file?: File | null;
  screenshotType?: "data" | "curve" | "retention" | null;
  recognizedFields?: Record<string, unknown> | null;
  ocrSummary?: string[];
  ocrFallback?: boolean;
};

const OVERVIEW_FIELDS: EditableMetricKey[] = [
  "play_count",
  "follower_gain",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_convert",
];

const SLOT_LABELS: Record<SubmissionSlotRole, string> = {
  screenshot_1: "互动截图",
  screenshot_2: "完播截图",
};

const VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER: ScreenshotUploadSlotRole[] = [
  "screenshot_1",
  "screenshot_2",
];

// 保留所有辅助函数
function createInitialMeta(today: string, userId: string, bizDate = today): FormMetaState {
  const normalizedBizDate = /^\d{4}-\d{2}-\d{2}$/.test(bizDate) ? bizDate : today;
  const publishedAt = getDefaultPublishedAtForBizDate(normalizedBizDate, today);

  return {
    videoUrl: "",
    videoTitle: "",
    content: "",
    bizDate: normalizedBizDate,
    publishedAt,
    publishedAtText: "",
    anomalyStatus: "normal",
    uploadedAt: "",
    topicTag: "复盘",
    videoForm: "出镜",
    contentKeywords: [],
    platformNotice: "",
    appeal: "",
    scriptAuthorUserId: userId,
    videoEditorUserId: userId,
    operatorUserId: userId,
    roleOverrides: [],
  };
}

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

function createFieldState(value = ""): SubmissionFieldState {
  return {
    key: "play_count",
    value,
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceScore: null,
  };
}

function buildOcrSummary(
  screenshotType: "data" | "curve" | "retention" | null | undefined,
  recognizedFields: Record<string, unknown> | null | undefined,
): string[] {
  if (!recognizedFields) {
    return [];
  }

  // 曲线形态识别已下线：历史 curve 槽位不再展示分析结果
  if (screenshotType === "curve") {
    return [];
  }

  if (screenshotType === "retention") {
    const retentionMetrics = recognizedFields.retention_metrics as
      Record<string, number | null> | undefined;

    return [
      retentionMetrics?.avg_play_duration != null
        ? `均播时长：${retentionMetrics.avg_play_duration}秒`
        : null,
      retentionMetrics?.bounce_rate_2s != null
        ? `2秒跳出率：${retentionMetrics.bounce_rate_2s}%`
        : null,
      retentionMetrics?.completion_rate_5s != null
        ? `5秒完播率：${retentionMetrics.completion_rate_5s}%`
        : null,
      retentionMetrics?.completion_rate != null
        ? `整体完播率：${retentionMetrics.completion_rate}%`
        : null,
    ].filter((item): item is string => Boolean(item));
  }

  const baseSummary = Object.entries(recognizedFields)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        key !== "curve_info" &&
        key !== "retention_info",
    )
    .slice(0, 4)
    .map(([key, value]) => `${key}：${String(value)}`);

  return baseSummary;
}

function createEditableFields(): SubmissionState["fields"] {
  return {
    play_count: { ...createFieldState(), key: "play_count" },
    follower_gain: { ...createFieldState(), key: "follower_gain" },
    follower_convert: { ...createFieldState(), key: "follower_convert" },
    likes: { ...createFieldState(), key: "likes" },
    comments: { ...createFieldState(), key: "comments" },
    shares: { ...createFieldState(), key: "shares" },
    favorites: { ...createFieldState(), key: "favorites" },
    avg_play_duration: { ...createFieldState(), key: "avg_play_duration" },
    bounce_rate_2s: { ...createFieldState(), key: "bounce_rate_2s" },
    completion_rate_5s: { ...createFieldState(), key: "completion_rate_5s" },
    completion_rate: { ...createFieldState(), key: "completion_rate" },
  };
}

function createEditableSlots(): Record<SubmissionSlotRole, SlotViewState> {
  const initial = createInitialSubmissionState().slots;
  return {
    screenshot_1: { ...initial.screenshot_1 },
    screenshot_2: { ...initial.screenshot_2 },
  };
}

function createMetaFromEditDetail(
  detail: VideoSubmissionEditDetail,
  today: string,
  userId: string,
): FormMetaState {
  const refill = buildVideoSubmissionEditRefill(detail);
  const meta = refill.meta;
  const roleOverrides = ([
    ["script_author", meta.scriptAuthorUserId],
    ["video_editor", meta.videoEditorUserId],
    ["operator", meta.operatorUserId],
  ] as const).flatMap(([role, assignee]) =>
    assignee && assignee !== userId ? [role] : [],
  );

  return {
    ...createInitialMeta(today, userId),
    videoUrl: meta.videoUrl ?? "",
    videoTitle: meta.videoTitle ?? "",
    content: meta.content,
    bizDate: refill.bizDate,
    publishedAt: meta.publishedAt ?? "",
    publishedAtText: meta.publishedAtText ?? "",
    anomalyStatus: meta.anomalyStatus,
    uploadedAt: refill.uploadedAt ?? "",
    topicTag: meta.topicTag ?? "",
    videoForm: meta.videoForm ?? "",
    contentKeywords: [...meta.contentKeywords],
    punishType: meta.punishType ?? "",
    platformNotice: meta.platformNotice ?? "",
    appeal: meta.appeal ?? "",
    scriptAuthorUserId: meta.scriptAuthorUserId,
    videoEditorUserId: meta.videoEditorUserId,
    operatorUserId: meta.operatorUserId,
    roleOverrides,
  };
}

function createEditableFieldsFromEditDetail(
  detail: VideoSubmissionEditDetail,
): SubmissionState["fields"] {
  const refill = buildVideoSubmissionEditRefill(detail);
  const fields = createEditableFields();
  for (const [key, value] of Object.entries(refill.metrics) as Array<[EditableMetricKey, string]>) {
    fields[key] = {
      ...fields[key],
      value,
      source: "manual",
      confirmed: true,
      requiresManualConfirmation: false,
    };
  }
  return fields;
}

function createEditableSlotsFromEditDetail(
  detail: VideoSubmissionEditDetail,
): Record<SubmissionSlotRole, SlotViewState> {
  const refill = buildVideoSubmissionEditRefill(detail);
  const slots = createEditableSlots();
  for (const role of VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER) {
    const asset = refill.assets[role];
    if (!asset) continue;
    slots[role] = {
      ...slots[role],
      status: asset.confirmed ? "confirmed" : "pending_confirm",
      confirmed: asset.confirmed,
      confidenceScore: asset.confidenceScore,
      assetUrl: asset.url,
      previewUrl: asset.url,
      file: null,
      fileName: "已保存截图",
      screenshotType: asset.screenshotType,
      recognizedFields: asset.recognizedFields,
      ocrSummary: buildOcrSummary(asset.screenshotType, asset.recognizedFields),
      ocrFallback: !asset.confirmed,
    };
  }
  return slots;
}

function mapConfidenceToScore(value?: "high" | "medium" | "low") {
  if (value === "high") return 1;
  if (value === "medium") return 0.5;
  return 0;
}

function buildSubmissionState(
  slots: Record<SubmissionSlotRole, SlotViewState>,
  fields: SubmissionState["fields"],
  submitted: boolean,
): SubmissionState {
  return { slots, fields, submitted };
}

function buildAssets(slots: Record<SubmissionSlotRole, SlotViewState>) {
  return (Object.keys(slots) as SubmissionSlotRole[])
    .map((role) => slots[role])
    .filter((slot) => slot.assetUrl && /^https?:\/\//.test(slot.assetUrl))
    .map((slot) => ({
      role: slot.role,
      url: slot.assetUrl!,
      confirmed: slot.confirmed,
      confidence_score: slot.confidenceScore,
      recognized_fields: slot.recognizedFields ?? null,
      screenshot_type: slot.screenshotType ?? null,
    }));
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

function buildIssueMessages(
  summary: ReturnType<typeof summarizeSubmissionIssues>,
) {
  const messages: string[] = [];

  if (summary.missingRequiredSlots.length > 0) {
    messages.push(
      `必传截图缺失：${summary.missingRequiredSlots.map((role) => SLOT_LABELS[role]).join("、")}`,
    );
  }

  if (summary.failedRequiredSlots.length > 0) {
    messages.push(
      `识别失败：${summary.failedRequiredSlots.map((role) => SLOT_LABELS[role]).join("、")}`,
    );
  }

  if (summary.pendingSlotConfirmations.length > 0) {
    messages.push(
      `待确认截图：${summary.pendingSlotConfirmations.map((role) => SLOT_LABELS[role]).join("、")}`,
    );
  }

  if (summary.topicTagMissing) {
    messages.push("必填项未完成：话题标签");
  }

  if (summary.missingRequiredMeta.includes("videoTitle")) {
    messages.push("必填项未完成：视频标题");
  }
  if (summary.missingRequiredMeta.includes("content")) {
    messages.push("必填项未完成：文案");
  }
  return messages;
}

function buildIssueHintText(messages: string[]) {
  if (messages.length === 0) {
    return null;
  }

  if (messages.length === 1) {
    return messages[0];
  }

  return `${messages[0]}；另外还有 ${messages.length - 1} 处问题`;
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

  // 保留所有原有状态管理
  const [meta, setMeta] = useState<FormMetaState>(() => {
    const initial =
      editDetail
        ? createMetaFromEditDetail(editDetail, today, userId)
        : createInitialMeta(today, userId, initialBizDate ?? today);
    // 上传时间戳默认取挂载时刻，与提交时的"已上传"语义一致
    return initial.uploadedAt
      ? initial
      : { ...initial, uploadedAt: new Date().toLocaleString("zh-CN") };
  });
  const [fields, setFields] = useState<SubmissionState["fields"]>(() =>
    editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
  );
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, SlotViewState>>(
    () => (editDetail ? createEditableSlotsFromEditDetail(editDetail) : createEditableSlots()),
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
    [],
  );

  // 继续保留所有原有状态...
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);
  const triggerFormShake = useCallback(() => {
    setShakeForm(true);
    setTimeout(() => setShakeForm(false), 500);
  }, []);
  const [submittedVideo, setSubmittedVideo] = useState<Video | null>(null);
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
        const assignmentKey =
          role === "script_author"
            ? "scriptAuthorUserId"
            : role === "video_editor"
              ? "videoEditorUserId"
              : "operatorUserId";
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
    [operatorMembers, userId],
  );

  const removeRoleOverride = useCallback(
    (role: SubmissionAssigneeRole) => {
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
    [userId],
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

  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const isBackfillMode = mode === "backfill";
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const shouldAutoRedirectAfterSubmitRef = useRef(false);
  const handleGoToGrowth = useCallback(() => {
    router.push("/growth");
  }, [router]);
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
      shouldAutoRedirectAfterSubmitRef.current = false;
    }
  }, [isSubmitted]);

  // 草稿管理：新建 / 补交 / 编辑使用互相隔离的草稿 key
  const draftMode: VideoSubmitDraftMode =
    mode === "editToday" ? "edit" : mode === "backfill" ? "backfill" : "create";
  const [createDraftStorageKey] = useState(() =>
    resolveVideoSubmitCreateDraftStorageKey({
      userId,
      accountId: account?.id ?? null,
      bizDate: today,
    }),
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
    fields: SubmissionState["fields"];
    slots: Record<SubmissionSlotRole, SlotViewState>;
    scriptText: string;
    keywordInput: string;
    hasManualScriptAuthorSelection?: boolean;
    hasManualOperatorSelection?: boolean;
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
    }),
    [
      meta,
      fields,
      slots,
      scriptText,
      keywordInput,
      hasManualScriptAuthorSelection,
      hasManualOperatorSelection,
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
      ],
      { isEmpty: isVideoSubmitDraftEmpty },
    );

  const showDraftBanner =
    hasDraft && !isSubmitted && !submittedViewActive && !initialSummary;

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (!draft) return;

    setMeta({
      ...draft.meta,
      scriptAuthorUserId:
        draft.meta.scriptAuthorUserId ?? resolveSelfOperatorUserId(userId),
      videoEditorUserId:
        draft.meta.videoEditorUserId ?? resolveSelfOperatorUserId(userId),
      operatorUserId:
        draft.meta.operatorUserId ?? resolveSelfOperatorUserId(userId),
      roleOverrides: draft.meta.roleOverrides ?? [],
    });
    setHasManualScriptAuthorSelection(
      draft.hasManualScriptAuthorSelection ?? false,
    );
    setHasManualOperatorSelection(draft.hasManualOperatorSelection ?? false);
    setFields(draft.fields);
    updateSlotsState((current) => ({
      screenshot_1: {
        ...current.screenshot_1,
        ...draft.slots.screenshot_1,
        file: null,
        previewUrl: null,
      },
      screenshot_2: {
        ...current.screenshot_2,
        ...draft.slots.screenshot_2,
        file: null,
        previewUrl: null,
      },
    }));
    setScriptText(draft.scriptText);
    setKeywordInput(draft.keywordInput);
  }, [restoreDraft, updateSlotsState, userId]);

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
        description: lastSavedAt
          ? `(${lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })})`
          : undefined,
        actions: (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="font-medium text-[#D97757] hover:text-[#C46A4D] hover:underline cursor-pointer"
            >
              恢复
            </button>
            <span className="text-[#D6D3D1]">·</span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-[#78716C] hover:text-[#292524] cursor-pointer"
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
    if (initialTopicId) {
      items.push({
        id: `topic-${initialTopicId}`,
        type: "topic_context",
        statusTone: "mineral",
        title: "已带入选题上下文",
        description: `· ${initialTopicTitle ? `《${initialTopicTitle}》` : "来自选题库的脚本中选题"}，提交后保留关联`,
        topicId: initialTopicId, // data-topic-context={initialTopicId}
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
    isExemptionPending,
    lastSavedAt,
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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- 账号/编辑对象切换时整体重置表单（含草稿清理语义）
    setMeta(nextMeta);
    setFields(editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields());
    updateSlotsState(editDetail ? createEditableSlotsFromEditDetail(editDetail) : createEditableSlots());
    setIsSubmitted(false);
    setSubmittedVideo(null);
    setQualityCheck({ data: null, loading: false });
    setDeleteTargetRole(null);
    setKeywordInput("");
    setScriptText(editDetail?.conversionScript?.text ?? "");
    setFocusedRole(null);
    setHasManualScriptAuthorSelection(false);
    setHasManualOperatorSelection(false);
  }, [
    account?.id,
    editDetail,
    initialBizDate,
    initialSummary,
    isBackfillMode,
    today,
    userId,
    submittedViewActive,
    updateSlotsState,
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
  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: meta.anomalyStatus,
  });
  const canActuallySubmit = issueSummary.canSubmit;
  const issueMessages = useMemo(
    () => buildIssueMessages(issueSummary),
    [issueSummary],
  );
  const issueHintText = useMemo(
    () => buildIssueHintText(issueMessages),
    [issueMessages],
  );
  const submitButtonLabel = isSubmitting
    ? "提交中..."
    : isBackfillMode
      ? "提交补交数据"
      : initialSummary
        ? "保存修改"
        : "提交今日数据";

  function updateMeta<Key extends keyof FormMetaState>(
    key: Key,
    value: FormMetaState[Key],
  ) {
    setMeta((current) => ({ ...current, [key]: value }));
  }

  function updateField(key: EditableMetricKey, value: string) {
    setFields((current) => ({
      ...current,
      [key]: toManualFieldState({
        ...current[key],
        value,
      }),
    }));
  }

  function scrollToIssueAnchor(
    anchor: "slots" | "metrics" | "topicTag" | "meta" | null,
  ) {
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
  }

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
    if (!submittedVideo) return;
    setQualityCheck({ data: null, loading: true });
    try {
      const res = await fetch("/api/dashboard/sample-quality-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: submittedVideo.id }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as SampleQualityResponse;
      setQualityCheck({ data, loading: false });
    } catch {
      feedbackToast.error("AI 检查未完成，不影响您直接提交");
      setQualityCheck({ data: null, loading: false });
    }
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

  function applyOverviewFields(
    recognizedFields: Record<string, string | number | boolean | null>,
    confidence?: OcrData["confidence"],
  ) {
    setFields((current) => {
      const next = { ...current };

      for (const key of OVERVIEW_FIELDS) {
        const rawValue = recognizedFields[key];
        if (typeof rawValue === "number" || typeof rawValue === "string") {
          next[key] = {
            ...next[key],
            value: String(rawValue),
            source: "ocr",
            requiresManualConfirmation: false,
            confirmed: true,
            confidenceScore: mapConfidenceToScore(
              confidence?.[key as keyof typeof confidence],
            ),
          };
        }
      }

      return next;
    });
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
            confirmed: Boolean(assetUrl),
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

        if (data.slot_status === "failed") {
          feedbackToast.error("截图识读不完整，您可手动补全数据");
          return;
        }

        if (detectedType === "data" && data.recognized_fields) {
          applyOverviewFields(data.recognized_fields, data.confidence);
        }

        if (detectedType === "retention" && data.recognized_fields) {
          const retentionMetrics = data.recognized_fields
            .retention_metrics as unknown as
            Record<string, number | null> | undefined;
          setFields((current) => ({
            ...current,
            avg_play_duration: {
              ...current.avg_play_duration,
              value:
                typeof retentionMetrics?.avg_play_duration === "number"
                  ? String(retentionMetrics.avg_play_duration)
                  : current.avg_play_duration.value,
              source: "ocr",
              requiresManualConfirmation: false,
              confirmed: true,
            },
            bounce_rate_2s: {
              ...current.bounce_rate_2s,
              value:
                typeof retentionMetrics?.bounce_rate_2s === "number"
                  ? String(retentionMetrics.bounce_rate_2s)
                  : current.bounce_rate_2s.value,
              source: "ocr",
              requiresManualConfirmation: false,
              confirmed: true,
            },
            completion_rate_5s: {
              ...current.completion_rate_5s,
              value:
                typeof retentionMetrics?.completion_rate_5s === "number"
                  ? String(retentionMetrics.completion_rate_5s)
                  : current.completion_rate_5s.value,
              source: "ocr",
              requiresManualConfirmation: false,
              confirmed: true,
            },
            completion_rate: {
              ...current.completion_rate,
              value:
                typeof retentionMetrics?.completion_rate === "number"
                  ? String(retentionMetrics.completion_rate)
                  : current.completion_rate.value,
              source: "ocr",
              requiresManualConfirmation: false,
              confirmed: true,
            },
          }));
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
            confirmed: Boolean(uploadedAssetUrl),
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
    [account, supabase.auth, updateSlotsState, userId],
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
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasAttemptedSubmit(true);

    if (!account) {
      triggerFormShake();
      return;
    }

    if (!submitCheck.ok || !issueSummary.canSubmit) {
      triggerFormShake();
      scrollToIssueAnchor(issueSummary.firstIssueAnchor);
      return;
    }

    if (!meta.topicTag) {
      triggerFormShake();
      scrollToIssueAnchor("topicTag");
      return;
    }

    if (parseMetric(fields.follower_convert.value) > 0 && !scriptText.trim()) {
      triggerFormShake();
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
    const shouldReuseExistingScreenshots = mode === "editToday" && buildAssets(slots).length === 0;
    const submitMeta = resolveVideoSubmitMetaFields({
      mode,
      anomalyStatus: meta.anomalyStatus,
      publishedAt: meta.publishedAt,
      punishType: meta.punishType ?? "",
      platformNotice: meta.platformNotice ?? "",
      appeal: meta.appeal ?? "",
      defaultPublishedAt: getDefaultPublishedAtForBizDate(meta.bizDate, today),
    });

    const shouldAutoRedirectAfterSubmit = shouldAutoRedirectToGrowthAfterSubmit(
      {
        mode,
        bizDate: meta.bizDate,
        today,
        submittedViewActive,
        hasInitialSummary: Boolean(initialSummary),
      },
    );

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
          topic_id: initialTopicId,
          script_author_user_id: meta.scriptAuthorUserId,
          video_editor_user_id: meta.videoEditorUserId,
          operator_user_id: meta.operatorUserId,
          content_keywords: meta.contentKeywords,
          assets: shouldReuseExistingScreenshots ? [] : buildAssets(slots),
          script_text:
            parseMetric(fields.follower_convert.value) > 0
              ? scriptText.trim() || null
              : null,
          script_format: editPayload?.script_format ?? "oral",
          metrics: {
            play_count: parseMetric(fields.play_count.value),
            likes: parseMetric(fields.likes.value),
            comments: parseMetric(fields.comments.value),
            shares: parseMetric(fields.shares.value),
            favorites: parseMetric(fields.favorites.value),
            follower_gain: parseMetric(fields.follower_gain.value),
            follower_loss: 0,
            follower_convert: parseMetric(fields.follower_convert.value),
            avg_play_duration: parseMetric(fields.avg_play_duration.value),
            bounce_rate_2s: parseMetric(fields.bounce_rate_2s.value),
            completion_rate_5s: parseMetric(fields.completion_rate_5s.value),
            completion_rate: parseMetric(fields.completion_rate.value),
          },
        }),
      });

      const payload = (await response.json()) as SubmitResponse | Video;
      if (!response.ok) {
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
      shouldAutoRedirectAfterSubmitRef.current = shouldAutoRedirectAfterSubmit;
      setSubmittedVideo(submittedVideo);
      setIsSubmitted(true);
      if (shouldAutoRedirectAfterSubmit) {
        router.prefetch("/growth");
      }
      onSubmitted(submittedVideo, aiTags, summaryOverride);
      trackUsageEvent({ path: "/dashboard", eventType: "submit_daily_report" });
      clearDraft();
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
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
  const canSubmitRef = useRef(canActuallySubmit);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);
  useEffect(() => {
    canSubmitRef.current = canActuallySubmit;
  }, [canActuallySubmit]);

  const triggerSubmit = useCallback(() => {
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
  }, []);

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
          if (canSubmitRef.current) triggerSubmit();
        }
        return;
      }

      if (cmdEnter) {
        event.preventDefault();
        if (canSubmitRef.current) triggerSubmit();
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
              <h3 className="font-serif tracking-tight text-xl font-medium text-[#1C1917]">
                今日创作已成功立卷
              </h3>
              <p className="text-[13px] text-[#78716C]">
                归属日期：<span className="tabular-nums font-medium text-[#1C1917]">{meta.bizDate}</span> · 记录已安全落库
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
                className="w-full max-w-xs font-medium text-[13px] shadow-sm cursor-pointer"
              >
                <Compass className="size-4" />
                <span>去选题库挑选明日选题</span>
              </Button>

              {/* 辅助操作 */}
              <div className="flex items-center gap-2.5">
                <Button
                  variant="secondary"
                  size="m"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasUserInteracted(true);
                    setIsSubmitted(false);
                    setSubmittedVideo(null);
                    setQualityCheck({ data: null, loading: false });
                    onCancel?.();
                  }}
                  className="px-3 text-[12px] text-[#292524] cursor-pointer"
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
                  className="px-3 text-[12px] text-[#292524] cursor-pointer"
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
                <Button
                  variant="ghost"
                  size="m"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasUserInteracted(true);
                    handleGoToGrowth();
                  }}
                  className="px-3 text-[12px] text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                >
                  成长复盘
                </Button>
              </div>
            </div>
          </div>

          {qualityCheck.data ? (
            <div className="rounded-xl border border-[#E5E0D6] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 items-center justify-center rounded-lg px-2 text-[12px] font-medium",
                    qualityCheck.data.overallStatus === "pass"
                      ? "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                      : qualityCheck.data.overallStatus === "warning"
                        ? "bg-[#B98A54]/10 text-[#8A6A2F]"
                        : "bg-[#C0685C]/10 text-[#C0685C]",
                  )}
                >
                  {qualityCheck.data.overallStatus === "pass"
                    ? "通过"
                    : qualityCheck.data.overallStatus === "warning"
                      ? "警告"
                      : "未通过"}
                </span>
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
                        <XCircle className="mt-0.5 size-4 shrink-0 text-[#C9604D]" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#B98A54]" />
                      ) : (
                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-[#6FAA7D]" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#292524]">
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
                        className="h-8 shrink-0 rounded-xl border-[#E5E0D6] px-3 text-[12px] text-[#292524] hover:bg-[#FBF9F5]"
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
            <DialogContent className="max-w-md rounded-2xl border border-[#E5E0D6] bg-white p-0 shadow-claude-dialog">
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
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 sm:pb-4 border-b border-[#ECE7DE]">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="text-[14.5px] sm:text-[15.5px] font-[580] text-[#1C1917]">
                      {mode === "editToday"
                        ? meta.bizDate !== today
                          ? `修改历史作品 · ${meta.bizDate}`
                          : `微调今日作品 · ${meta.bizDate}`
                        : isBackfillMode
                          ? `创作纪事补录 (${meta.bizDate})`
                          : "今日创作立卷 · 表达纪事"}
                    </h2>
                    <VideoStatusSegmented
                      value={meta.anomalyStatus}
                      onChange={(value) => updateMeta("anomalyStatus", value)}
                    />
                    {meta.anomalyStatus === "abnormal" && (
                      <Select
                        value={meta.punishType || "限流"}
                        onValueChange={(value) => updateMeta("punishType", value || undefined)}
                      >
                        <SelectTrigger className="h-8 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 text-[12px] font-medium text-[#292524] shadow-sm hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25">
                          <SelectValue>{meta.punishType || "限流"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-[#E5E0D6] bg-white shadow-claude-float min-w-28">
                          <SelectItem value="限流">限流</SelectItem>
                          <SelectItem value="删稿">删稿</SelectItem>
                          <SelectItem value="投流">投流</SelectItem>
                          <SelectItem value="活动干预">活动干预</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* 右上角：草稿 / 审批微提示 */}
                    {workbenchNotices.length > 0 && (
                      <WorkbenchNoticeCapsule notices={workbenchNotices} />
                    )}

                    <div className="text-[12px] text-[#78716C] tabular-nums">
                      {meta.bizDate !== today ? `归属日期：${meta.bizDate}` : "当日"}
                    </div>
                  </div>
                </div>

                {/* 两栏布局：左侧截图 + 右侧数据 */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-5 items-stretch">
                  {/* 左栏：截图上传 */}
                  <div className="flex min-w-0 flex-col gap-3 lg:h-full lg:gap-6">
                    <div ref={slotsSectionRef}>
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
                      />
                    </div>

                    {/* 共创伙伴 */}
                    <div className="space-y-2.5 rounded-xl border border-[#ECE7DE] bg-white/90 p-3 shadow-2xs lg:flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[12.5px] font-medium text-[#292524] flex items-center gap-1.5">
                          <span>共创伙伴</span>
                        </h3>
                        {hiddenRoleRestoreLabel && (
                          <button
                            type="button"
                            onClick={showAllRoles}
                            className="text-[12px] font-medium text-[#D97757] hover:underline"
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
                        <div className="space-y-1.5">
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

                      {/* 题材与形式：内联轻量分段器 */}
                      <div className="space-y-2 border-t border-[#ECE7DE] pt-2.5" ref={topicTagSectionRef}>
                        {/* 题材标签 */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-[#292524]">
                            题材标签
                          </span>
                          <div className="flex items-center rounded-lg bg-[#F5F3EE] p-0.5">
                            {(["干货", "复盘"] as const).map((tag) => {
                              const isSelected = meta.topicTag === tag;
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => updateMeta("topicTag", isSelected ? "" : tag)}
                                  className={cn(
                                    "h-6 px-3 rounded-md text-[11.5px] font-medium transition-all cursor-pointer",
                                    isSelected
                                      ? "bg-white text-[#1C1917] shadow-2xs"
                                      : "text-[#78716C] hover:text-[#292524]"
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
                          <span className="text-[12px] font-medium text-[#292524]">
                            视频形式
                          </span>
                          <div className="flex items-center rounded-lg bg-[#F5F3EE] p-0.5">
                            {(["出镜", "图文"] as const).map((form) => {
                              const isSelected = meta.videoForm === form;
                              return (
                                <button
                                  key={form}
                                  type="button"
                                  onClick={() => updateMeta("videoForm", form)}
                                  className={cn(
                                    "h-6 px-3 rounded-md text-[11.5px] font-medium transition-all cursor-pointer",
                                    isSelected
                                      ? "bg-white text-[#1C1917] shadow-2xs"
                                      : "text-[#78716C] hover:text-[#292524]"
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
                        <div className="pt-2 space-y-2.5 border-t border-[#ECE7DE]/60">
                          <div className="space-y-1">
                            <Label htmlFor="platform_notice" className="text-[12px] font-medium text-[#292524]">
                              平台通知 (选填)
                            </Label>
                            <Input
                              id="platform_notice"
                              value={meta.platformNotice || ""}
                              onChange={(e) => updateMeta("platformNotice", e.target.value)}
                              placeholder="如处罚通知文案"
                              className="h-8 rounded-lg bg-white border-[#E5E0D6] text-[12px] text-[#292524] shadow-2xs focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="appeal" className="text-[12px] font-medium text-[#292524]">
                              申诉进展 (选填)
                            </Label>
                            <Input
                              id="appeal"
                              value={meta.appeal || ""}
                              onChange={(e) => updateMeta("appeal", e.target.value)}
                              placeholder="如申诉处理中"
                              className="h-8 rounded-lg bg-white border-[#E5E0D6] text-[12px] text-[#292524] shadow-2xs focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                            />
                          </div>
                        </div>
                      )}

                      {/* 更多设置 */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setIsMoreSettingsExpanded(!isMoreSettingsExpanded)}
                          className="flex items-center gap-1.5 text-[12px] font-medium text-[#78716C] hover:text-[#292524]"
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
                                <Label className="text-[12px] font-medium text-[#292524]">
                                  发布时间
                                </Label>
                                <PublishedAtPicker
                                  value={meta.publishedAt}
                                  onChange={(nextPublishedAt) => {
                                    const synced = syncPublishedAtAndText({
                                      nextPublishedAt,
                                      nextPublishedAtText: meta.publishedAtText,
                                      changedField: "published_at",
                                    });
                                    setMeta((current) => ({
                                      ...current,
                                      bizDate: preserveBizDateWhenPublishedAtChanges(current.bizDate),
                                      publishedAt: synced.publishedAt,
                                      publishedAtText: synced.publishedAtText,
                                    }));
                                  }}
                                />
                              </div>
                              <div className="flex justify-between text-[11px] text-[#78716C]">
                                <span>上传时间戳</span>
                                <span className="tabular-nums">{meta.uploadedAt || "—"}</span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* 右栏：核心数据 + 标题文案 */}
                  <div className="flex min-w-0 flex-col gap-6 lg:h-full">
                    {/* 核心数据指标 */}
                    <div ref={metricsSectionRef} className="space-y-4">
                      <指标分组区
                        fields={fields}
                        onFieldChange={updateField}
                        onFocusField={handleFieldFocus}
                        onBlurField={handleFieldBlur}
                        anomalyStatus={meta.anomalyStatus}
                      />
                      <导粉话术采集区
                        visible={parseMetric(fields.follower_convert.value) > 0}
                        value={scriptText}
                        onChange={setScriptText}
                        hasAttemptedSubmit={hasAttemptedSubmit}
                      />
                    </div>

                    {/* 视频标题 */}
                    <div
                      ref={metaSectionRef}
                      className={cn(
                        "space-y-2 rounded-xl p-3 transition-colors",
                        hasAttemptedSubmit &&
                          meta.anomalyStatus !== "abnormal" &&
                          issueSummary.missingRequiredMeta.includes("videoTitle") &&
                          "border border-[#C0685C]/30 bg-[#C0685C]/5"
                      )}
                    >
                      <Label htmlFor="video_title" className="text-[13px] font-medium text-[#292524]">
                        视频标题{" "}
                        {meta.anomalyStatus !== "abnormal" && (
                          <span className="text-[#C0685C]">*</span>
                        )}
                      </Label>
                      <Input
                        id="video_title"
                        value={meta.videoTitle}
                        onChange={(event) => updateMeta("videoTitle", event.target.value)}
                        placeholder="输入视频标题"
                        className="h-10 rounded-lg bg-[#FAF8F4]/50 border border-[#E5E0D6] shadow-sm text-[13px]"
                      />
                      {hasAttemptedSubmit &&
                        meta.anomalyStatus !== "abnormal" &&
                        issueSummary.missingRequiredMeta.includes("videoTitle") && (
                          <p className="text-[11px] font-medium text-[#C0685C]">
                            待填写视频标题
                          </p>
                        )}
                    </div>

                    {/* 视频文案 */}
                    <div
                      className={cn(
                        "flex flex-1 flex-col min-h-0 rounded-xl p-4 bg-white border border-[#E5E0D6] shadow-sm transition-colors",
                        hasAttemptedSubmit &&
                          issueSummary.missingRequiredMeta.includes("content") &&
                          "border-[#C0685C]/30 bg-[#C0685C]/5"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="content" className="text-[13px] font-medium text-[#292524]">
                          文案 <span className="text-[#C0685C]">*</span>
                        </Label>
                        <button
                          type="button"
                          onClick={handlePasteContent}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors",
                            isPastedFeedback
                              ? "text-[#6FAA7D]"
                              : "text-[#78716C] hover:text-[#292524]"
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
                        id="content"
                        value={meta.content}
                        onChange={(event) => updateMeta("content", event.target.value)}
                        placeholder="粘贴视频文案..."
                        className="min-h-[140px] w-full flex-1 resize-none bg-transparent border-0 text-[13px] leading-relaxed text-[#292524] placeholder:text-[#78716C]/60 outline-none focus:ring-0 lg:min-h-[100px] lg:flex-1"
                      />
                      {hasAttemptedSubmit &&
                        issueSummary.missingRequiredMeta.includes("content") && (
                          <p className="mt-2 text-[11px] font-medium text-[#C0685C]">
                            待填写视频文案
                          </p>
                        )}
                    </div>
                  </div>
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
                <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl bg-white border border-[#ECE7DE] p-3.5 sm:p-4 shadow-claude-dialog">
                  <DialogHeader className="pb-2 border-b border-[#ECE7DE]">
                    <DialogTitle className="text-sm font-semibold text-[#1C1917]">
                      选择{selectingRole?.label}负责人
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-2.5 pt-2.5">
                    {/* 搜索框 */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                      <Input
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder="搜索团队成员..."
                        className="h-8 rounded-lg border-[#E5E0D6] bg-white pl-8 text-xs text-[#292524] placeholder:text-[#A8A29E] focus-visible:ring-1 focus-visible:ring-[#D97757]/30 focus-visible:border-[#78716C]"
                      />
                    </div>

                    {/* 成员列表 (扩大视口至 320px~340px，搭配发丝细滚条) */}
                    <div className="max-h-[300px] sm:max-h-[340px] overflow-y-auto space-y-0.5 pr-1 scrollbar-thin [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D9D3C7] [&::-webkit-scrollbar-track]:bg-transparent [scrollbar-width:thin] [scrollbar-color:#D9D3C7_transparent]">
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
                            "w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs sm:text-[13px] transition-colors border cursor-pointer",
                            selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId
                              ? "bg-[#F5F3EE] text-[#1C1917] font-medium border-[#E5E0D6]/70 shadow-2xs"
                              : "border-transparent text-[#292524] hover:bg-white hover:border-[#ECE7DE]"
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{selfLabel}</span>
                            <span className="rounded bg-[#ECE7DE] px-1 py-0.5 text-[9.5px] text-[#78716C] font-medium">
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
                                "w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs sm:text-[13px] transition-colors border cursor-pointer",
                                isSelected
                                  ? "bg-[#F5F3EE] text-[#1C1917] font-medium border-[#E5E0D6]/70 shadow-2xs"
                                  : "border-transparent text-[#292524] hover:bg-white hover:border-[#ECE7DE]"
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

              {/* 底部提交按钮 */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 sm:pt-6 border-t border-[#ECE7DE]">
                <div className="flex items-center gap-2">
                  {!canActuallySubmit ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B98A54]/25 bg-[#B98A54]/10 px-3 py-1.5 text-[12px] font-medium text-[#B98A54]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B98A54]" />
                      {issueSummary.reason || "待补全必要信息"}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6FAA7D]/25 bg-[#6FAA7D]/10 px-3 py-1.5 text-[12px] font-medium text-[#6FAA7D]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
                        已就绪，可提交
                      </span>
                      <span className="text-[12px] text-[#78716C] hidden sm:inline">
                        (支持 ⌘/Ctrl + Enter)
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {isBackfillMode || submittedViewActive ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="l"
                      onClick={onCancel}
                      className="flex-1 sm:flex-initial px-4 text-[13px] font-medium"
                    >
                      取消
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="l"
                    onClick={triggerSubmit}
                    disabled={isSubmitting || !canActuallySubmit}
                    className="flex-1 sm:flex-initial px-6 text-[14px] font-medium bg-[#D97757] hover:bg-[#C46A4D] text-white disabled:opacity-40 disabled:bg-[#D97757] disabled:text-white disabled:cursor-not-allowed shadow-sm cursor-pointer"
                  >
                    {isSubmitting && (
                      <Loader2 className="size-4 animate-spin text-white" />
                    )}
                    <span>{submitButtonLabel}</span>
                  </Button>
                </div>
              </div>
            </div>
          </motion.form>
        </>
      )}
    </>
  );
}

// 视频状态分段控件
const VIDEO_STATUS_OPTIONS: Array<{
  value: AnomalyStatus;
  label: string;
  dotClass: string;
}> = [
  {
    value: "normal",
    label: "正常",
    dotClass: "bg-[#6FAA7D]",
  },
  {
    value: "abnormal",
    label: "异常",
    dotClass: "bg-[#B98A54]",
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
      className="inline-flex items-center gap-1 rounded-lg bg-[#F5F3EE] p-1"
    >
      {VIDEO_STATUS_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors",
              isActive
                ? "bg-white text-[#1C1917] shadow-sm"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E5E0D6]/50"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                option.dotClass,
                !isActive && "opacity-60"
              )}
            />
            {option.label}
          </button>
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
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#292524]">
        {icon}
        <span>{label}</span>
      </div>

      {/* 右侧人员选择 - 一体化内嵌设计 */}
      <div
        className={cn(
          "group flex h-7 items-center rounded-lg transition-all",
          display.external
            ? "bg-[#D97757]/10 text-[#C46A4D] hover:bg-[#D97757]/16 font-medium"
            : "bg-[#F5F3EE] hover:bg-[#ECE7DE] text-[#292524]"
        )}
      >
        <button
          type="button"
          onClick={onOpenSelector}
          className={cn(
            "flex h-full items-center gap-1.5 px-2.5 text-[12px] font-medium transition-colors cursor-pointer",
            display.historical ? "text-[#78716C]" : "text-[#292524]"
          )}
        >
          <span>{display.text}</span>
          {!display.external && <ChevronDown className="size-3 text-[#78716C]" />}
        </button>

        {display.external && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetSelf();
            }}
            title="恢复由我完成"
            className="flex h-full items-center pr-2 pl-0.5 text-[#78716C] hover:text-[#D97757] transition-colors cursor-pointer"
          >
            <X className="size-3.5 stroke-[2]" />
          </button>
        )}
      </div>
    </div>
  );
}

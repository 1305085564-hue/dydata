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
  XCircle,
  AlertTriangle,
  CheckCircle,
  ClipboardPaste,
  ChevronDown,
  Plus,
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
import { getDefaultPublishedAtValue } from "@/lib/日报";
import type { AnomalyStatus, Video, VideoTagReviewDimension } from "@/types";

import { 指标分组区 } from "@/components/submission/指标分组区";
import { 导粉话术采集区 } from "@/components/submission/导粉话术采集区";
import { 截图槽位区 } from "@/components/submission/截图槽位区";
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
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import {
  addRoleOverride as addSubmissionRoleOverride,
  normalizeOptionalText,
  removeRoleOverride as removeSubmissionRoleOverride,
  findNextScreenshotUploadRole,
  type ScreenshotUploadSlotRole,
  preserveBizDateWhenPublishedAtChanges,
  setOperatorToSelf as resolveSelfOperatorUserId,
  setOperatorUser as resolveSelectedOperatorUserId,
  shouldAutoRedirectToGrowthAfterSubmit,
  type SubmissionAssigneeRole,
} from "./video-submit-form-state";

import type {
  SubmitPanelMode,
  TodaySubmissionReportLike,
  TodaySubmissionSummary,
} from "./video-submit-panel-state";

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
  today: string;
  mode: SubmitPanelMode;
  initialSummary: TodaySubmissionSummary | null;
  initialBizDate?: string | null;
  submittedViewActive?: boolean;
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
  screenshot_type_source?: "explicit" | "asset_role" | "classification" | "asset_role_fallback";
  timings?: {
    download_ms?: number;
    classify_ms?: number;
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
  recognizedFields?: Record<string, string | number | boolean | null> | null;
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

function createInitialMeta(today: string, userId: string): FormMetaState {
  const publishedAt = getDefaultPublishedAtValue();

  return {
    videoUrl: "",
    videoTitle: "",
    content: "",
    bizDate: today,
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

  if (screenshotType === "curve") {
    return [
      recognizedFields.curve_pattern
        ? `曲线类型：${recognizedFields.curve_pattern}`
        : null,
      recognizedFields.first_peak_position
        ? `首峰位置：${recognizedFields.first_peak_position}`
        : null,
      recognizedFields.drop_severity
        ? `掉速程度：${recognizedFields.drop_severity}`
        : null,
      recognizedFields.tail_strength
        ? `长尾强弱：${recognizedFields.tail_strength}`
        : null,
    ].filter((item): item is string => Boolean(item));
  }

  if (screenshotType === "retention") {
    const retentionMetrics = recognizedFields.retention_metrics as
      Record<string, number | null> | undefined;
    const retentionAnalysis = recognizedFields.retention_analysis as
      | {
          bounce_peak_time?: string | null;
          replay_peak_time?: string | null;
          segment_summary?: Array<{ segment?: string; performance?: string }>;
        }
      | undefined;

    const firstSegment = retentionAnalysis?.segment_summary?.[0];

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
      retentionAnalysis?.bounce_peak_time
        ? `跳出峰值：${retentionAnalysis.bounce_peak_time}`
        : null,
      retentionAnalysis?.replay_peak_time
        ? `回放峰值：${retentionAnalysis.replay_peak_time}`
        : null,
      firstSegment?.segment && firstSegment?.performance
        ? `分段摘要：${firstSegment.segment}${firstSegment.performance}`
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

  const curveInfo = recognizedFields.curve_info as unknown as
    Record<string, string | null> | undefined;
  const retentionInfo = recognizedFields.retention_info as unknown as
    Record<string, string | null> | undefined;

  if (curveInfo?.curve_pattern) {
    baseSummary.push(`推流曲线：${curveInfo.curve_pattern}`);
  }
  if (retentionInfo?.bounce_peak_time) {
    baseSummary.push(`跳出峰值：${retentionInfo.bounce_peak_time}`);
  }

  return baseSummary;
}

function createEditableFields(): SubmissionState["fields"] {
  return {
    play_count: { ...createFieldState(), key: "play_count" },
    follower_gain: { ...createFieldState(), key: "follower_gain" },
    follower_convert: { ...createFieldState("0"), key: "follower_convert" },
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

export function VideoSubmitForm({
  account,
  userId,
  today,
  mode,
  initialSummary,
  initialBizDate = null,
  submittedViewActive = false,
  onSubmitted,
  onCancel,
  onRequestEdit,
}: VideoSubmitFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [meta, setMeta] = useState<FormMetaState>(() =>
    createInitialMeta(today, userId),
  );
  const [fields, setFields] = useState<SubmissionState["fields"]>(() =>
    createEditableFields(),
  );
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, SlotViewState>>(
    () => createEditableSlots(),
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

  const [hasManualScriptAuthorSelection, setHasManualScriptAuthorSelection] =
    useState(false);
  const [hasManualOperatorSelection, setHasManualOperatorSelection] =
    useState(false);
  const [operatorMembers, setOperatorMembers] = useState<OperatorMember[]>([]);

  // 岗位选择弹窗状态 (Portal 居中/半屏，绝不飘走)
  const [selectingRole, setSelectingRole] = useState<{
    role: "script_author" | "video_editor" | "operator";
    label: string;
    selectedUserId: string | null;
  } | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  // 岗位外协隐藏状态
  const [hiddenRoles, setHiddenRoles] = useState<Set<SubmissionAssigneeRole>>(
    new Set(),
  );

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

  const filteredModalMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return operatorMembers;
    const q = memberSearchQuery.trim().toLowerCase();
    return operatorMembers.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.display_name?.toLowerCase().includes(q),
    );
  }, [operatorMembers, memberSearchQuery]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

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

  useEffect(() => {
    setOperatorToSelf();
  }, [setOperatorToSelf]);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/dashboard/operator-members")
      .then(async (response) => {
        if (!response.ok) throw new Error("load operator members failed");
        return response.json() as Promise<{ members?: OperatorMember[] }>;
      })
      .then((payload) => {
        if (!cancelled)
          setOperatorMembers(
            Array.isArray(payload.members) ? payload.members : [],
          );
      })
      .catch(() => {
        if (!cancelled) setOperatorMembers([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const isBackfillMode = mode === "backfill";
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const shouldAutoRedirectAfterSubmitRef = useRef(false);
  const handleGoToGrowth = useCallback(() => {
    router.push("/growth");
  }, [router]);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isPastedFeedback, setIsPastedFeedback] = useState(false);

  const [isMemoryExpanded, setIsMemoryExpanded] = useState(false);
  const [isMoreSettingsExpanded, setIsMoreSettingsExpanded] = useState(false);

  // 当提交状态变为 false 时，重置用户操作状态
  useEffect(() => {
    if (!isSubmitted) {
      setHasUserInteracted(false);
      shouldAutoRedirectAfterSubmitRef.current = false;
    }
  }, [isSubmitted]);

  // Set uploadedAt on client only to avoid hydration mismatch
  useEffect(() => {
    setMeta((prev) =>
      prev.uploadedAt
        ? prev
        : { ...prev, uploadedAt: new Date().toLocaleString("zh-CN") },
    );
  }, []);

  const draftKey = useMemo(
    () => `dydata.draft.videoSubmit.${userId}`,
    [userId],
  );

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

  // 草稿状态 → 表单顶部内联 banner
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

  // Track all created blob URLs to clean them up on unmount
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

  useEffect(() => {
    if (submittedViewActive) return;
    // Clear previously generated blobs when switching accounts or initializing
    blobUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    blobUrlsRef.current.clear();

    const nextMeta = createInitialMeta(today, userId);
    if (initialBizDate) {
      nextMeta.bizDate = initialBizDate;
    }

    if (initialSummary) {
      nextMeta.videoTitle = initialSummary.title ?? "";
      nextMeta.content = initialSummary.content ?? "";
      nextMeta.bizDate = initialSummary.reportDate;
      nextMeta.publishedAt = initialSummary.publishedAt ?? nextMeta.publishedAt;
      nextMeta.uploadedAt = initialSummary.uploadedAt ?? nextMeta.uploadedAt;
    }

    setMeta(nextMeta);
    setFields(createEditableFields());
    updateSlotsState(createEditableSlots());
    setIsSubmitted(false);
    setSubmittedVideo(null);
    setQualityCheck({ data: null, loading: false });
    setDeleteTargetRole(null);
    setKeywordInput("");
    setScriptText("");
    setFocusedRole(null);
    setHasManualScriptAuthorSelection(false);
    setHasManualOperatorSelection(false);
  }, [
    account?.id,
    initialBizDate,
    initialSummary,
    isBackfillMode,
    today,
    userId,
    submittedViewActive,
    updateSlotsState,
  ]);

  const submissionState = buildSubmissionState(slots, fields, isSubmitted);
  const screenshotsRequired = areSubmissionScreenshotsRequired(meta.anomalyStatus);
  const issueSummary = useMemo(
    () =>
      summarizeSubmissionIssues(submissionState, {
        topicTag: meta.topicTag,
        anomalyStatus: meta.anomalyStatus,
        videoTitle: meta.videoTitle,
        content: meta.content,
        // contentKeywords：前端暂隐藏不必填（保留后端字段，重做后再上线）
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
      feedbackToast.error("AI 检查失败");
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

  const handleSlotUpload = useCallback(
    async (role: SubmissionSlotRole, file: File) => {
      if (!account) {
        feedbackToast.error("请先选择提交账号");
        return;
      }

      // Revoke old blob URL for this slot to avoid leak when uploading a new file over an existing one
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
          server_classify_ms: serverTimings?.classify_ms,
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

        // 智能对调逻辑：如果识别出的是流量数据，分流到 screenshot_1；若是留存完播数据，分流到 screenshot_2
        let targetRole: SubmissionSlotRole = role;
        if (detectedType === "data") {
          targetRole = "screenshot_1";
        } else if (detectedType === "retention") {
          targetRole = "screenshot_2";
        }

        const targetSlotSnapshot = slotsRef.current[targetRole];
        const targetSlotCanReceive =
          targetSlotSnapshot.status === "empty" ||
          targetSlotSnapshot.status === "failed";
        const targetSlotCanSwap =
          !targetSlotCanReceive &&
          (targetSlotSnapshot.status === "pending_confirm" ||
            Boolean(targetSlotSnapshot.ocrFallback));
        const shouldAutoMoveSlot =
          role !== targetRole && (targetSlotCanReceive || targetSlotCanSwap);

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
          feedbackToast.error("识别失败，可手动填写指标");
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
          account_id: account.id,
          biz_date: meta.bizDate,
          video_url: normalizeOptionalText(meta.videoUrl),
          video_title: normalizeOptionalText(meta.videoTitle),
          content: normalizeOptionalText(meta.content),
          published_at: meta.publishedAt || getDefaultPublishedAtValue(),
          published_at_text: normalizeOptionalText(meta.publishedAtText),
          anomaly_status: meta.anomalyStatus,
          punish_type:
            meta.anomalyStatus === "abnormal"
              ? meta.punishType || "限流"
              : undefined,
          platform_notice:
            meta.anomalyStatus === "abnormal"
              ? normalizeOptionalText(meta.platformNotice ?? "")
              : undefined,
          appeal:
            meta.anomalyStatus === "abnormal"
              ? normalizeOptionalText(meta.appeal ?? "")
              : undefined,
          topic_tag: meta.topicTag || null,
          video_form: meta.videoForm || null,
          topic_id: null,
          script_author_user_id: meta.scriptAuthorUserId,
          video_editor_user_id: meta.videoEditorUserId,
          operator_user_id: meta.operatorUserId,
          content_keywords: meta.contentKeywords,
          assets: buildAssets(slots),
          script_text:
            parseMetric(fields.follower_convert.value) > 0
              ? scriptText.trim() || null
              : null,
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

  /* ---------------------------------------------------------------- */
  /* 队列多图上传 */
  /* ---------------------------------------------------------------- */
  // 统一的多图指派与上传
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

        // 必须串行：每张图识别并自动归位后，再给下一张图找最新空槽。
        // 否则两张截图同时占住彼此目标槽，会出现“互动图在完播槽、完播图在互动槽”的互卡状态。
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

  // 提交：触发 form 的提交事件，复用现有 handleSubmit
  const triggerSubmit = useCallback(() => {
    setHasAttemptedSubmit(true);
    const formEl = document.getElementById(
      "video-submit-form",
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

  return (
    <>
      {isSubmitted ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4 pb-2"
        >
          <div className="py-12 text-center select-none space-y-4">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#6FAA7D]/10 text-[#6FAA7D]">
              <svg
                className="size-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.circle
                  cx="12"
                  cy="12"
                  r="10"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
                <motion.path
                  d="m9 12 2 2 4-4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
                />
              </svg>
            </div>
            <h3 className="text-base font-medium tracking-tight text-[#292524]">
              数据提交成功
            </h3>
            <p className="mt-2 text-[13px] text-[#78716C]">
              归属日期：{meta.bizDate}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setHasUserInteracted(true);
                  setIsSubmitted(false);
                  setSubmittedVideo(null);
                  setQualityCheck({ data: null, loading: false });
                  onCancel?.();
                }}
                className="h-9 rounded-xl border-[#E5E0D6] px-4 text-[12px] text-[#292524] hover:bg-[#FBF9F5] cursor-pointer"
              >
                返回
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={qualityCheck.loading}
                onClick={(e) => {
                  e.stopPropagation();
                  setHasUserInteracted(true);
                  handleQualityCheck();
                }}
                className="h-9 rounded-xl border-[#E5E0D6] px-4 text-[12px] text-[#292524] hover:bg-[#FBF9F5] cursor-pointer"
              >
                {qualityCheck.loading ? (
                  <>AI 分析中…</>
                ) : (
                  <>
                    <Sparkles className="mr-1 size-3.5" />
                    AI 检查样本质量
                  </>
                )}
              </Button>
            </div>
            <div className="mt-4 pt-4 border-t border-[#ECE7DE] flex justify-center">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setHasUserInteracted(true);
                  handleGoToGrowth();
                }}
                className="w-full max-w-xs h-10 rounded-xl bg-[#D97757] hover:bg-[#C46A4D] text-white font-medium text-[13px] transition-colors duration-100 flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.985] active:duration-75 cursor-pointer"
              >
                查看成长分析
              </Button>
            </div>
          </div>

          {qualityCheck.data ? (
            <div className="rounded-xl border border-[#E5E0D6] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 items-center justify-center rounded-lg px-2 text-[12px] font-medium",
                    qualityCheck.data.overallStatus === "pass"
                      ? "bg-[#16A34A]/10 text-[#16A34A]"
                      : qualityCheck.data.overallStatus === "warning"
                        ? "bg-[#D99E55]/10 text-[#8A6A2F]"
                        : "bg-[#DC2626]/10 text-[#DC2626]",
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
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#D99E55]" />
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

          <motion.form
            id="video-submit-form"
            onSubmit={handleSubmit}
            initial={false}
            animate={shakeForm ? "animate" : "initial"}
            variants={shakeVariants}
            className="w-full"
          >
            <div className="mx-auto max-w-5xl space-y-2.5 sm:space-y-4 py-0">
              {/* 草稿恢复 banner */}
              {showDraftBanner && (
                <div className="flex items-center justify-between rounded-xl border border-transparent bg-[#D99E55]/10 px-3.5 py-2 text-[11.5px] sm:text-[12px]">
                  <span className="text-[#8A6A2F]">
                    {lastSavedAt
                      ? `有未提交草稿 (${lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })})`
                      : "有未提交的草稿"}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleRestoreDraft}
                      className="font-medium text-[#8A6A2F] hover:text-[#8A6A2F] min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center cursor-pointer"
                    >
                      恢复草稿
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardDraft}
                      className="text-[#D99E55] hover:text-[#8A6A2F] min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center cursor-pointer"
                    >
                      丢弃
                    </button>
                  </div>
                </div>
              )}

              {/* 统一工作台 */}
              <div className="relative space-y-2 sm:space-y-3.5">
                {/* 顶部真正极简单行：今日提交·日期 ⌵ + 正常/异常单选 | 归属/当天填报 */}
                <div className="flex items-center justify-between pb-1 sm:pb-2 border-b border-[#ECE7DE]">
                  <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <span className="text-[12.5px] sm:text-[14px] font-semibold text-[#1C1917] tracking-tight shrink-0">
                      {isBackfillMode ? `补交录入 (${meta.bizDate})` : "今日提交"}
                    </span>
                    <VideoStatusSegmented
                      value={meta.anomalyStatus}
                      onChange={(value) => updateMeta("anomalyStatus", value)}
                    />
                    {meta.anomalyStatus === "abnormal" && (
                      <select
                        value={meta.punishType || "限流"}
                        onChange={(e) =>
                          updateMeta("punishType", e.target.value)
                        }
                        className="h-6.5 sm:h-7.5 min-h-[26px] sm:min-h-0 rounded-full border border-[#E5E0D6] bg-white px-1.5 sm:px-2 text-[10.5px] sm:text-[11.5px] font-medium text-[#292524] shadow-2xs outline-none hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                      >
                        <option value="限流">限流</option>
                        <option value="删稿">删稿</option>
                        <option value="投流">投流</option>
                        <option value="活动干预">活动干预</option>
                      </select>
                    )}
                  </div>

                  <div className="text-[10.5px] sm:text-[12px] text-[#78716C] tabular-nums shrink-0">
                    {meta.bizDate !== today ? `归属：${meta.bizDate}` : "当天填报"}
                  </div>
                </div>

                {/* 业务全流程顺畅响应式布局：桌面端 (lg:) 呈现豪华对称双栏，移动端 (<lg:) 呈现高密度单屏流 */}
                <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
                  {/* ===== 【左栏 (桌面端 lg: 独占 290px：上方垂直双截图 + 下方团队分工)】 ===== */}
                  <div className="flex flex-col space-y-2.5 sm:space-y-3">
                    {/* 1. 截图佐证区 (移动端横向双槽并列，桌面端垂直双槽) */}
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

                    {/* 2. 桌面端专属团队分工与题材卡片 (hidden lg:flex，在左栏截图正下方) */}
                    <div className="hidden lg:flex min-w-0 rounded-xl border border-[#ECE7DE] bg-white/90 shadow-2xs p-3 space-y-2 flex-col justify-between">
                      {/* 团队分工 */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[12.5px] font-semibold text-[#292524] select-none">
                            团队分工
                          </Label>

                          {!hasAnyVisibleRole ? (
                            <button
                              type="button"
                              onClick={showAllRoles}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] hover:underline transition-colors duration-100 cursor-pointer"
                            >
                              <Plus className="size-3 stroke-[2.5]" />
                              <span>+ 协同指派</span>
                            </button>
                          ) : null}
                        </div>

                        {!hasAnyVisibleRole ? (
                          <div className="text-[12px] text-[#78716C] py-0.5">
                            由我独立完成 (全包)
                          </div>
                        ) : (
                          <div className="space-y-1.5 pt-0.5">
                            {isScriptAuthorVisible && (
                              <RoleItemSelectorRow
                                label="文案"
                                icon={<FileText className="size-3.5 text-[#78716C] stroke-[1.75]" />}
                                roleKey="script_author"
                                selectedUserId={meta.scriptAuthorUserId}
                                operatorMembers={operatorMembers}
                                userId={userId}
                                onOpenSelector={() =>
                                  setSelectingRole({
                                    role: "script_author",
                                    label: "文案",
                                    selectedUserId: meta.scriptAuthorUserId,
                                  })
                                }
                                onResetSelf={() => hideRole("script_author")}
                              />
                            )}

                            {isVideoEditorVisible && (
                              <RoleItemSelectorRow
                                label="剪辑"
                                icon={<Scissors className="size-3.5 text-[#78716C] stroke-[1.75]" />}
                                roleKey="video_editor"
                                selectedUserId={meta.videoEditorUserId}
                                operatorMembers={operatorMembers}
                                userId={userId}
                                onOpenSelector={() =>
                                  setSelectingRole({
                                    role: "video_editor",
                                    label: "剪辑",
                                    selectedUserId: meta.videoEditorUserId,
                                  })
                                }
                                onResetSelf={() => hideRole("video_editor")}
                              />
                            )}

                            {isOperatorVisible && (
                              <RoleItemSelectorRow
                                label="运营"
                                icon={<Rocket className="size-3.5 text-[#78716C] stroke-[1.75]" />}
                                roleKey="operator"
                                selectedUserId={meta.operatorUserId}
                                operatorMembers={operatorMembers}
                                userId={userId}
                                onOpenSelector={() =>
                                  setSelectingRole({
                                    role: "operator",
                                    label: "运营",
                                    selectedUserId: meta.operatorUserId,
                                  })
                                }
                                onResetSelf={() => hideRole("operator")}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* 题材与形式记忆配置 */}
                      <div className="space-y-1.5 pt-1.5 border-t border-[#ECE7DE]">
                        {!isMemoryExpanded ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] text-[#292524] font-medium">
                                题材与形式：
                              </span>
                              <span className="bg-white/90 border border-[#E5E0D6] text-[#292524] rounded-md px-2 py-0.5 text-[11.5px] font-medium shadow-2xs">
                                {meta.topicTag || "未选"}
                              </span>
                              <span className="text-[#78716C] text-[10px]">·</span>
                              <span className="bg-white/90 border border-[#E5E0D6] text-[#292524] rounded-md px-2 py-0.5 text-[11.5px] font-medium shadow-2xs">
                                {meta.videoForm || "未选"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsMemoryExpanded(true)}
                              className="text-[12px] font-medium text-[#D97757] hover:text-[#C46A4D] transition-colors cursor-pointer"
                            >
                              修改
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 rounded-lg bg-[#F5F3EE]/70 p-2.5">
                            <div className="space-y-1">
                              <Label className="text-[12px] font-medium text-[#292524]">
                                题材标签 *
                              </Label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {(["干货", "复盘"] as const).map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() =>
                                      updateMeta(
                                        "topicTag",
                                        meta.topicTag === tag ? "" : tag,
                                      )
                                    }
                                    className={cn(
                                      "h-7.5 rounded-lg border text-[12px] font-medium transition-colors duration-100 cursor-pointer inline-flex items-center justify-center",
                                      meta.topicTag === tag
                                        ? "border-[#E5E0D6] bg-white text-[#1C1917] font-medium shadow-2xs"
                                        : "border-transparent text-[#292524] hover:bg-[#E5E0D6]/50 hover:text-[#1C1917]",
                                    )}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[12px] font-medium text-[#292524]">
                                视频形式 *
                              </Label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {(["出镜", "图文"] as const).map((form) => (
                                  <button
                                    key={form}
                                    type="button"
                                    onClick={() => updateMeta("videoForm", form)}
                                    className={cn(
                                      "h-7.5 rounded-lg border text-[12px] font-medium transition-colors duration-100 cursor-pointer inline-flex items-center justify-center",
                                      meta.videoForm === form
                                        ? "border-[#E5E0D6] bg-white text-[#1C1917] font-medium shadow-2xs"
                                        : "border-transparent text-[#292524] hover:bg-[#E5E0D6]/50 hover:text-[#1C1917]",
                                    )}
                                  >
                                    {form}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex justify-end pt-0.5">
                              <button
                                type="button"
                                onClick={() => setIsMemoryExpanded(false)}
                                className="text-[12px] font-medium text-[#78716C] hover:text-[#292524] cursor-pointer"
                              >
                                完成
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 异常状态补充输入 */}
                      {meta.anomalyStatus === "abnormal" && (
                        <div className="flex flex-col gap-1.5 rounded-lg bg-amber-50/60 p-2 border border-amber-200/50">
                          <div className="flex flex-col gap-0.5">
                            <Label
                              htmlFor="platform_notice_desktop"
                              className="text-[11.5px] font-medium text-amber-950/80"
                            >
                              平台通知 (选填)
                            </Label>
                            <Input
                              id="platform_notice_desktop"
                              value={meta.platformNotice || ""}
                              onChange={(e) =>
                                updateMeta("platformNotice", e.target.value)
                              }
                              placeholder="如处罚通知文案"
                              className="h-7.5 rounded bg-white/90 border-amber-200/60 text-[11.5px] text-[#292524] placeholder:text-[#78716C] focus:bg-white focus:border-amber-400"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <Label
                              htmlFor="appeal_desktop"
                              className="text-[11.5px] font-medium text-amber-950/80"
                            >
                              申诉进展 (选填)
                            </Label>
                            <Input
                              id="appeal_desktop"
                              value={meta.appeal || ""}
                              onChange={(e) =>
                                updateMeta("appeal", e.target.value)
                              }
                              placeholder="如申诉处理中"
                              className="h-7.5 rounded bg-white/90 border-amber-200/60 text-[11.5px] text-[#292524] placeholder:text-[#78716C] focus:bg-white focus:border-amber-400"
                            />
                          </div>
                        </div>
                      )}

                      {/* 展开更多设置 (Accordion) */}
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setIsMoreSettingsExpanded(!isMoreSettingsExpanded)
                          }
                          className="flex items-center gap-1 text-[11.5px] font-medium text-[#78716C] hover:text-[#292524] transition-colors focus-visible:outline-none cursor-pointer"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3 stroke-[1.5] transition-transform duration-150",
                              isMoreSettingsExpanded && "rotate-180",
                            )}
                          />
                          {isMoreSettingsExpanded
                            ? "收起更多设置"
                            : "展开更多设置"}
                        </button>

                        <AnimatePresence initial={false}>
                          {isMoreSettingsExpanded && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="space-y-1.5 pt-1.5"
                            >
                              <div className="space-y-0.5">
                                <Label
                                  htmlFor="published_at_desktop"
                                  className="text-[11.5px] font-medium text-[#292524]"
                                >
                                  发布时间
                                </Label>
                                <Input
                                  id="published_at_desktop"
                                  type="datetime-local"
                                  step={3600}
                                  value={meta.publishedAt}
                                  onChange={(event) => {
                                    const nextPublishedAt = event.target.value;
                                    const synced = syncPublishedAtAndText({
                                      nextPublishedAt,
                                      nextPublishedAtText: meta.publishedAtText,
                                      changedField: "published_at",
                                    });
                                    setMeta((current) => ({
                                      ...current,
                                      bizDate:
                                        preserveBizDateWhenPublishedAtChanges(
                                          current.bizDate,
                                        ),
                                      publishedAt: synced.publishedAt,
                                      publishedAtText: synced.publishedAtText,
                                    }));
                                  }}
                                  className="h-7.5 rounded bg-white/90 border-[#E5E0D6] text-[11.5px] text-[#292524] focus:bg-white focus:border-[#E5E0D6] transition-colors duration-100"
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-[#78716C] pt-0.5 px-0.5">
                                <span>上传时间戳</span>
                                <span className="tabular-nums text-[#78716C] font-normal">
                                  {meta.uploadedAt || "--"}
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* ===== 【右栏 (桌面端 lg: 独占 1fr 核心数据填报、标题、文案卡片与提交栏)】 ===== */}
                  <div className="flex flex-col space-y-2.5 sm:space-y-3.5 min-w-0">
                    {/* 1. 核心数据填报区 (3-4-4 紧凑矩阵) */}
                    <div ref={metricsSectionRef} className="space-y-1.5 pt-0.5">
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

                    {/* 2. 视频标题 (通栏一行，头顶呼吸断层留白 > 脚下留白) */}
                    <div
                      ref={metaSectionRef}
                      className="pt-2 sm:pt-3 space-y-0.5 shrink-0 rounded-xl p-0 transition-colors data-[missing=true]:border data-[missing=true]:border-[#DC2626]/40 data-[missing=true]:bg-rose-50/40 data-[missing=true]:p-2"
                      data-missing={
                        hasAttemptedSubmit &&
                        meta.anomalyStatus !== "abnormal" &&
                        issueSummary.missingRequiredMeta.includes("videoTitle")
                      }
                    >
                      <Label
                        htmlFor="video_title"
                        className="text-[11.5px] sm:text-[12.5px] font-medium text-[#292524]"
                      >
                        视频标题{" "}
                        {meta.anomalyStatus !== "abnormal" && (
                          <span className="text-[#DC2626]">*</span>
                        )}
                      </Label>
                      <Input
                        id="video_title"
                        value={meta.videoTitle}
                        onChange={(event) =>
                          updateMeta("videoTitle", event.target.value)
                        }
                        placeholder="输入视频标题"
                        className="h-7.5 sm:h-8.5 min-h-[30px] sm:min-h-0 rounded-lg bg-white border border-[#E5E0D6] shadow-2xs hover:border-[#78716C]/50 text-[11.5px] sm:text-[13px] text-[#292524] placeholder:text-[#78716C]/60 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 transition-all duration-150"
                        aria-invalid={
                          hasAttemptedSubmit &&
                          meta.anomalyStatus !== "abnormal" &&
                          issueSummary.missingRequiredMeta.includes(
                            "videoTitle",
                          )
                            ? "true"
                            : "false"
                        }
                      />
                      {hasAttemptedSubmit &&
                      meta.anomalyStatus !== "abnormal" &&
                      issueSummary.missingRequiredMeta.includes(
                        "videoTitle",
                      ) ? (
                        <p
                          id="video_title_error"
                          role="alert"
                          className="text-[10.5px] font-medium text-[#C0685C]"
                        >
                          待填写视频标题
                        </p>
                      ) : null}
                    </div>

                    {/* 3. 移动端专用的 50/50 紧凑双卡片 (lg:hidden) */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 items-stretch lg:hidden">
                      {/* 移动端左栏：团队分工与标签属性区 (50% 空间) */}
                      <div className="min-w-0 rounded-xl border border-[#ECE7DE] bg-white/90 shadow-2xs p-2 sm:p-2.5 space-y-1 sm:space-y-1.5 flex flex-col justify-between h-full">
                        {/* 团队分工 */}
                        <div className="space-y-0.5 sm:space-y-1 pt-0.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11.5px] sm:text-[12.5px] font-semibold text-[#292524] select-none truncate">
                              团队分工
                            </Label>

                            {!hasAnyVisibleRole ? (
                              <button
                                type="button"
                                onClick={showAllRoles}
                                className="inline-flex min-h-[26px] min-w-[26px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-0.5 text-[10.5px] sm:text-[12px] font-medium text-[#D97757] hover:underline transition-colors duration-100 cursor-pointer"
                              >
                                <Plus className="size-2.5 stroke-[2.5]" />
                                <span>+ 指派</span>
                              </button>
                            ) : null}
                          </div>

                          {!hasAnyVisibleRole ? (
                            <div className="text-[10.5px] sm:text-[12px] text-[#78716C] py-0.5 truncate">
                              由我独立完成 (全包)
                            </div>
                          ) : (
                            <div className="space-y-1 pt-0.5">
                              {isScriptAuthorVisible && (
                                <RoleItemSelectorRow
                                  label="文案"
                                  icon={<FileText className="size-3.5 text-[#78716C] stroke-[1.75]" />}
                                  roleKey="script_author"
                                  selectedUserId={meta.scriptAuthorUserId}
                                  operatorMembers={operatorMembers}
                                  userId={userId}
                                  onOpenSelector={() =>
                                    setSelectingRole({
                                      role: "script_author",
                                      label: "文案",
                                      selectedUserId: meta.scriptAuthorUserId,
                                    })
                                  }
                                  onResetSelf={() => hideRole("script_author")}
                                />
                              )}

                              {isVideoEditorVisible && (
                                <RoleItemSelectorRow
                                  label="剪辑"
                                  icon={<Scissors className="size-3.5 text-[#78716C] stroke-[1.75]" />}
                                  roleKey="video_editor"
                                  selectedUserId={meta.videoEditorUserId}
                                  operatorMembers={operatorMembers}
                                  userId={userId}
                                  onOpenSelector={() =>
                                    setSelectingRole({
                                      role: "video_editor",
                                      label: "剪辑",
                                      selectedUserId: meta.videoEditorUserId,
                                    })
                                  }
                                  onResetSelf={() => hideRole("video_editor")}
                                />
                              )}

                              {isOperatorVisible && (
                                <RoleItemSelectorRow
                                  label="运营"
                                  icon={<Rocket className="size-3.5 text-[#78716C] stroke-[1.75]" />}
                                  roleKey="operator"
                                  selectedUserId={meta.operatorUserId}
                                  operatorMembers={operatorMembers}
                                  userId={userId}
                                  onOpenSelector={() =>
                                    setSelectingRole({
                                      role: "operator",
                                      label: "运营",
                                      selectedUserId: meta.operatorUserId,
                                    })
                                  }
                                  onResetSelf={() => hideRole("operator")}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        {/* 题材与形式记忆配置 */}
                        <div className="space-y-1 pt-1 border-t border-[#ECE7DE]/60">
                          {!isMemoryExpanded ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] sm:text-[11.5px] text-[#292524] font-medium">
                                  题材形式：
                                </span>
                                <span className="bg-white/90 border border-[#E5E0D6]/80 text-[#292524] rounded px-1.5 py-0.2 text-[10.5px] sm:text-[11px] font-medium shadow-2xs">
                                  {meta.topicTag || "未选"}
                                </span>
                                <span className="text-[#E5E0D6] text-[9px]">·</span>
                                <span className="bg-white/90 border border-[#E5E0D6]/80 text-[#292524] rounded px-1.5 py-0.2 text-[10.5px] sm:text-[11px] font-medium shadow-2xs">
                                  {meta.videoForm || "未选"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsMemoryExpanded(true)}
                                className="text-[11px] sm:text-[11.5px] font-medium text-[#D97757] hover:text-[#C46A4D] transition-colors cursor-pointer min-h-[30px] min-w-[30px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center"
                              >
                                修改
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1.5 rounded-lg bg-[#F5F3EE]/70 p-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-[#292524]">
                                  题材标签 *
                                </Label>
                                <div className="grid grid-cols-2 gap-1">
                                  {(["干货", "复盘"] as const).map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() =>
                                        updateMeta(
                                          "topicTag",
                                          meta.topicTag === tag ? "" : tag,
                                        )
                                      }
                                      className={cn(
                                        "h-7 min-h-[28px] sm:min-h-0 rounded border text-[11px] font-medium transition-colors duration-100 cursor-pointer inline-flex items-center justify-center",
                                        meta.topicTag === tag
                                          ? "border-[#E5E0D6]/80 bg-white text-[#1C1917] font-medium shadow-2xs"
                                          : "border-transparent text-[#292524] hover:bg-[#E5E0D6]/50 hover:text-[#1C1917]",
                                      )}
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-[#292524]">
                                  视频形式 *
                                </Label>
                                <div className="grid grid-cols-2 gap-1">
                                  {(["出镜", "图文"] as const).map((form) => (
                                    <button
                                      key={form}
                                      type="button"
                                      onClick={() => updateMeta("videoForm", form)}
                                      className={cn(
                                        "h-7 min-h-[28px] sm:min-h-0 rounded border text-[11px] font-medium transition-colors duration-100 cursor-pointer inline-flex items-center justify-center",
                                        meta.videoForm === form
                                          ? "border-[#E5E0D6]/80 bg-white text-[#1C1917] font-medium shadow-2xs"
                                          : "border-transparent text-[#292524] hover:bg-[#E5E0D6]/50 hover:text-[#1C1917]",
                                      )}
                                    >
                                      {form}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="flex justify-end pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => setIsMemoryExpanded(false)}
                                  className="text-[11px] font-medium text-[#78716C] hover:text-[#292524] cursor-pointer min-h-[30px] min-w-[30px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center"
                                >
                                  完成
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 异常状态补充输入 */}
                        {meta.anomalyStatus === "abnormal" && (
                          <div className="flex flex-col gap-1 rounded-lg bg-amber-50/60 p-1.5 border border-amber-200/50">
                            <div className="flex flex-col gap-0.5">
                              <Label
                                htmlFor="platform_notice"
                                className="text-[11px] font-medium text-amber-950/80"
                              >
                                平台通知 (选填)
                              </Label>
                              <Input
                                id="platform_notice"
                                value={meta.platformNotice || ""}
                                onChange={(e) =>
                                  updateMeta("platformNotice", e.target.value)
                                }
                                placeholder="如处罚通知文案"
                                className="h-7 rounded bg-white/90 border-amber-200/60 text-[11px] text-[#292524] placeholder:text-[#78716C] focus:bg-white focus:border-amber-400"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <Label
                                htmlFor="appeal"
                                className="text-[11px] font-medium text-amber-950/80"
                              >
                                申诉进展 (选填)
                              </Label>
                              <Input
                                id="appeal"
                                value={meta.appeal || ""}
                                onChange={(e) =>
                                  updateMeta("appeal", e.target.value)
                                }
                                placeholder="如申诉处理中"
                                className="h-7 rounded bg-white/90 border-amber-200/60 text-[11px] text-[#292524] placeholder:text-[#78716C] focus:bg-white focus:border-amber-400"
                              />
                            </div>
                          </div>
                        )}

                        {/* 展开更多设置 (Accordion) */}
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setIsMoreSettingsExpanded(!isMoreSettingsExpanded)
                            }
                            className="flex min-h-[30px] min-w-[30px] sm:min-h-0 sm:min-w-0 items-center gap-1 text-[11px] sm:text-[11.5px] font-medium text-[#78716C] hover:text-[#292524] transition-colors focus-visible:outline-none cursor-pointer"
                          >
                            <ChevronDown
                              className={cn(
                                "size-3 stroke-[1.5] transition-transform duration-150",
                                isMoreSettingsExpanded && "rotate-180",
                              )}
                            />
                            {isMoreSettingsExpanded
                              ? "收起更多设置"
                              : "展开更多设置"}
                          </button>

                          <AnimatePresence initial={false}>
                            {isMoreSettingsExpanded && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-1.5 pt-1"
                              >
                                <div className="space-y-0.5">
                                  <Label
                                    htmlFor="published_at"
                                    className="text-[11px] font-medium text-[#292524]"
                                  >
                                    发布时间
                                  </Label>
                                  <Input
                                    id="published_at"
                                    type="datetime-local"
                                    step={3600}
                                    value={meta.publishedAt}
                                    onChange={(event) => {
                                      const nextPublishedAt = event.target.value;
                                      const synced = syncPublishedAtAndText({
                                        nextPublishedAt,
                                        nextPublishedAtText: meta.publishedAtText,
                                        changedField: "published_at",
                                      });
                                      setMeta((current) => ({
                                        ...current,
                                        bizDate:
                                          preserveBizDateWhenPublishedAtChanges(
                                            current.bizDate,
                                          ),
                                        publishedAt: synced.publishedAt,
                                        publishedAtText: synced.publishedAtText,
                                      }));
                                    }}
                                    className="h-7 rounded bg-white/90 border-[#E5E0D6]/80 text-[11px] text-[#292524] focus:bg-white focus:border-[#E5E0D6] transition-colors duration-100"
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[10.5px] text-[#78716C] pt-0.5 px-0.5">
                                  <span>上传时间戳</span>
                                  <span className="tabular-nums text-[#78716C] font-normal">
                                    {meta.uploadedAt || "--"}
                                  </span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* 移动端右栏：视频文案创作区 (50% 空间，与左侧卡片完全对称) */}
                      <div
                        className="min-w-0 rounded-xl border border-[#ECE7DE] bg-white/90 shadow-2xs p-2 sm:p-2.5 flex flex-col justify-between h-full transition-colors data-[missing=true]:border-[#DC2626]/40 data-[missing=true]:bg-rose-50/40"
                        data-missing={
                          hasAttemptedSubmit &&
                          issueSummary.missingRequiredMeta.includes("content")
                        }
                      >
                        {/* 文案头部 (与左侧团队分工头部高度与风格完全一致) */}
                        <div className="flex items-center justify-between shrink-0 pt-0.5">
                          <Label
                            htmlFor="content"
                            className="text-[11.5px] sm:text-[12.5px] font-semibold text-[#292524] select-none truncate"
                          >
                            视频文案 <span className="text-[#DC2626]">*</span>
                          </Label>
                          <button
                            type="button"
                            onClick={handlePasteContent}
                            className={cn(
                              "inline-flex min-h-[26px] min-w-[26px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1 text-[10.5px] sm:text-[12px] font-medium transition-colors duration-150 focus-visible:outline-none cursor-pointer py-0.5 px-1",
                              isPastedFeedback
                                ? "text-[#16A34A] font-medium"
                                : "text-[#78716C] hover:text-[#292524]"
                            )}
                          >
                            {isPastedFeedback ? (
                              <>
                                <Check size={12} className="stroke-[2.5] text-[#16A34A]" />
                                <span>已粘贴</span>
                              </>
                            ) : (
                              <>
                                <ClipboardPaste size={12} className="stroke-[1.5]" />
                                <span>一键粘贴</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="mt-2 flex-1 flex flex-col min-h-0">
                          <textarea
                            id="content_desktop"
                            value={meta.content}
                            onChange={(event) =>
                              updateMeta("content", event.target.value)
                            }
                            placeholder="粘贴或输入视频文案..."
                            className="w-full min-h-[140px] resize-none bg-transparent border-0 outline-none text-[13px] leading-[1.6] tracking-[0.005em] text-[#292524] placeholder:text-[#78716C]/60 focus:ring-0 focus-visible:ring-0 p-0 overflow-y-auto custom-scrollbar"
                            aria-invalid={
                              hasAttemptedSubmit &&
                              issueSummary.missingRequiredMeta.includes("content")
                                ? "true"
                                : "false"
                            }
                          />
                          {hasAttemptedSubmit &&
                          issueSummary.missingRequiredMeta.includes("content") ? (
                            <p
                              id="content_desktop_error"
                              role="alert"
                              className="mt-0.5 text-[11px] font-medium text-[#C0685C] shrink-0"
                            >
                              待填写视频文案
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 底部内嵌操作栏 (单行左右两端对齐，左侧提示与左卡片/截图左对齐，右侧提交按钮与右卡片/截图右对齐) */}
                <div className="flex items-center justify-between gap-2 pt-3 sm:pt-3.5 border-t border-[#ECE7DE]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!canActuallySubmit ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B98A54]/25 bg-[#B98A54]/10 px-2.5 py-1 text-[11px] sm:text-[11.5px] font-medium text-[#B98A54] truncate">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#B98A54] shrink-0" />
                        <span className="truncate">{issueSummary.reason || "待补全必要信息"}</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6FAA7D]/25 bg-[#6FAA7D]/10 px-2.5 py-1 text-[11px] sm:text-[11.5px] font-medium text-[#6FAA7D] shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
                          <span>已就绪</span>
                        </span>
                        <span className="hidden sm:inline text-[11.5px] text-[#78716C]">
                          (⌘+Enter)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isBackfillMode || submittedViewActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        className="h-8 sm:h-9 rounded-lg px-3 sm:px-4 text-[11.5px] sm:text-[12.5px] font-medium"
                      >
                        取消
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={triggerSubmit}
                      disabled={isSubmitting || !canActuallySubmit}
                      className="h-8.5 sm:h-9 rounded-lg px-4 sm:px-5 text-[12px] sm:text-[12.5px] font-semibold sm:font-medium bg-[#D97757] hover:bg-[#C46A4D] text-white disabled:opacity-40 disabled:bg-[#D97757] disabled:text-white disabled:cursor-not-allowed active:scale-[0.985] transition-all duration-150 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                    >
                      {isSubmitting && (
                        <Loader2 className="size-3.5 animate-spin shrink-0 text-white" />
                      )}
                      <span>{submitButtonLabel}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 岗位成员选择受控弹窗 (Portal 居中渲染，100% 不飘走、不遮挡、支持即时搜索) */}
            <Dialog
              open={Boolean(selectingRole)}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectingRole(null);
                  setMemberSearchQuery("");
                }
              }}
            >
              <DialogContent className="max-w-sm rounded-2xl bg-white p-4 shadow-claude-modal max-sm:w-[92%]">
                <DialogHeader className="pb-2 border-b border-[#ECE7DE]">
                  <DialogTitle className="text-[14px] font-semibold text-[#1C1917]">
                    选择{selectingRole?.label}负责人
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-2.5 pt-2">
                  {/* 搜索框 */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
                    <Input
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="搜索团队成员..."
                      className="h-8.5 rounded-lg border-[#E5E0D6] bg-[#FAF8F5] pl-8 text-[12.5px] text-[#292524] placeholder:text-[#78716C]/60 focus:bg-white"
                    />
                  </div>

                  {/* 成员列表 */}
                  <div className="max-h-[220px] overflow-y-auto space-y-1 custom-scrollbar">
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
                          "w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[12.5px] transition-colors cursor-pointer text-left",
                          selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId
                            ? "bg-[#D97757]/10 text-[#D97757] font-medium"
                            : "hover:bg-[#FAF8F5] text-[#292524]",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">阿禅</span>
                          <span className="rounded bg-[#D97757]/15 px-1.5 py-0.2 text-[10px] text-[#D97757]">
                            本人
                          </span>
                        </div>
                        {(selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId) && (
                          <Check className="size-3.5 stroke-[2.5]" />
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
                              "w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[12.5px] transition-colors cursor-pointer text-left",
                              isSelected
                                ? "bg-[#D97757]/10 text-[#D97757] font-medium"
                                : "hover:bg-[#FAF8F5] text-[#292524]",
                            )}
                          >
                            <span>{member.display_name || member.name}</span>
                            {isSelected && <Check className="size-3.5 stroke-[2.5]" />}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </motion.form>
        </>
      )}
    </>
  );
}

const VIDEO_STATUS_OPTIONS: Array<{
  value: AnomalyStatus;
  label: string;
  dotClass: string;
  activeTextClass: string;
}> = [
  {
    value: "normal",
    label: "正常",
    dotClass: "bg-[#16A34A]",
    activeTextClass: "text-[#292524]",
  },
  {
    value: "abnormal",
    label: "异常",
    dotClass: "bg-[#D99E55]",
    activeTextClass: "text-[#D99E55]",
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
      className="inline-flex items-center gap-1 rounded-xl bg-[#F5F3EE]/70 p-1 select-none"
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
              "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium tracking-tight transition-colors duration-100 ease-out cursor-pointer",
              isActive
                ? cn(
                    "bg-white text-[#1C1917] font-medium",
                    option.activeTextClass,
                  )
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E5E0D6]/50",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                option.dotClass,
                !isActive && "opacity-60",
              )}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface RoleItemSelectorRowProps {
  label: string;
  icon?: React.ReactNode;
  roleKey: "script_author" | "video_editor" | "operator";
  selectedUserId: string | null;
  operatorMembers: OperatorMember[];
  userId: string;
  onOpenSelector: () => void;
  onResetSelf: () => void;
}

function RoleItemSelectorRow({
  label,
  icon,
  selectedUserId,
  operatorMembers,
  userId,
  onOpenSelector,
  onResetSelf,
}: RoleItemSelectorRowProps) {
  const currentMember =
    operatorMembers.find((m) => m.id === selectedUserId) || null;
  const isExternal = Boolean(selectedUserId && selectedUserId !== userId);

  return (
    <div className="flex items-center justify-between gap-1.5 py-0.5">
      {/* 左侧岗位 */}
      <div className="flex items-center gap-1 text-[11px] sm:text-[12px] font-medium text-[#292524] shrink-0 select-none">
        {icon}
        <span>{label}</span>
      </div>

      {/* 右侧人员触发按钮 (点击呼出 Portal 居中弹窗，100% 杜绝原生 select 错位) */}
      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
        <button
          type="button"
          onClick={onOpenSelector}
          className="flex h-7 sm:h-7.5 min-h-[28px] sm:min-h-0 w-full max-w-[175px] min-w-[76px] sm:min-w-[110px] items-center justify-between rounded-md bg-[#FBF9F5] hover:bg-white border border-[#E5E0D6]/80 hover:border-[#78716C]/40 px-2 text-[11px] sm:text-[12px] font-medium text-[#292524] shadow-2xs outline-none focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 transition-colors cursor-pointer"
        >
          <span className="truncate">
            {currentMember
              ? `${currentMember.display_name || currentMember.name}${currentMember.id === userId ? " (我)" : ""}`
              : "阿禅 (我)"}
          </span>
          <ChevronDown className="size-3 text-[#78716C] shrink-0 ml-1" />
        </button>

        {isExternal ? (
          <button
            type="button"
            onClick={onResetSelf}
            title="恢复由我完成"
            className="flex min-h-[26px] min-w-[26px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded text-[#78716C] hover:text-[#DC2626] hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
          >
            <X className="size-3 stroke-[2]" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

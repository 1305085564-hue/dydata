"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronUp, Sparkles, Loader2, XCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { MotionCard } from "@/components/ui/motion-card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getDefaultPublishedAtValue } from "@/lib/日报";
import type {
  AnomalyStatus,
  Video,
  VideoTagReviewDimension,
} from "@/types";

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
  NETWORK_RETRY_MESSAGE,
  OCR_FAIL_MESSAGE,
  resolveOcrErrorMessage,
  toSlotUploadErrorMessage,
} from "@/components/submission/截图上传错误";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useNotifications } from "@/components/notifications/notification-store";
import {
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import { normalizeOptionalText } from "./video-submit-form-state";

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
  account: { id: string; name: string; display_name: string; content_direction: string | null } | null;
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
    confidence?: Partial<Record<"play_count" | "likes" | "comments" | "shares" | "favorites" | "follower_gain" | "follower_convert", "high" | "medium" | "low">>;
    error?: string;
    error_code?: string;
  };
  error?: string;
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
  contentKeywords: string[];
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
};

const ANOMALY_OPTIONS: AnomalyStatus[] = ["正常", "删稿", "限流", "投流"];
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
  screenshot_1: "截图1",
  screenshot_2: "截图2",
  screenshot_3: "截图3",
};

const VIDEO_STATUS_LABELS: Record<AnomalyStatus, string> = {
  正常: "正常发布",
  删稿: "删稿",
  限流: "限流",
  投流: "投流",
  活动干预: "活动干预",
  未满24h: "未满24小时",
};

function createInitialMeta(today: string): FormMetaState {
  const publishedAt = getDefaultPublishedAtValue();
  const defaultBizDate = getDatePartFromDateTimeLocal(publishedAt) ?? today;

  return {
    videoUrl: "",
    videoTitle: "",
    content: "",
    bizDate: defaultBizDate,
    publishedAt,
    publishedAtText: "",
    anomalyStatus: "正常",
    uploadedAt: new Date().toLocaleString("zh-CN"),
    topicTag: "复盘",
    contentKeywords: [],
  };
}

function getDatePartFromDateTimeLocal(value: string) {
  const [datePart = ""] = value.split("T");
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

function extractKeywordSuggestions(content: string): string[] {
  if (!content.trim()) return [];
  const words = content
    .split(/[\s，。！？、；：""''（）【】\n]+/)
    .filter((w) => w.length >= 2);
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function parseMetric(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isVideo(value: unknown): value is Video {
  return !!value && typeof value === "object" && "id" in value && "account_id" in value;
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
  recognizedFields: Record<string, unknown> | null | undefined
): string[] {
  if (!recognizedFields) {
    return [];
  }

  if (screenshotType === "curve") {
    return [
      recognizedFields.curve_pattern ? `曲线类型：${recognizedFields.curve_pattern}` : null,
      recognizedFields.first_peak_position ? `首峰位置：${recognizedFields.first_peak_position}` : null,
      recognizedFields.drop_severity ? `掉速程度：${recognizedFields.drop_severity}` : null,
      recognizedFields.tail_strength ? `长尾强弱：${recognizedFields.tail_strength}` : null,
    ].filter((item): item is string => Boolean(item));
  }

  if (screenshotType === "retention") {
    const retentionMetrics = recognizedFields.retention_metrics as Record<string, number | null> | undefined;
    const retentionAnalysis = recognizedFields.retention_analysis as
      | {
          bounce_peak_time?: string | null;
          replay_peak_time?: string | null;
          segment_summary?: Array<{ segment?: string; performance?: string }>;
        }
      | undefined;

    const firstSegment = retentionAnalysis?.segment_summary?.[0];

    return [
      retentionMetrics?.avg_play_duration != null ? `均播时长：${retentionMetrics.avg_play_duration}秒` : null,
      retentionMetrics?.bounce_rate_2s != null ? `2秒跳出率：${retentionMetrics.bounce_rate_2s}%` : null,
      retentionMetrics?.completion_rate_5s != null ? `5秒完播率：${retentionMetrics.completion_rate_5s}%` : null,
      retentionMetrics?.completion_rate != null ? `整体完播率：${retentionMetrics.completion_rate}%` : null,
      retentionAnalysis?.bounce_peak_time ? `跳出峰值：${retentionAnalysis.bounce_peak_time}` : null,
      retentionAnalysis?.replay_peak_time ? `回放峰值：${retentionAnalysis.replay_peak_time}` : null,
      firstSegment?.segment && firstSegment?.performance
        ? `分段摘要：${firstSegment.segment}${firstSegment.performance}`
        : null,
    ].filter((item): item is string => Boolean(item));
  }

  const baseSummary = Object.entries(recognizedFields)
    .filter(([key, value]) => value !== null && value !== undefined && value !== "" && key !== "curve_info" && key !== "retention_info")
    .slice(0, 4)
    .map(([key, value]) => `${key}：${String(value)}`);

  const curveInfo = recognizedFields.curve_info as unknown as Record<string, string | null> | undefined;
  const retentionInfo = recognizedFields.retention_info as unknown as Record<string, string | null> | undefined;

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
    screenshot_3: { ...initial.screenshot_3 },
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
  submitted: boolean
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

  return payload.data.url;
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

function buildIssueMessages(summary: ReturnType<typeof summarizeSubmissionIssues>) {
  const messages: string[] = [];

  if (summary.missingRequiredSlots.length > 0) {
    messages.push(`必传截图缺失：${summary.missingRequiredSlots.map((role) => SLOT_LABELS[role]).join("、")}`);
  }

  if (summary.failedRequiredSlots.length > 0) {
    messages.push(`识别失败：${summary.failedRequiredSlots.map((role) => SLOT_LABELS[role]).join("、")}`);
  }

  if (summary.pendingSlotConfirmations.length > 0) {
    messages.push(`待确认截图：${summary.pendingSlotConfirmations.map((role) => SLOT_LABELS[role]).join("、")}`);
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
  if (summary.missingRequiredMeta.includes("contentKeywords")) {
    messages.push("必填项未完成：内容标签");
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
  const supabase = useMemo(() => createClient(), []);
  const [meta, setMeta] = useState<FormMetaState>(() => createInitialMeta(today));
  const [fields, setFields] = useState<SubmissionState["fields"]>(() => createEditableFields());
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, SlotViewState>>(() => createEditableSlots());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submittedVideo, setSubmittedVideo] = useState<Video | null>(null);
  const [qualityCheck, setQualityCheck] = useState<{
    data: SampleQualityResponse | null;
    loading: boolean;
  }>({ data: null, loading: false });
  const [deleteTargetRole, setDeleteTargetRole] = useState<SubmissionSlotRole | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [focusedRole, setFocusedRole] = useState<SubmissionSlotRole | null>(null);
  const [highlightedOcrIndex, setHighlightedOcrIndex] = useState<number | null>(null);
  const [scriptText, setScriptText] = useState("");
  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsSectionRef = useRef<HTMLDivElement | null>(null);
  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const isBackfillMode = mode === "backfill";
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const draftKey = useMemo(() => `dydata.draft.videoSubmit.${userId}`, [userId]);

  type DraftData = {
    meta: FormMetaState;
    fields: SubmissionState["fields"];
    slots: Record<SubmissionSlotRole, SlotViewState>;
    scriptText: string;
    keywordInput: string;
  };

  const draftData: DraftData = useMemo(
    () => ({
      meta,
      fields,
      slots: {
        screenshot_1: { ...slots.screenshot_1, file: null, previewUrl: null },
        screenshot_2: { ...slots.screenshot_2, file: null, previewUrl: null },
        screenshot_3: { ...slots.screenshot_3, file: null, previewUrl: null },
      },
      scriptText,
      keywordInput,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, fields, slots, scriptText, keywordInput]
  );

  const { hasDraft, restoreDraft, clearDraft, lastSavedAt } = useFormDraft<DraftData>(
    draftKey,
    draftData,
    [meta, fields, slots, scriptText, keywordInput]
  );

  const { setLocalNotification } = useNotifications();

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (!draft) return;

    setMeta(draft.meta);
    setFields(draft.fields);
    setSlots((current) => ({
      screenshot_1: { ...current.screenshot_1, ...draft.slots.screenshot_1, file: null, previewUrl: null },
      screenshot_2: { ...current.screenshot_2, ...draft.slots.screenshot_2, file: null, previewUrl: null },
      screenshot_3: { ...current.screenshot_3, ...draft.slots.screenshot_3, file: null, previewUrl: null },
    }));
    setScriptText(draft.scriptText);
    setKeywordInput(draft.keywordInput);
    feedbackToast.success("草稿已恢复");
  }, [restoreDraft]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

  // 草稿状态 → 通知中心本地条目（不再占用主页空间）
  useEffect(() => {
    const shouldShow = hasDraft && !isSubmitted && !submittedViewActive && !initialSummary;
    if (shouldShow) {
      const time = lastSavedAt
        ? lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
        : "";
      setLocalNotification(`draft.video_submit.${userId}`, {
        key: `draft.video_submit.${userId}`,
        type: "draft.video_submit",
        category: "todo",
        severity: "warning",
        title: "未提交的填报草稿",
        body: time ? `最后保存于 ${time}，是否恢复继续填写？` : "是否恢复继续填写？",
        primaryActionLabel: "恢复草稿",
        primaryAction: handleRestoreDraft,
        secondaryActionLabel: "丢弃",
        secondaryAction: handleDiscardDraft,
      });
    } else {
      setLocalNotification(`draft.video_submit.${userId}`, null);
    }
  }, [
    hasDraft,
    isSubmitted,
    submittedViewActive,
    initialSummary,
    lastSavedAt,
    userId,
    handleRestoreDraft,
    handleDiscardDraft,
    setLocalNotification,
  ]);

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

    const nextMeta = createInitialMeta(today);
    if (isBackfillMode) {
      nextMeta.bizDate = initialBizDate ?? "";
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
    setSlots(createEditableSlots());
    setIsSubmitted(false);
    setSubmittedVideo(null);
    setQualityCheck({ data: null, loading: false });
    setDeleteTargetRole(null);
    setKeywordInput("");
    setScriptText("");
    setFocusedRole(null);
  }, [account?.id, initialBizDate, initialSummary, isBackfillMode, today, submittedViewActive]);

  const keywordSuggestions = useMemo(() => extractKeywordSuggestions(meta.content), [meta.content]);
  const submissionState = buildSubmissionState(slots, fields, isSubmitted);
  const screenshotsRequired = areSubmissionScreenshotsRequired(meta.anomalyStatus);
  const issueSummary = useMemo(
    () =>
      summarizeSubmissionIssues(submissionState, {
        topicTag: meta.topicTag,
        anomalyStatus: meta.anomalyStatus,
        videoTitle: meta.videoTitle,
        content: meta.content,
        contentKeywords: meta.contentKeywords,
      }),
    [submissionState, meta.topicTag, meta.anomalyStatus, meta.videoTitle, meta.content, meta.contentKeywords]
  );
  const submitCheck = canSubmit(submissionState, {
    anomalyStatus: meta.anomalyStatus,
  });
  const canActuallySubmit = issueSummary.canSubmit;
  const issueMessages = useMemo(() => buildIssueMessages(issueSummary), [issueSummary]);
  const issueHintText = useMemo(() => buildIssueHintText(issueMessages), [issueMessages]);
  const submitButtonLabel = isSubmitting
    ? "提交中..."
    : isBackfillMode
      ? "提交补交数据"
      : initialSummary
        ? "保存修改"
        : "提交今日数据";

  function updateMeta<Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) {
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

  function scrollToIssueAnchor(anchor: "slots" | "metrics" | "topicTag" | "meta" | null) {
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

  function handleFieldFocus(key: EditableMetricKey) {
    if (["play_count", "follower_gain", "likes", "comments", "shares", "favorites"].includes(key)) {
      setFocusedRole("screenshot_1");
    } else if (["avg_play_duration", "bounce_rate_2s", "completion_rate_5s", "completion_rate"].includes(key)) {
      setFocusedRole("screenshot_2");
    } else if (key === "follower_convert") {
      setFocusedRole("screenshot_3");
    }
    // 计算左侧 ocrSummary 高亮索引
    const slot = focusedRole ? slots[focusedRole] : null;
    if (slot?.ocrSummary) {
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
      if (keyword) {
        const idx = slot.ocrSummary.findIndex((line) => line.includes(keyword));
        setHighlightedOcrIndex(idx >= 0 ? idx : null);
      }
    }
  }

  function handleFieldBlur() {
    setFocusedRole(null);
    setHighlightedOcrIndex(null);
  }

  async function handleQualityCheck() {
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
      setSlots((current) => ({
        ...current,
        screenshot_1: { ...createEditableSlots().screenshot_1 },
        screenshot_2: { ...createEditableSlots().screenshot_2 },
        screenshot_3: { ...createEditableSlots().screenshot_3 },
      }));
    } else if (issue.suggestedFix === "manual_review") {
      toast.message("请联系管理员复核");
    }
  }

  function applyOverviewFields(
    recognizedFields: Record<string, string | number | boolean | null>,
    confidence?: OcrData["confidence"]
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
            confidenceScore: mapConfidenceToScore(confidence?.[key as keyof typeof confidence]),
          };
        }
      }

      return next;
    });
  }

  async function handleSlotUpload(role: SubmissionSlotRole, file: File) {
    if (!account) {
      feedbackToast.error("请先选择提交账号");
      return;
    }

    // Revoke old blob URL for this slot to avoid leak when uploading a new file over an existing one
    const oldUrl = slots[role]?.previewUrl ?? slots[role]?.assetUrl;
    if (oldUrl && oldUrl.startsWith("blob:")) {
      URL.revokeObjectURL(oldUrl);
      blobUrlsRef.current.delete(oldUrl);
    }

    setSlots((current) => ({
      ...current,
      [role]: {
        ...current[role],
        status: "uploading",
        fileName: file.name,
        file,
        error: null,
      },
    }));

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user && !userId) {
        throw new Error("登录状态已失效，请刷新页面后重试");
      }

      setSlots((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: "recognizing",
        },
      }));

      const assetUrl = await uploadSubmissionScreenshot({
        accountId: account.id,
        role,
        file,
      });
      const previewUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(previewUrl);

      feedbackToast.success("截图已保存，正在识别", {
        duration: 2000,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-sm",
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("asset_role", role);

      const response = await fetch("/api/ocr-screenshot", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as OcrApiPayload;
      if (!response.ok || !payload.data) {
        throw new Error(toSlotUploadErrorMessage(payload.error));
      }

      const { data } = payload;
      const detectedType = data.screenshot_type;
      const ocrSummary = buildOcrSummary(detectedType, data.recognized_fields);

      const resolvedError = data.error_code
        ? resolveOcrErrorMessage(data.error_code)
        : data.error
          ? toSlotUploadErrorMessage(data.error)
          : null;

      setSlots((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: data.slot_status,
          confirmed: data.slot_status === "confirmed",
          requiresManualConfirmation: data.requires_manual_confirmation,
          confidenceScore: data.confidence_score,
          error: data.slot_status === "failed" ? resolvedError ?? OCR_FAIL_MESSAGE : resolvedError,
          assetUrl,
          previewUrl,
          screenshotType: detectedType,
          recognizedFields: data.recognized_fields,
          ocrSummary,
        },
      }));

      if (data.slot_status === "failed") {
        feedbackToast.error(resolvedError || OCR_FAIL_MESSAGE);
        return;
      }

      if (detectedType === "data" && data.recognized_fields) {
        applyOverviewFields(data.recognized_fields, data.confidence);
      }

      if (detectedType === "retention" && data.recognized_fields) {
        const retentionMetrics = data.recognized_fields.retention_metrics as unknown as Record<string, number | null> | undefined;
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

      feedbackToast.success("识别完成", {
        duration: 2200,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-sm",
      });
    } catch (error) {
      const message = toSlotUploadErrorMessage(error);
      setSlots((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: "failed",
          confirmed: false,
          requiresManualConfirmation: true,
          error: message,
        },
      }));
      feedbackToast.error(message);
    }
  }

  function handleSlotRetry(role: SubmissionSlotRole) {
    const slot = slots[role];
    if (slot.error !== NETWORK_RETRY_MESSAGE || !slot.file) {
      return;
    }
    void handleSlotUpload(role, slot.file);
  }

  const cancelTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (cancelTimeoutRef.current !== null) {
        window.clearTimeout(cancelTimeoutRef.current);
      }
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasAttemptedSubmit(true);

    if (!account) {
      feedbackToast.error("请先选择提交账号");
      return;
    }

    if (!submitCheck.ok || !issueSummary.canSubmit) {
      feedbackToast.error(issueHintText || issueSummary.reason || submitCheck.reason || "当前还不能提交");
      scrollToIssueAnchor(issueSummary.firstIssueAnchor);
      return;
    }

    if (!meta.topicTag) {
      feedbackToast.error("请选择话题标签（干货或复盘）");
      scrollToIssueAnchor("topicTag");
      return;
    }

    if (parseMetric(fields.follower_convert.value) > 0 && !scriptText.trim()) {
      feedbackToast.error("导粉数 > 0 时，请填写导粉话术文案");
      return;
    }

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
          topic_tag: meta.topicTag || null,
          content_keywords: meta.contentKeywords,
          assets: buildAssets(slots),
          script_text: parseMetric(fields.follower_convert.value) > 0 ? scriptText.trim() || null : null,
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

      const aiTags = !isVideo(payload) && Array.isArray(payload.ai_tags) ? payload.ai_tags : [];
      const summaryOverride = createSummaryOverride(account.id, meta, fields);
      setSubmittedVideo(submittedVideo);
      setIsSubmitted(true);
      onSubmitted(submittedVideo, aiTags, summaryOverride);
      feedbackToast.success("数据提交成功", {
        duration: 2000,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-sm",
      });
      clearDraft();
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }


  const [mounted, setMounted] = useState(false);
  const [showIssuePopover, setShowIssuePopover] = useState(false);
  const issuePopoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close issue popover on outside click
  useEffect(() => {
    if (!showIssuePopover) return;
    function handleClick(event: MouseEvent) {
      if (issuePopoverRef.current && !issuePopoverRef.current.contains(event.target as Node)) {
        setShowIssuePopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showIssuePopover]);

  // Build missing items list for layer 1 popover
  const missingItems = useMemo(() => {
    const items: { label: string; anchor: "slots" | "metrics" | "topicTag" | "meta" }[] = [];
    if (issueSummary.missingRequiredSlots.length > 0) {
      items.push({ label: "必传截图未上传", anchor: "slots" });
    }
    if (issueSummary.failedRequiredSlots.length > 0) {
      items.push({ label: "截图识别失败", anchor: "slots" });
    }
    if (issueSummary.pendingSlotConfirmations.length > 0) {
      items.push({ label: "截图待确认", anchor: "slots" });
    }
    if (issueSummary.missingRequiredMeta.includes("videoTitle")) {
      items.push({ label: "视频标题", anchor: "meta" });
    }
    if (issueSummary.missingRequiredMeta.includes("content")) {
      items.push({ label: "文案", anchor: "meta" });
    }
    if (issueSummary.missingRequiredMeta.includes("contentKeywords")) {
      items.push({ label: "内容标签", anchor: "meta" });
    }
    if (issueSummary.topicTagMissing) {
      items.push({ label: "话题标签", anchor: "topicTag" });
    }
    return items;
  }, [issueSummary]);

  // Video status dot color
  const videoStatusDotColor = useMemo(() => {
    switch (meta.anomalyStatus) {
      case "正常":
        return "bg-[#6FAA7D]";
      case "限流":
        return "bg-[#D99E55]";
      case "删稿":
        return "bg-[#C9604D]";
      default:
        return "bg-[#6FAA7D]";
    }
  }, [meta.anomalyStatus]);

  const mobileSubmitBar = (
    <div className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 pt-2 md:hidden pointer-events-none">
      <div className="mx-auto flex h-12 w-auto max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border border-zinc-200 bg-white/95 px-3 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl pointer-events-auto">
        {/* Layer 1: Form status */}
        <div className="flex items-center shrink-0">
          {canActuallySubmit ? (
            <div className="flex items-center gap-1.5 px-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white" />
              <span className="text-[13px] font-medium text-emerald-700">就绪</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowIssuePopover((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-1 transition-[background-color,box-shadow] duration-150",
                showIssuePopover
                  ? "bg-zinc-50 ring-1 ring-inset ring-zinc-200"
                  : "hover:bg-zinc-50"
              )}
              aria-expanded={showIssuePopover}
              aria-label={`待完善：${missingItems.length} 项，点击展开`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white" />
              <span className="text-[13px] font-medium text-amber-700">待完善</span>
              {missingItems.length > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
                  {missingItems.length}
                </span>
              ) : null}
              <ChevronUp
                className={cn(
                  "size-3.5 text-amber-600/70 transition-transform duration-200",
                  showIssuePopover ? "rotate-0" : "rotate-180"
                )}
              />
            </button>
          )}
        </div>
        <div className="h-4 w-px bg-zinc-200 shrink-0" />
        {/* Layer 2: Video status */}
        <div className="flex items-center gap-1 min-w-0">
          <span className={cn("h-2 w-2 rounded-full ring-1 ring-white shrink-0", videoStatusDotColor)} />
          <Select
            value={meta.anomalyStatus}
            onValueChange={(value) => updateMeta("anomalyStatus", value as AnomalyStatus)}
          >
            <SelectTrigger className="h-8 w-[80px] border-0 rounded-full bg-transparent px-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              {ANOMALY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {VIDEO_STATUS_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-2.5 py-1 text-[13px] font-medium text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-800"
            >
              取消
            </button>
          ) : null}
          <button
            type="submit"
            form="video-submit-form"
            disabled={isSubmitting || !canActuallySubmit}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-semibold transition-[transform,background-color,box-shadow] duration-150",
              canActuallySubmit
                ? "bg-[#D97757] text-white shadow-[0_2px_8px_-2px_rgba(217,119,87,0.5)] hover:bg-[#C96442] active:translate-y-px"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
          >
            {isSubmitting ? "提交中" : isBackfillMode ? "补交" : initialSummary ? "保存" : "提交"}
          </button>
        </div>
      </div>
      {/* Issue popover for mobile */}
      {showIssuePopover && missingItems.length > 0 ? (
        <div
          ref={issuePopoverRef}
          className="absolute bottom-[calc(100%+4px)] left-6 z-[110] w-60 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] pointer-events-auto"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">缺失项 · {missingItems.length}</span>
          </div>
          <div className="space-y-0.5">
            {missingItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  scrollToIssueAnchor(item.anchor);
                  setShowIssuePopover(false);
                }}
                className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-800"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const desktopSubmitBar = (
    <div className="fixed inset-x-0 bottom-0 z-50 hidden md:flex justify-center px-6 pb-6 pointer-events-none">
      <div
        className="relative flex h-[52px] w-auto items-center gap-4 rounded-full border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/90 px-4 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_20px_48px_-20px_rgba(15,23,42,0.22),0_6px_16px_-10px_rgba(15,23,42,0.12)] backdrop-blur-2xl pointer-events-auto"
      >
        {/* Layer 1: Form status */}
        <div className="flex items-center shrink-0">
          {canActuallySubmit ? (
            <div className="flex items-center gap-2 px-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white" />
              <span className="text-[13px] font-medium text-emerald-700">就绪</span>
            </div>
          ) : (
            <div className="relative" ref={issuePopoverRef}>
              <button
                type="button"
                onClick={() => setShowIssuePopover((v) => !v)}
                className={cn(
                  "group flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-[background-color,box-shadow] duration-150",
                  showIssuePopover
                    ? "bg-zinc-50 ring-1 ring-inset ring-zinc-200"
                    : "hover:bg-zinc-50 hover:ring-1 hover:ring-inset hover:ring-zinc-200/60"
                )}
                aria-expanded={showIssuePopover}
                aria-label={`待完善：${missingItems.length} 项，点击展开`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white" />
                <span className="text-[13px] font-medium text-amber-700">待完善</span>
                {missingItems.length > 0 ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
                    {missingItems.length}
                  </span>
                ) : null}
                <ChevronUp
                  className={cn(
                    "size-3.5 text-amber-600/70 transition-transform duration-200",
                    showIssuePopover ? "rotate-0" : "rotate-180"
                  )}
                />
              </button>
              {showIssuePopover && missingItems.length > 0 ? (
                <div className="absolute bottom-[calc(100%+12px)] left-0 z-[60] w-60 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">缺失项 · {missingItems.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {missingItems.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          scrollToIssueAnchor(item.anchor);
                          setShowIssuePopover(false);
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-800"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="h-4 w-px bg-zinc-200 shrink-0" />
        {/* Layer 2: Video status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("h-2 w-2 rounded-full ring-1 ring-white", videoStatusDotColor)} />
          <Select
            value={meta.anomalyStatus}
            onValueChange={(value) => updateMeta("anomalyStatus", value as AnomalyStatus)}
          >
            <SelectTrigger className="h-8 w-[92px] border-0 rounded-full bg-transparent px-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              {ANOMALY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {VIDEO_STATUS_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-800"
            >
              取消
            </button>
          ) : null}
          <button
            type="submit"
            form="video-submit-form"
            disabled={isSubmitting || !canActuallySubmit}
            className={cn(
              "rounded-full px-5 py-1.5 text-[13px] font-semibold transition-[transform,background-color,box-shadow] duration-150",
              canActuallySubmit
                ? "bg-[#D97757] text-white shadow-[0_2px_8px_-2px_rgba(217,119,87,0.5)] hover:bg-[#C96442] hover:shadow-[0_4px_16px_-2px_rgba(217,119,87,0.6)] hover:-translate-y-px active:translate-y-0"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
          >
            {submitButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (!account) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="text-sm text-zinc-500">
          请先选择一个视频账号，再填写提交信息。
        </div>
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
          className="space-y-4 pb-6"
        >
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#ECFDF3] text-[#067647]">
              <CheckCircle className="size-8" />
            </div>
            <h3 className="text-[18px] font-medium tracking-tight text-zinc-800">
              数据提交成功
            </h3>
            <p className="mt-2 text-[13px] text-zinc-500">
              归属日期：{meta.bizDate}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsSubmitted(false);
                  setSubmittedVideo(null);
                  setQualityCheck({ data: null, loading: false });
                  onCancel?.();
                }}
                className="h-9 rounded-xl border-zinc-200 px-4 text-[12px] text-zinc-700 hover:bg-zinc-50"
              >
                返回
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={qualityCheck.loading}
                onClick={handleQualityCheck}
                className="h-9 rounded-xl border-zinc-200 px-4 text-[12px] text-zinc-700 hover:bg-zinc-50"
              >
                {qualityCheck.loading ? (
                  <>
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                    AI 分析中…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 size-3.5" />
                    AI 检查样本质量
                  </>
                )}
              </Button>
            </div>
          </div>

          {qualityCheck.data ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 items-center justify-center rounded-lg px-2 text-[11px] font-medium",
                    qualityCheck.data.overallStatus === "pass"
                      ? "bg-[#067647]/10 text-[#067647]"
                      : qualityCheck.data.overallStatus === "warning"
                        ? "bg-[#EAB308]/10 text-[#EAB308]"
                        : "bg-[#B42318]/10 text-[#B42318]",
                  )}
                >
                  {qualityCheck.data.overallStatus === "pass"
                    ? "通过"
                    : qualityCheck.data.overallStatus === "warning"
                      ? "警告"
                      : "未通过"}
                </span>
                <span className="text-[12px] text-zinc-400">
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
                        <XCircle className="mt-0.5 size-4 shrink-0 text-[#B42318]" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#EAB308]" />
                      ) : (
                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-[#067647]" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-zinc-800">
                          {issue.title}
                        </p>
                        <p className="text-[12px] text-zinc-500">
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
                        className="h-8 shrink-0 rounded-xl border-zinc-200 px-3 text-[12px] text-zinc-700 hover:bg-zinc-50"
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
      ) : null}

      {!isSubmitted ? (
        <>
      <Dialog open={deleteTargetRole !== null} onOpenChange={(open) => !open && setDeleteTargetRole(null)}>
        <DialogContent className="max-w-md rounded-2xl border border-zinc-200 bg-white p-0 shadow-sm">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>确认删除截图？</DialogTitle>
            <DialogDescription>删除后需要重新上传并识别该槽位截图。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 pb-6">
            <Button type="button" variant="outline" onClick={() => setDeleteTargetRole(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!deleteTargetRole) return;

                // Cleanup Blob URL before deleting
                const targetSlot = slots[deleteTargetRole];
                if (targetSlot.previewUrl && targetSlot.previewUrl.startsWith("blob:")) {
                  URL.revokeObjectURL(targetSlot.previewUrl);
                  blobUrlsRef.current.delete(targetSlot.previewUrl);
                }

                setSlots((current) => ({
                  ...current,
                  [deleteTargetRole]: {
                    ...createEditableSlots()[deleteTargetRole],
                  },
                }));
                setDeleteTargetRole(null);
                feedbackToast.success("删除成功", {
                  duration: 2000,
                  className:
                    "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-sm",
                });
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
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-10 pb-[120px] md:pb-[140px]"
      >
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] lg:gap-0">
          {/* 左侧列：截图槽位区 + 视频信息 */}
          <div className="flex min-w-0 flex-col gap-10 lg:border-r lg:border-zinc-200 lg:pr-10">
            <motion.div ref={slotsSectionRef} variants={itemVariants}>
              <截图槽位区
                slots={slots}
                onSelectFile={handleSlotUpload}
                onDelete={(role) => setDeleteTargetRole(role)}
                onRetry={handleSlotRetry}
                onManualFill={(role) => {
                  setSlots((current) => ({
                    ...current,
                    [role]: {
                      ...current[role],
                      status: "empty",
                      confirmed: false,
                      error: null,
                      assetUrl: null,
                      previewUrl: null,
                      file: null,
                      fileName: undefined,
                      recognizedFields: null,
                      ocrSummary: undefined,
                    },
                  }));
                }}
                screenshotsRequired={screenshotsRequired}
                focusedRole={focusedRole}
                highlightedOcrIndex={highlightedOcrIndex}
                issueCount={
                  issueSummary.missingRequiredSlots.length +
                  issueSummary.failedRequiredSlots.length +
                  issueSummary.pendingSlotConfirmations.length
                }
              />
            </motion.div>

            <hr className="border-zinc-100" />

            <motion.div ref={metaSectionRef} variants={itemVariants}>

              <div className="min-w-0 space-y-6">
                  <div className="space-y-1">
                    <Label htmlFor="video_url" className="text-[13px] font-medium text-zinc-500">抖音视频链接</Label>
                    <Input
                      id="video_url"
                      value={meta.videoUrl}
                      onChange={(event) => updateMeta("videoUrl", event.target.value)}
                      placeholder="https://www.douyin.com/video/..."
                      className="h-10 rounded-xl bg-zinc-100/70 border-transparent text-[13px] text-zinc-800 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 focus:border-b-2 focus:border-b-[#D97757] transition-[background-color,border-color,box-shadow] duration-150"
                    />
                  </div>
                  <div className="space-y-1 rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.missingRequiredMeta.includes("videoTitle"))}>
                    <Label htmlFor="video_title" className="text-[13px] font-medium text-zinc-500">视频标题 <span className="text-[#C9604D]">*</span></Label>
                    <Input
                      id="video_title"
                      value={meta.videoTitle}
                      onChange={(event) => updateMeta("videoTitle", event.target.value)}
                      placeholder="输入视频标题"
                      className="h-10 rounded-xl bg-zinc-100/70 border-transparent text-[13px] text-zinc-800 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 focus:border-b-2 focus:border-b-[#D97757] transition-[background-color,border-color,box-shadow] duration-150"
                    />
                    {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("videoTitle") ? (
                      <p className="text-[12px] font-medium text-[#C9604D]">必填，仍未填写视频标题</p>
                    ) : null}
                  </div>

                  <div ref={topicTagSectionRef} className="space-y-2 rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.topicTagMissing)}>
                    <Label className="text-[13px] font-medium text-zinc-500">话题标签 <span className="text-[#C9604D]">*</span></Label>
                    <div className="flex gap-4">
                      {(["干货", "复盘"] as const).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => updateMeta("topicTag", meta.topicTag === tag ? "" : tag)}
                          className={cn(
                            "flex-1 h-10 rounded-lg border text-[13px] font-medium transition-colors duration-150",
                            meta.topicTag === tag
                              ? "border-[#D97757] bg-[#D97757] text-white hover:bg-[#C96442]"
                              : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {hasAttemptedSubmit && issueSummary.topicTagMissing ? (
                      <p className="text-[12px] font-medium text-[#C9604D]">必填，仍未选择话题标签</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.missingRequiredMeta.includes("contentKeywords"))}>
                    <Label className="text-[13px] font-medium text-zinc-500">
                      内容标签 <span className="text-[#C9604D]">*</span> <span className="text-[12px] font-normal text-zinc-400">最多3个</span>
                    </Label>
                    {keywordSuggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {keywordSuggestions.map((kw) => (
                          <button
                            key={kw}
                            type="button"
                            disabled={meta.contentKeywords.length >= 3 && !meta.contentKeywords.includes(kw)}
                            onClick={() => {
                              if (meta.contentKeywords.includes(kw)) {
                                updateMeta("contentKeywords", meta.contentKeywords.filter((k) => k !== kw));
                              } else if (meta.contentKeywords.length < 3) {
                                updateMeta("contentKeywords", [...meta.contentKeywords, kw]);
                              }
                            }}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                              meta.contentKeywords.includes(kw)
                                ? "border-[#D97757] bg-[#D97757] text-white"
                                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 disabled:opacity-40"
                            )}
                          >
                            {kw}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {meta.contentKeywords.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {meta.contentKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="flex items-center gap-1 rounded-full bg-[#D97757]/10 px-3 py-1 text-[12px] font-medium text-[#C96442] ring-1 ring-inset ring-[#D97757]/25"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => updateMeta("contentKeywords", meta.contentKeywords.filter((k) => k !== kw))}
                              className="ml-0.5 text-[#D97757] opacity-70 hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <Input
                        value={keywordInput}
                        onChange={(event) => setKeywordInput(event.target.value)}
                        onKeyDown={(event) => {
                          if ((event.key === "Enter" || event.key === " ") && keywordInput.trim() && meta.contentKeywords.length < 3) {
                            event.preventDefault();
                            const kw = keywordInput.trim();
                            if (!meta.contentKeywords.includes(kw)) {
                              updateMeta("contentKeywords", [...meta.contentKeywords, kw]);
                            }
                            setKeywordInput("");
                          }
                        }}
                        placeholder={meta.contentKeywords.length >= 3 ? "最多3个标签" : "输入后按空格或回车添加"}
                        disabled={meta.contentKeywords.length >= 3}
                        className="h-10 rounded-xl bg-zinc-100/70 text-[13px] border-transparent text-zinc-800 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 focus:border-b-2 focus:border-b-[#D97757] transition-[background-color,border-color,box-shadow] duration-150"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!keywordInput.trim() || meta.contentKeywords.length >= 3}
                        onClick={() => {
                          const kw = keywordInput.trim();
                          if (kw && !meta.contentKeywords.includes(kw) && meta.contentKeywords.length < 3) {
                            updateMeta("contentKeywords", [...meta.contentKeywords, kw]);
                            setKeywordInput("");
                          }
                        }}
                        className="h-10 rounded-lg px-3 text-[13px] border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors duration-150"
                      >
                        添加
                      </Button>
                    </div>
                    {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("contentKeywords") ? (
                      <p className="text-[12px] font-medium text-[#C9604D]">必填，至少添加 1 个内容标签</p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="published_at" className="text-[13px] font-medium text-zinc-500">发布时间</Label>
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
                          const nextBizDate = !isBackfillMode && !initialSummary ? getDatePartFromDateTimeLocal(nextPublishedAt) : null;
                          setMeta((current) => ({
                            ...current,
                            bizDate: nextBizDate ?? current.bizDate,
                            publishedAt: synced.publishedAt,
                            publishedAtText: synced.publishedAtText,
                          }));
                        }}
                        className="h-10 rounded-xl bg-zinc-100/70 border-transparent text-[13px] text-zinc-800 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 focus:border-b-2 focus:border-b-[#D97757] transition-[background-color,border-color,box-shadow] duration-150"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] font-medium text-zinc-500">上传时间</Label>
                      <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-zinc-100/70 px-3 text-[13px] text-zinc-500">
                        {meta.uploadedAt}
                      </div>
                    </div>
                  </div>
              </div>
            </motion.div>
          </div>

          {/* 右侧列：指标分组 + 文案 */}
          <div className="flex min-w-0 flex-col h-full lg:pl-10">
            <motion.div ref={metricsSectionRef} variants={itemVariants} className="shrink-0">
              <指标分组区
                fields={fields}
                onFieldChange={updateField}
                onFocusField={handleFieldFocus}
                onBlurField={handleFieldBlur}
                anomalyStatus={meta.anomalyStatus}
              />
            </motion.div>

            <导粉话术采集区
              visible={parseMetric(fields.follower_convert.value) > 0}
              value={scriptText}
              onChange={setScriptText}
              hasAttemptedSubmit={hasAttemptedSubmit}
            />

            <hr className="my-8 border-zinc-100" />

            <motion.div variants={itemVariants} className="flex flex-1 flex-col min-h-0">
              <div className="flex flex-1 flex-col space-y-1 rounded-2xl border border-transparent transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.missingRequiredMeta.includes("content"))}>
                <Label htmlFor="content" className="text-[13px] font-medium text-zinc-500 shrink-0">文案 <span className="text-[#C9604D]">*</span></Label>
                <textarea
                  id="content"
                  value={meta.content}
                  onChange={(event) => updateMeta("content", event.target.value)}
                  placeholder="粘贴视频文案"
                  className="min-h-[120px] w-full flex-1 resize-y rounded-xl border border-transparent bg-zinc-100/70 px-4 py-3 text-[13px] leading-[1.7] tracking-[0.005em] text-zinc-800 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150"
                />
                {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content") ? (
                  <p className="text-[12px] font-medium text-[#C9604D] shrink-0">必填，仍未填写文案</p>
                ) : null}
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div variants={itemVariants} className="hidden">
          {/* FAB 悬浮操作条 */}
          <div className="rounded-full pointer-events-auto bg-white border border-zinc-200 shadow-sm py-4 px-6 min-h-[72px] flex items-center justify-between gap-8 transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] w-max">
            <div className="flex items-center gap-3">
                {canActuallySubmit ? (
                  <div className="flex size-5 items-center justify-center rounded-full bg-white border border-[#6FAA7D] text-[#6FAA7D]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                ) : (
                  <div className="flex size-5 items-center justify-center rounded-full bg-white border border-[#C9604D] text-[#C9604D]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  </div>
                )}
                <div className="flex flex-col justify-center">
                  <p className="text-[14px] font-semibold text-zinc-800 leading-tight">
                    {canActuallySubmit ? "已就绪" : "待完善"}
                  </p>
                  <p className="text-[11px] font-medium text-zinc-500 truncate max-w-[200px] leading-tight mt-0.5">
                    {canActuallySubmit ? "可提交今日数据" : issueHintText || issueSummary.reason || submitCheck.reason || "请补全表单"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="grid gap-2 min-w-[120px]">
                  <Select
                    value={meta.anomalyStatus}
                    onValueChange={(value) => updateMeta("anomalyStatus", value as AnomalyStatus)}
                  >
                    <SelectTrigger className="h-11 rounded-lg bg-zinc-50 border-transparent text-[14px] font-medium text-zinc-800 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-white focus:bg-white focus:border-zinc-200 focus:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-950/5">
                      <SelectValue placeholder="请选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      {ANOMALY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {VIDEO_STATUS_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  {onCancel ? (
                    <Button type="button" variant="ghost" className="h-11 rounded-full px-5 font-semibold text-[14px] text-zinc-700 bg-[#F4F4F5] hover:bg-zinc-200" onClick={onCancel}>
                      取消
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={isSubmitting || !canActuallySubmit}
                    title={canActuallySubmit ? undefined : issueHintText || issueSummary.reason || submitCheck.reason || undefined}
                    className="h-11 rounded-[10px] px-7 font-semibold text-[14px] transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] bg-[#D97757] text-white shadow-sm hover:-translate-y-[1px] hover:bg-[#C96442] active:translate-y-0 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:hover:translate-y-0"
                  >
                    {submitButtonLabel}
                  </Button>
                </div>
              </div>
            </div>
        </motion.div>
      </motion.form>

      {mounted ? createPortal(desktopSubmitBar, document.body) : null}
      {mounted ? createPortal(mobileSubmitBar, document.body) : null}
        </>
      ) : null}
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Sparkles, XCircle, AlertTriangle, CheckCircle, ClipboardPaste } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { toast } from "sonner";

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
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import {
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import { normalizeOptionalText } from "./video-submit-form-state";
// DataReportWizard removed as we migrated to a unified layout

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
  videoForm: string;
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
    uploadedAt: "",
    topicTag: "复盘",
    videoForm: "出镜",
    contentKeywords: [],
  };
}

function getDatePartFromDateTimeLocal(value: string) {
  const [datePart = ""] = value.split("T");
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
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

  // Set uploadedAt on client only to avoid hydration mismatch
  useEffect(() => {
    setMeta((prev) => prev.uploadedAt ? prev : { ...prev, uploadedAt: new Date().toLocaleString("zh-CN") });
  }, []);

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
    [meta, fields, slots, scriptText, keywordInput]
  );

  const { hasDraft, restoreDraft, clearDraft, lastSavedAt } = useFormDraft<DraftData>(
    draftKey,
    draftData,
    [meta, fields, slots, scriptText, keywordInput],
    { isEmpty: isVideoSubmitDraftEmpty }
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
    [submissionState, meta.topicTag, meta.anomalyStatus, meta.videoTitle, meta.content]
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
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-sm",
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
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-sm",
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
        feedbackToast.success("文案已从剪贴板粘贴");
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
      feedbackToast.error("请先选择提交账号");
      return;
    }

    if (!submitCheck.ok || !issueSummary.canSubmit) {
      feedbackToast.error(issueHintText || issueSummary.reason || submitCheck.reason || "当前还不能提交");
      scrollToIssueAnchor(issueSummary.firstIssueAnchor);
      return;
    }

    if (!meta.topicTag) {
      feedbackToast.error("请选择话题标签");
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
          video_form: meta.videoForm || null,
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
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-sm",
      });
      clearDraft();
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }


  // 异常状态(删稿/限流)下截图必填解除
  const isAbnormalStatus = meta.anomalyStatus === "限流" || meta.anomalyStatus === "删稿";

  // 提交：触发 form 的提交事件，复用现有 handleSubmit
  const triggerSubmit = useCallback(() => {
    setHasAttemptedSubmit(true);
    const formEl = document.getElementById("video-submit-form") as HTMLFormElement | null;
    if (formEl) {
      if (formEl.requestSubmit) {
        formEl.requestSubmit();
      } else {
        formEl.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }
  }, []);

  const isSubmittingRef = useRef(isSubmitting);
  const canSubmitRef = useRef(canActuallySubmit);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);
  useEffect(() => { canSubmitRef.current = canActuallySubmit; }, [canActuallySubmit]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isSubmittingRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        if (event.key === "Escape") return;
      }
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const cmdEnter = event.key === "Enter" && (isMac ? event.metaKey : event.ctrlKey);
      if (cmdEnter) {
        event.preventDefault();
        if (canSubmitRef.current) triggerSubmit();
        return;
      }
      if (event.key === "Escape") {
        if (onCancel) {
          event.preventDefault();
          onCancel();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, triggerSubmit]);




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
          className="space-y-4 pb-2"
        >
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#6FAA7D]/10 text-[#6FAA7D]">
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
                  <>AI 分析中…</>
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
                      ? "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                      : qualityCheck.data.overallStatus === "warning"
                        ? "bg-[#D99E55]/10 text-[#D99E55]"
                        : "bg-[#C9604D]/10 text-[#C9604D]",
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
                        <XCircle className="mt-0.5 size-4 shrink-0 text-[#C9604D]" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#D99E55]" />
                      ) : (
                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-[#6FAA7D]" />
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
      ) : (
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
                    const targetSlot = slots[deleteTargetRole];
                    if (targetSlot.previewUrl && targetSlot.previewUrl.startsWith("blob:")) {
                      URL.revokeObjectURL(targetSlot.previewUrl);
                      blobUrlsRef.current.delete(targetSlot.previewUrl);
                    }
                    setSlots((current) => ({
                      ...current,
                      [deleteTargetRole]: { ...createEditableSlots()[deleteTargetRole] },
                    }));
                    setDeleteTargetRole(null);
                    feedbackToast.success("删除成功", {
                      duration: 2000,
                      className:
                        "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-sm",
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="grid gap-6 md:grid-cols-[1.1fr_1.9fr] lg:gap-8">
              {/* Left Column: Screenshots Upload slots */}
              <div ref={slotsSectionRef} className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <h3 className="text-[14px] font-semibold text-zinc-800">1. 上传截图</h3>
                  {!screenshotsRequired && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">免传</span>
                  )}
                </div>
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
                />
              </div>

              {/* Right Column: Form inputs */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <h3 className="text-[14px] font-semibold text-zinc-800">2. 视频与数据信息</h3>
                  <VideoStatusSegmented
                    value={meta.anomalyStatus}
                    onChange={(value) => updateMeta("anomalyStatus", value)}
                  />
                </div>

                {/* Form fields: Video basic details */}
                <div ref={metaSectionRef} className="space-y-5 rounded-2xl border border-zinc-100 bg-zinc-50/20 p-5">
                  <h4 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-zinc-400">视频基本信息</h4>
                  
                  {/* Video title */}
                  <div className="space-y-1 rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("videoTitle")}>
                    <Label htmlFor="video_title" className="text-[13px] font-medium text-zinc-500">视频标题 <span className="text-[#C9604D]">*</span></Label>
                    <Input
                      id="video_title"
                      value={meta.videoTitle}
                      onChange={(event) => updateMeta("videoTitle", event.target.value)}
                      placeholder="输入视频标题"
                      className="h-10 rounded-xl bg-zinc-100/70 border-transparent text-[13px] text-zinc-800 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150"
                    />
                    {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("videoTitle") ? (
                      <p className="text-[12px] font-medium text-[#C9604D]">必填，仍未填写视频标题</p>
                    ) : null}
                  </div>

                  {/* Topic tag & Video form side by side */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div ref={topicTagSectionRef} className="space-y-2 rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && issueSummary.topicTagMissing}>
                      <Label className="text-[13px] font-medium text-zinc-500">话题标签 <span className="text-[#C9604D]">*</span></Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["干货", "复盘"] as const).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => updateMeta("topicTag", meta.topicTag === tag ? "" : tag)}
                            className={cn(
                              "h-10 rounded-lg border text-[13px] font-medium transition-colors duration-150",
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

                    <div className="space-y-2">
                      <Label className="text-[13px] font-medium text-zinc-500">视频形式 <span className="text-[#C9604D]">*</span></Label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["出镜", "图文"] as const).map((form) => (
                          <button
                            key={form}
                            type="button"
                            onClick={() => updateMeta("videoForm", form)}
                            className={cn(
                              "h-10 rounded-lg border text-[13px] font-medium transition-colors duration-150",
                              meta.videoForm === form
                                ? "border-[#D97757] bg-[#D97757] text-white hover:bg-[#C96442]"
                                : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                            )}
                          >
                            {form}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Publish & Upload time side by side */}
                  <div className="grid gap-4 sm:grid-cols-2">
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
                        className="h-10 rounded-xl bg-zinc-100/70 border-transparent text-[13px] text-zinc-800 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] font-medium text-zinc-500">上传时间</Label>
                      <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-zinc-100/70 px-3 text-[13px] text-zinc-500">
                        {meta.uploadedAt || "--"}
                      </div>
                    </div>
                  </div>

                  {/* Video copywriting */}
                  <div className="rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-zinc-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content")}>
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="content" className="text-[13px] font-medium text-zinc-500">文案 <span className="text-[#C9604D]">*</span></Label>
                      <button
                        type="button"
                        onClick={handlePasteContent}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors duration-150 focus-visible:outline-none"
                      >
                        <ClipboardPaste size={14} className="stroke-[1.5]" />
                        一键粘贴
                      </button>
                    </div>
                    <textarea
                      id="content"
                      value={meta.content}
                      onChange={(event) => updateMeta("content", event.target.value)}
                      placeholder="粘贴视频文案"
                      className="min-h-[100px] w-full resize-y rounded-xl border border-transparent bg-zinc-100/70 px-4 py-3 text-[13px] leading-[1.7] tracking-[0.005em] text-zinc-800 placeholder:text-zinc-400 outline-none focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150"
                    />
                    {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content") ? (
                      <p className="mt-1 text-[12px] font-medium text-[#C9604D]">必填，仍未填写文案</p>
                    ) : null}
                  </div>
                </div>

                {/* Form fields: Data metrics */}
                <div ref={metricsSectionRef} className="space-y-5 rounded-2xl border border-zinc-100 bg-zinc-50/20 p-5">
                  <h4 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-zinc-400">数据指标</h4>
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

                {/* Form Action Buttons */}
                <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
                  <div>
                    {!canActuallySubmit ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D99E55] bg-white px-2.5 py-1 text-[12px] font-medium text-[#D99E55]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55]" />
                        信息待完善
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6FAA7D] bg-white px-2.5 py-1 text-[12px] font-medium text-[#6FAA7D]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
                        数据就绪
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {onCancel && (
                      <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className={cn(
                          "h-11 rounded-lg px-4 text-[13px] font-medium text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                          isSubmitting ? "cursor-not-allowed opacity-50" : "hover:bg-zinc-100 hover:text-zinc-800",
                        )}
                      >
                        取消
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSubmitting || !canActuallySubmit}
                      className={cn(
                        "group relative h-11 overflow-hidden rounded-xl px-6 text-[13px] font-semibold transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.98]",
                        isSubmitting || !canActuallySubmit
                          ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                          : "bg-[#D97757] text-white shadow-[0_4px_12px_rgba(217,119,87,0.25)] hover:shadow-[0_8px_24px_rgba(217,119,87,0.4)] hover:-translate-y-0.5"
                      )}
                    >
                      <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {isSubmitting ? "正在提交..." : submitButtonLabel}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] text-zinc-400">
              快捷键 · Cmd / Ctrl + Enter 提交数据
            </p>
          </motion.form>
        </>
      )}
    </>
  );
}

// WIZARD_STEPS constant removed as we migrated to a unified layout

const VIDEO_STATUS_OPTIONS: Array<{
  value: AnomalyStatus;
  label: string;
  dotClass: string;
  activeTextClass: string;
}> = [
  { value: "正常", label: "正常", dotClass: "bg-[#6FAA7D]", activeTextClass: "text-zinc-800" },
  { value: "限流", label: "限流", dotClass: "bg-[#D99E55]", activeTextClass: "text-[#D99E55]" },
  { value: "删稿", label: "删稿", dotClass: "bg-[#C9604D]", activeTextClass: "text-[#C9604D]" },
];

function VideoStatusSegmented({
  value,
  onChange,
}: {
  value: AnomalyStatus;
  onChange: (next: AnomalyStatus) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="视频状态"
      className="inline-flex h-9 items-center rounded-full border border-zinc-200 bg-zinc-50 p-0.5"
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
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium tracking-tight transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
              isActive
                ? cn("bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]", option.activeTextClass)
                : "text-zinc-500 hover:text-zinc-800",
            )}
          >
            <span className={cn("size-1.5 rounded-full", option.dotClass, !isActive && "opacity-60")} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

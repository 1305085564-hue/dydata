"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { feedbackToast } from "@/components/ui/feedback-toast";

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
import { containerVariants, itemVariants } from "@/lib/animations";
import { getDefaultPublishedAtValue } from "@/lib/日报";
import type {
  AnomalyStatus,
  Video,
  VideoTagReviewDimension,
} from "@/types";
import { 提交成功卡 } from "@/components/submission/提交成功卡";
import { 指标分组区 } from "@/components/submission/指标分组区";
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
  toSlotUploadErrorMessage,
} from "@/components/submission/截图上传错误";
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

interface VideoSubmitFormProps {
  account: { id: string; name: string; display_name: string; content_direction: string | null } | null;
  userId: string;
  today: string;
  mode: SubmitPanelMode;
  initialSummary: TodaySubmissionSummary | null;
  initialBizDate?: string | null;
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
    confidence?: Partial<Record<"play_count" | "likes" | "comments" | "shares" | "favorites" | "follower_gain", "high" | "medium" | "low">>;
    error?: string;
  };
  error?: string;
};

type OcrData = NonNullable<OcrApiPayload["data"]>;

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

  return {
    videoUrl: "",
    videoTitle: "",
    content: "",
    bizDate: today,
    publishedAt,
    publishedAtText: "",
    anomalyStatus: "正常",
    uploadedAt: new Date().toLocaleString("zh-CN"),
    topicTag: "复盘",
    contentKeywords: [],
  };
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
    .filter((slot) => slot.assetUrl)
    .map((slot) => ({
      role: slot.role,
      url: slot.assetUrl!,
      confirmed: slot.confirmed,
      confidence_score: slot.confidenceScore,
      recognized_fields: slot.recognizedFields ?? null,
      screenshot_type: slot.screenshotType ?? null,
    }));
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

export function VideoSubmitForm({ account, userId, today, mode, initialSummary, initialBizDate = null, onSubmitted, onCancel }: VideoSubmitFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [meta, setMeta] = useState<FormMetaState>(() => createInitialMeta(today));
  const [fields, setFields] = useState<SubmissionState["fields"]>(() => createEditableFields());
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, SlotViewState>>(() => createEditableSlots());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [deleteTargetRole, setDeleteTargetRole] = useState<SubmissionSlotRole | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [focusedRole, setFocusedRole] = useState<SubmissionSlotRole | null>(null);
  const slotsSectionRef = useRef<HTMLDivElement | null>(null);
  const metricsSectionRef = useRef<HTMLDivElement | null>(null);
  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const isBackfillMode = mode === "backfill";
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Track all created blob URLs to clean them up on unmount
  useEffect(() => {
    Object.values(slots).forEach((slot) => {
      if (slot.assetUrl && slot.assetUrl.startsWith("blob:")) {
        blobUrlsRef.current.add(slot.assetUrl);
      }
    });
  }, [slots]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
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
    setDeleteTargetRole(null);
    setKeywordInput("");
    setFocusedRole(null);
  }, [account?.id, initialBizDate, initialSummary, isBackfillMode, today]);

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
  }

  function handleFieldBlur() {
    setFocusedRole(null);
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
    // Revoke old blob URL for this slot to avoid leak when uploading a new file over an existing one
    const oldUrl = slots[role]?.assetUrl;
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

    feedbackToast.success("截图上传成功", {
      duration: 2000,
      className:
        "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
    });

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
      const assetUrl = URL.createObjectURL(file);
      const detectedType = data.screenshot_type;
      const ocrSummary = buildOcrSummary(detectedType, data.recognized_fields);

      const normalizedSlotError = data.error ? toSlotUploadErrorMessage(data.error) : null;

      setSlots((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: data.slot_status,
          confirmed: data.slot_status === "confirmed",
          requiresManualConfirmation: data.requires_manual_confirmation,
          confidenceScore: data.confidence_score,
          error: data.slot_status === "failed" ? normalizedSlotError ?? OCR_FAIL_MESSAGE : normalizedSlotError,
          assetUrl,
          screenshotType: detectedType,
          recognizedFields: data.recognized_fields,
          ocrSummary,
        },
      }));

      if (data.slot_status === "failed") {
        feedbackToast.error(normalizedSlotError || OCR_FAIL_MESSAGE);
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
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
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
      setIsSubmitted(true);
      onSubmitted(submittedVideo, aiTags, summaryOverride);
      feedbackToast.success("数据提交成功", {
        duration: 2000,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
      });
      cancelTimeoutRef.current = window.setTimeout(() => {
        onCancel?.();
      }, 2200);
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }


  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const mobileSubmitBar = (
    <div className="fixed inset-x-0 bottom-0 z-[100] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] border-t border-black/5 bg-white/92 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-[18px] md:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {canActuallySubmit
              ? "已满足最低提交条件"
              : issueHintText || issueSummary.reason || submitCheck.reason || "请补全表单后提交"}
          </p>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-[var(--color-text-secondary)]">视频状态</Label>
            <Select
              value={meta.anomalyStatus}
              onValueChange={(value) => updateMeta("anomalyStatus", value as AnomalyStatus)}
            >
              <SelectTrigger className="h-10 rounded-[var(--radius-lg)] bg-white text-sm">
                <SelectValue placeholder="请选择视频状态" />
              </SelectTrigger>
              <SelectContent>
                {ANOMALY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {VIDEO_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!screenshotsRequired ? (
              <p className="text-[11px] text-amber-600">当前状态下截图可选。</p>
            ) : null}
          </div>
          <div className={`grid gap-2 ${onCancel ? "grid-cols-2" : "grid-cols-1"}`}>
            {onCancel ? (
              <Button type="button" variant="outline" className="h-11 rounded-[10px] px-2 text-xs" onClick={onCancel}>
                取消
              </Button>
            ) : null}
            <Button
              type="submit"
              form="video-submit-form"
              disabled={isSubmitting || !canActuallySubmit}
              title={canActuallySubmit ? undefined : issueSummary.reason || submitCheck.reason || undefined}
              className="h-11 rounded-[10px] px-2 text-xs"
            >
              {isSubmitting ? "提交中..." : isBackfillMode ? "提交补交" : initialSummary ? "保存修改" : "提交今日"}
            </Button>
          </div>
        </div>
      </div>
  );

  const desktopSubmitBar = (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[95] hidden justify-center px-4 md:flex">
      <div className="pointer-events-auto flex min-h-[60px] w-auto max-w-[min(720px,calc(100vw-2rem))] items-center justify-between gap-4 rounded-[20px] border border-white/50 bg-white/90 px-4 py-3 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.04)] backdrop-blur-[20px] backdrop-saturate-[180%] transition-all hover:shadow-[0_18px_34px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex min-w-0 items-center gap-3">
          {canActuallySubmit ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          )}
          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">
              {canActuallySubmit ? "Ready" : "Needs Work"}
            </p>
            <p className="mt-0.5 max-w-[170px] truncate text-[10px] font-medium leading-tight text-[var(--color-text-secondary)]">
              {canActuallySubmit ? "Submit today" : issueHintText || issueSummary.reason || submitCheck.reason || "Complete the form"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid w-[112px] gap-2">
            <Select
              value={meta.anomalyStatus}
              onValueChange={(value) => updateMeta("anomalyStatus", value as AnomalyStatus)}
            >
              <SelectTrigger className="h-10 rounded-full border-black/5 bg-[#f8fafc] px-3 text-[13px] font-medium shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition-all hover:bg-white focus:ring-2 focus:ring-primary/20">
                <SelectValue placeholder="Status" />
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
              <Button type="button" variant="ghost" className="h-10 rounded-full bg-[#f1f5f9] px-4 text-[13px] font-semibold text-[var(--color-text-main)] hover:bg-black/5" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              form="video-submit-form"
              disabled={isSubmitting || !canActuallySubmit}
              title={canActuallySubmit ? undefined : issueHintText || issueSummary.reason || submitCheck.reason || undefined}
              className="h-10 rounded-full bg-[var(--color-primary)] px-5 text-[13px] font-bold text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] transition-all hover:-translate-y-0.5 hover:bg-[#1d4ed8] hover:shadow-[0_6px_20px_rgba(37,99,235,0.5)] active:translate-y-0 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {submitButtonLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!account) {
    return (
      <MotionCard className="border-none bg-white/70">
        <div className="p-6 text-sm text-[var(--color-text-secondary)]">
          请先选择一个视频账号，再填写提交信息。
        </div>
      </MotionCard>
    );
  }

  return (
    <>
      <AnimatePresence>{isSubmitted ? <提交成功卡 bizDate={meta.bizDate} /> : null}</AnimatePresence>

      <Dialog open={deleteTargetRole !== null} onOpenChange={(open) => !open && setDeleteTargetRole(null)}>
        <DialogContent className="max-w-md rounded-[20px] border-none bg-white/75 p-0 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-[40px]">
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
                if (targetSlot.assetUrl && targetSlot.assetUrl.startsWith("blob:")) {
                  URL.revokeObjectURL(targetSlot.assetUrl);
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
                    "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
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
        className="space-y-5 pb-[140px] md:pb-[180px]"
      >
        <div className="space-y-6">
          {/* 第一行：截图槽位区 & 指标分组区 */}
          <MotionCard className="border-none bg-white/68 shadow-sm backdrop-blur-sm">
            <div className="grid items-start gap-6 p-5 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)] xl:gap-0">
            <div className="flex min-w-0 flex-col gap-6 xl:border-r xl:border-black/6 xl:pr-6">
              <motion.div ref={slotsSectionRef} variants={itemVariants}>
                <截图槽位区
                  slots={slots}
                  onSelectFile={handleSlotUpload}
                  onDelete={(role) => setDeleteTargetRole(role)}
                  onRetry={handleSlotRetry}
                  screenshotsRequired={screenshotsRequired}
                  focusedRole={focusedRole}
                  issueCount={
                    issueSummary.missingRequiredSlots.length +
                    issueSummary.failedRequiredSlots.length +
                    issueSummary.pendingSlotConfirmations.length
                  }
                />
              </motion.div>
            </div>

            <div className="flex min-w-0 flex-col gap-6 xl:pl-6">
              <motion.div ref={metricsSectionRef} variants={itemVariants}>
                <指标分组区
                  fields={fields}
                  onFieldChange={updateField}
                  onFocusField={handleFieldFocus}
                  onBlurField={handleFieldBlur}
                  anomalyStatus={meta.anomalyStatus}
                />
              </motion.div>
            </div>
          </div>
          </MotionCard>

          {/* 第二行：视频链接等元数据信息 & 文案提取区 */}
          <div className="grid items-stretch gap-6 xl:grid-cols-2 xl:[&>*]:min-h-[30rem]">
            <div className="flex min-w-0 flex-col xl:h-full">
              <motion.div ref={metaSectionRef} variants={itemVariants} className="flex h-full flex-1 flex-col">
                <MotionCard className="flex h-full flex-1 flex-col border-none bg-white/70 shadow-sm backdrop-blur-sm">
                  <div className="space-y-4 p-5 flex-1">
                  <div className="space-y-2 rounded-[var(--radius-xl)] border border-transparent p-0 transition-colors">
                    <Label htmlFor="video_url">抖音视频链接</Label>
                    <Input
                      id="video_url"
                      value={meta.videoUrl}
                      onChange={(event) => updateMeta("videoUrl", event.target.value)}
                      placeholder="https://www.douyin.com/video/..."
                      className="h-11 rounded-[var(--radius-lg)] bg-white shadow-sm"
                    />
                  </div>
                  <div className="space-y-2 rounded-[var(--radius-xl)] border border-transparent p-0 transition-colors data-[missing=true]:border-[color:rgba(255,59,48,0.24)] data-[missing=true]:bg-[color:rgba(255,59,48,0.04)] data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.missingRequiredMeta.includes("videoTitle"))}>
                    <Label htmlFor="video_title">视频标题 <span className="text-red-500">*</span></Label>
                    <Input
                      id="video_title"
                      value={meta.videoTitle}
                      onChange={(event) => updateMeta("videoTitle", event.target.value)}
                      placeholder="输入视频标题"
                      className="h-11 rounded-[var(--radius-lg)] bg-white shadow-sm"
                    />
                    {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("videoTitle") ? (
                      <p className="text-xs font-medium text-[var(--color-danger)]">必填，仍未填写视频标题</p>
                    ) : null}
                  </div>

                  <div ref={topicTagSectionRef} className="space-y-3 rounded-[var(--radius-xl)] border border-transparent p-0 transition-colors data-[missing=true]:border-[color:rgba(255,59,48,0.24)] data-[missing=true]:bg-[color:rgba(255,59,48,0.04)] data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.topicTagMissing)}>
                    <Label>话题标签 <span className="text-red-500">*</span></Label>
                    <div className="flex gap-3">
                      {(["干货", "复盘"] as const).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => updateMeta("topicTag", meta.topicTag === tag ? "" : tag)}
                          className={[
                            "flex-1 h-11 rounded-[var(--radius-lg)] border text-sm font-medium transition-all shadow-sm",
                            meta.topicTag === tag
                              ? "border-[#007AFF] bg-[#007AFF] text-white"
                              : "border-black/10 bg-white text-[var(--color-text-primary)] hover:border-[#007AFF]/50",
                          ].join(" ")}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {hasAttemptedSubmit && issueSummary.topicTagMissing ? (
                      <p className="text-xs font-medium text-[var(--color-danger)]">必填，仍未选择话题标签</p>
                    ) : null}
                  </div>

                  <div className="space-y-3 rounded-[var(--radius-xl)] border border-transparent p-0 transition-colors data-[missing=true]:border-[color:rgba(255,59,48,0.24)] data-[missing=true]:bg-[color:rgba(255,59,48,0.04)] data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.missingRequiredMeta.includes("contentKeywords"))}>
                    <Label>
                      内容标签 <span className="text-red-500">*</span> <span className="text-xs font-normal text-[var(--color-text-secondary)]">最多3个</span>
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
                            className={[
                              "rounded-full border px-3 py-1 text-xs transition-all shadow-sm",
                              meta.contentKeywords.includes(kw)
                                ? "border-[#007AFF] bg-[#007AFF] text-white"
                                : "border-black/10 bg-white text-[var(--color-text-secondary)] hover:border-[#007AFF]/50 disabled:opacity-40",
                            ].join(" ")}
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
                            className="flex items-center gap-1 rounded-full border border-[#007AFF] bg-[#007AFF]/8 px-3 py-1 text-xs text-[#007AFF]"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => updateMeta("contentKeywords", meta.contentKeywords.filter((k) => k !== kw))}
                              className="ml-0.5 opacity-70 hover:opacity-100"
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
                        className="h-9 rounded-[var(--radius-lg)] bg-white text-sm shadow-sm"
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
                        className="h-9 rounded-[var(--radius-lg)] px-3 text-sm shadow-sm"
                      >
                        添加
                      </Button>
                    </div>
                    {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("contentKeywords") ? (
                      <p className="text-xs font-medium text-[var(--color-danger)]">必填，至少添加 1 个内容标签</p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="published_at">发布时间</Label>
                      <Input
                        id="published_at"
                        type="datetime-local"
                        step={3600}
                        value={meta.publishedAt}
                        onChange={(event) => {
                          const synced = syncPublishedAtAndText({
                            nextPublishedAt: event.target.value,
                            nextPublishedAtText: meta.publishedAtText,
                            changedField: "published_at",
                          });
                          setMeta((current) => ({ ...current, publishedAt: synced.publishedAt, publishedAtText: synced.publishedAtText }));
                        }}
                        className="h-11 rounded-[var(--radius-lg)] bg-white shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>上传时间</Label>
                      <div className="flex h-11 items-center rounded-[var(--radius-lg)] border border-black/8 bg-[color:rgba(255,255,255,0.7)] px-3 text-sm text-[var(--color-text-secondary)] shadow-sm">
                        {meta.uploadedAt}
                      </div>
                    </div>
                  </div>
                </div>
              </MotionCard>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col xl:h-full">
            <motion.div variants={itemVariants} className="flex h-full flex-1 flex-col">
              <MotionCard className="flex h-full flex-1 flex-col border-none bg-white/70 shadow-sm backdrop-blur-sm">
                <div className="flex h-full flex-1 flex-col space-y-2 rounded-[var(--radius-xl)] border border-transparent p-5 transition-colors data-[missing=true]:border-[color:rgba(255,59,48,0.24)] data-[missing=true]:bg-[color:rgba(255,59,48,0.04)] data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && (issueSummary.missingRequiredMeta.includes("content"))}>
                  <Label htmlFor="content">文案 <span className="text-red-500">*</span></Label>
                  <textarea
                    id="content"
                    value={meta.content}
                    onChange={(event) => updateMeta("content", event.target.value)}
                    placeholder="粘贴视频文案"
                    className="min-h-[16rem] w-full flex-1 rounded-[var(--radius-lg)] border border-black/8 bg-white px-4 py-3 text-sm leading-6 outline-none shadow-sm focus:ring-2 focus:ring-[color:rgba(0,122,255,0.16)] resize-none xl:min-h-0"
                  />
                  {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content") ? (
                    <p className="text-xs font-medium text-[var(--color-danger)]">必填，仍未填写文案</p>
                  ) : null}
                </div>
              </MotionCard>
            </motion.div>
          </div>
        </div>
        </div>

        <motion.div variants={itemVariants} className="hidden">
          {/* FAB 悬浮操作条 */}
          <div className="rounded-full pointer-events-auto bg-white/85 backdrop-blur-[20px] backdrop-saturate-[180%] shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.04)] border border-white/50 py-4 px-6 min-h-[72px] flex items-center justify-between gap-8 transition-all hover:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.12)] w-max">
            <div className="flex items-center gap-3">
                {canActuallySubmit ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                )}
                <div className="flex flex-col justify-center">
                  <p className="text-[14px] font-semibold text-[var(--color-text-primary)] leading-tight">
                    {canActuallySubmit ? "一切就绪" : "待完善信息"}
                  </p>
                  <p className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate max-w-[200px] leading-tight mt-0.5">
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
                    <SelectTrigger className="h-11 rounded-full bg-[#f8fafc] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] border-black/5 hover:bg-white text-[14px] font-medium transition-all focus:ring-2 focus:ring-primary/20">
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
                    <Button type="button" variant="ghost" className="h-11 rounded-full px-5 hover:bg-black/5 font-semibold text-[14px] text-[var(--color-text-main)] bg-[#f1f5f9]" onClick={onCancel}>
                      取消
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={isSubmitting || !canActuallySubmit}
                    title={canActuallySubmit ? undefined : issueHintText || issueSummary.reason || submitCheck.reason || undefined}
                    className="h-11 rounded-full px-7 font-bold text-[14px] transition-all bg-[var(--color-primary)] text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(37,99,235,0.5)] hover:bg-[#1d4ed8] active:translate-y-0 disabled:shadow-none disabled:bg-slate-200 disabled:text-slate-400 disabled:hover:translate-y-0"
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
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, XCircle, AlertTriangle, CheckCircle, ClipboardPaste, ChevronDown, Zap, Lightbulb, Plus, Lock, Loader2 } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { triggerGlobalTopicCreate } from "@/components/topics/global-topic-create";
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
  OCR_FAIL_MESSAGE,
  resolveOcrErrorMessage,
  toOcrErrorMessage,
  toScreenshotUploadErrorMessage,
} from "@/components/submission/截图上传错误";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useNotifications } from "@/components/notifications/notification-store";
import { isVideoSubmitDraftEmpty } from "@/lib/video-submit-draft";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";
import {
  normalizeOptionalText,
  resolveDraftManualTopicState,
  resolveDraftTopicId,
  sanitizeTopicSearchKeyword,
  shouldAutoBindNewTopic,
  shouldAutoRedirectToGrowthAfterSubmit,
  shouldAutoSelectSuggestedTopic,
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

export interface TopicSuggestion {
  id: string;
  title: string;
  hook?: string;
  topics?: { name: string }[] | { name: string } | null;
}

function getTopicName(topics: TopicSuggestion["topics"]) {
  if (!topics) return null;
  if (Array.isArray(topics)) return topics[0]?.name ?? null;
  return topics.name ?? null;
}

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
  topicId?: string | null;
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
    anomalyStatus: "normal",
    uploadedAt: "",
    topicTag: "复盘",
    videoForm: "出镜",
    contentKeywords: [],
    platformNotice: "",
    appeal: "",
    topicId: null,
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
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [meta, setMeta] = useState<FormMetaState>(() => createInitialMeta(today));
  const [fields, setFields] = useState<SubmissionState["fields"]>(() => createEditableFields());
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, SlotViewState>>(() => createEditableSlots());
  const slotsRef = useRef(slots);
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

  // 关联选题相关状态
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isManuallySet, setIsManuallySet] = useState(false);
  const [urlLocked, setUrlLocked] = useState(false);
  const [selectedTopicName, setSelectedTopicName] = useState<string>("");
  const [selectedTopicCategory, setSelectedTopicCategory] = useState<string>("");
  const [topicNameError, setTopicNameError] = useState<"not_found" | "load_failed" | null>(null);
  const [topicNameRetrySeq, setTopicNameRetrySeq] = useState(0);
  const [suggestFailed, setSuggestFailed] = useState(false);
  const [suggestRetrySeq, setSuggestRetrySeq] = useState(0);
  const urlLockedRef = useRef(urlLocked);
  const isManuallySetRef = useRef(isManuallySet);
  const topicIdRef = useRef<FormMetaState["topicId"]>(null);
  const suggestSeqRef = useRef(0);

  // 搜索相关状态（“换一个” Dialog）
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TopicSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    urlLockedRef.current = urlLocked;
    isManuallySetRef.current = isManuallySet;
    topicIdRef.current = meta.topicId;
  }, [urlLocked, isManuallySet, meta.topicId]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // 1. URL 锁定逻辑
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const urlTopicId = searchParams.get("topicId") || searchParams.get("topic_id");
      if (urlTopicId) {
        topicIdRef.current = urlTopicId;
        urlLockedRef.current = true;
        isManuallySetRef.current = true;
        updateMeta("topicId", urlTopicId);
        setUrlLocked(true);
        setIsManuallySet(true);
      }
    }
  }, []);

  // 2. 根据选中的 topicId 获取其详细名称
  useEffect(() => {
    let cancelled = false;

    const fetchTopicName = async () => {
      setSelectedTopicName("");
      setSelectedTopicCategory("");
      setTopicNameError(null);

      if (!meta.topicId) {
        return;
      }
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("sub_topics")
          .select("title, topics(name)")
          .eq("id", meta.topicId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setTopicNameError("load_failed");
          return;
        }
        if (data) {
          setSelectedTopicName(data.title);
          setSelectedTopicCategory(getTopicName(data.topics) || "常规母题");
        } else {
          setTopicNameError("not_found");
        }
      } catch (err) {
        if (cancelled) return;
        console.error("获取选题名称失败:", err);
        setTopicNameError("load_failed");
      }
    };
    void fetchTopicName();
    return () => {
      cancelled = true;
    };
  }, [meta.topicId, topicNameRetrySeq]);

  // 3. 监听新建选题事件：自动绑定最新创建的选题
  useEffect(() => {
    const handleNewTopic = async () => {
      if (!userId) return;
      if (
        !shouldAutoBindNewTopic({
          urlLocked: urlLockedRef.current,
          isManuallySet: isManuallySetRef.current,
          topicId: topicIdRef.current,
        })
      ) {
        return;
      }
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("sub_topics")
          .select("id, title, topics(name)")
          .eq("created_by", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          updateMeta("topicId", data.id);
          topicIdRef.current = data.id;
          isManuallySetRef.current = true;
          setIsManuallySet(true);
          feedbackToast.success(`已自动关联新创建的选题：“${data.title}”`);
        }
      } catch (err) {
        console.error("绑定新选题失败:", err);
      }
    };
    window.addEventListener("refresh-topics", handleNewTopic);
    return () => window.removeEventListener("refresh-topics", handleNewTopic);
  }, [userId]);

  // 4. 防抖推荐逻辑
  useEffect(() => {
    suggestSeqRef.current += 1;
    if (urlLocked || isManuallySet) {
      setLoadingSuggestions(false);
      return;
    }
    if (!meta.videoTitle.trim() && !meta.content.trim()) {
      setSuggestions([]);
      setSuggestFailed(false);
      setLoadingSuggestions(false);
      updateMeta("topicId", null);
      return;
    }

    const timer = setTimeout(async () => {
      const seq = ++suggestSeqRef.current;
      setLoadingSuggestions(true);
      setSuggestFailed(false);
      try {
        const params = new URLSearchParams();
        params.append("title", meta.videoTitle.trim());
        params.append("content", meta.content.trim());
        const res = await fetch(`/api/topics/sub-topics/suggest?${params.toString()}`);
        if (!res.ok) {
          throw new Error("suggest request failed");
        }
        const data = await res.json();
        if (seq !== suggestSeqRef.current) return;
        setSuggestions(data || []);
        if (data && data.length > 0) {
          setMeta((current) => {
            if (
              !shouldAutoSelectSuggestedTopic({
                urlLocked: urlLockedRef.current,
                isManuallySet: isManuallySetRef.current,
                currentTopicId: current.topicId,
              })
            ) {
              return current;
            }
            topicIdRef.current = data[0].id;
            return { ...current, topicId: data[0].id };
          });
        }
      } catch (err) {
        if (seq !== suggestSeqRef.current) return;
        console.error("推荐获取失败:", err);
        setSuggestions([]);
        setSuggestFailed(true);
      } finally {
        if (seq === suggestSeqRef.current) {
          setLoadingSuggestions(false);
        }
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [meta.videoTitle, meta.content, urlLocked, isManuallySet, suggestRetrySeq]);

  // 5. 换一个：子题搜索逻辑
  useEffect(() => {
    if (!searchDialogOpen) return;
    let cancelled = false;
    setSearching(true);
    setSearchError(false);
    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const supabase = createClient();
        let query = supabase
          .from("sub_topics")
          .select("id, title, topics(name)")
          .order("created_at", { ascending: false })
          .limit(10);
        
        const keyword = sanitizeTopicSearchKeyword(searchQuery);
        if (keyword) {
          query = query.or(`title.ilike.%${keyword}%,hook.ilike.%${keyword}%`);
        }
        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          setSearchResults([]);
          setSearchError(true);
          return;
        }
        if (data) {
          setSearchResults(
            data.map((item) => ({
              id: item.id,
              title: item.title,
              topics: item.topics,
            }))
          );
        }
      } catch (err) {
        if (cancelled) return;
        console.error("搜索选题失败:", err);
        setSearchResults([]);
        setSearchError(true);
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(delayDebounce);
    };
  }, [searchQuery, searchDialogOpen]);
  const metaSectionRef = useRef<HTMLDivElement | null>(null);
  const topicTagSectionRef = useRef<HTMLDivElement | null>(null);
  const isBackfillMode = mode === "backfill";
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const shouldAutoRedirectAfterSubmitRef = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const handleGoToGrowth = useCallback(() => {
    setIsRedirecting(true);
    setTimeout(() => {
      router.push("/growth");
    }, 800);
  }, [router]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // 状态重置时，清空倒计时
  useEffect(() => {
    if (!isSubmitted) {
      setCountdown(null);
    }
  }, [isSubmitted]);

  // 倒计时递减，归零时触发跳转渐隐动效
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      handleGoToGrowth();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, handleGoToGrowth]);

  const [isMemoryExpanded, setIsMemoryExpanded] = useState(false);
  const [isMoreSettingsExpanded, setIsMoreSettingsExpanded] = useState(false);

  // 提交成功后延迟 2.2 秒开始执行全屏动效渐隐，并自动跳转大盘（仅在提交瞬间判定为今天首次创建，且用户未操作时）
  useEffect(() => {
    if (!isSubmitted) return;
    if (!shouldAutoRedirectAfterSubmitRef.current) return;
    if (hasUserInteracted) return;

    const timer = setTimeout(() => {
      handleGoToGrowth();
    }, 2200);

    return () => clearTimeout(timer);
  }, [isSubmitted, hasUserInteracted, handleGoToGrowth]);

  // 当提交状态变为 false 时，重置用户操作状态
  useEffect(() => {
    if (!isSubmitted) {
      setHasUserInteracted(false);
      shouldAutoRedirectAfterSubmitRef.current = false;
    }
  }, [isSubmitted]);

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
    isManuallySet?: boolean;
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
      isManuallySet,
    }),
    [meta, fields, slots, scriptText, keywordInput, isManuallySet]
  );

  const { hasDraft, restoreDraft, clearDraft, lastSavedAt } = useFormDraft<DraftData>(
    draftKey,
    draftData,
    [meta, fields, slots, scriptText, keywordInput, isManuallySet],
    { isEmpty: isVideoSubmitDraftEmpty }
  );

  const { setLocalNotification } = useNotifications();

  const handleRestoreDraft = useCallback(() => {
    const draft = restoreDraft();
    if (!draft) return;

    setMeta((current) => {
      const nextTopicId = resolveDraftTopicId({
        urlLocked: urlLockedRef.current,
        currentTopicId: current.topicId,
        draftTopicId: draft.meta.topicId,
      });
      topicIdRef.current = nextTopicId;
      return {
        ...draft.meta,
        topicId: nextTopicId,
      };
    });
    setIsManuallySet((current) =>
      resolveDraftManualTopicState({
        urlLocked: urlLockedRef.current,
        currentIsManuallySet: current,
        draftIsManuallySet: draft.isManuallySet,
        draftTopicId: draft.meta.topicId,
      })
    );
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

    setMeta((current) => {
      const nextTopicId = urlLockedRef.current ? current.topicId : nextMeta.topicId;
      topicIdRef.current = nextTopicId;
      return {
        ...nextMeta,
        topicId: nextTopicId,
      };
    });
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
    if (key === "topicId") {
      topicIdRef.current = value as FormMetaState["topicId"];
    }
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

    let phase: "upload" | "ocr" = "upload";
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user && !userId) {
        throw new Error("登录状态已失效，请刷新页面后重试");
      }

      const uploadStart = performance.now();
      const { url: assetUrl, bucket, path } = await uploadSubmissionScreenshot({
        accountId: account.id,
        role,
        file,
      });
      const uploadMs = Math.round(performance.now() - uploadStart);
      const previewUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(previewUrl);

      phase = "ocr";
      setSlots((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: "recognizing",
        },
      }));

      feedbackToast.success("截图已保存，正在识别", {
        duration: 2000,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-xl",
      });

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
        throw new Error(toOcrErrorMessage(payload.error));
      }

      const { data } = payload;
      const detectedType = data.screenshot_type;
      const ocrSummary = buildOcrSummary(detectedType, data.recognized_fields);

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

      const shouldAutoMoveSlot =
        role !== targetRole &&
        (slotsRef.current[targetRole].status === "empty" || slotsRef.current[targetRole].status === "failed");
      setSlots((current) => {
        const newSlotData = {
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
        };

        if (role !== targetRole && (current[targetRole].status === "empty" || current[targetRole].status === "failed")) {
          return {
            ...current,
            [targetRole]: {
              ...newSlotData,
              role: targetRole,
            },
            [role]: {
              role: role,
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
            },
          };
        }

        return {
          ...current,
          [role]: newSlotData,
        };
      });

      if (shouldAutoMoveSlot) {
        const detectedLabel = detectedType === "data" ? "流量数据图" : detectedType === "retention" ? "留存完播图" : "截图";
        feedbackToast.success(`已识别为${detectedLabel}，自动归入${SLOT_LABELS[targetRole]}`, {
          duration: 2000,
        });
      }

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
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-xl",
      });
    } catch (error) {
      const message = phase === "upload"
        ? toScreenshotUploadErrorMessage(error)
        : toOcrErrorMessage(error);
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
    if (slot.status !== "failed" || !slot.file) {
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

    const shouldAutoRedirectAfterSubmit = shouldAutoRedirectToGrowthAfterSubmit({
      mode,
      bizDate: meta.bizDate,
      today,
      submittedViewActive,
      hasInitialSummary: Boolean(initialSummary),
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
          account_id: account.id,
          biz_date: meta.bizDate,
          video_url: normalizeOptionalText(meta.videoUrl),
          video_title: normalizeOptionalText(meta.videoTitle),
          content: normalizeOptionalText(meta.content),
          published_at: meta.publishedAt || getDefaultPublishedAtValue(),
          published_at_text: normalizeOptionalText(meta.publishedAtText),
          anomaly_status: meta.anomalyStatus,
          punish_type: meta.anomalyStatus === "abnormal" ? (meta.punishType || "限流") : undefined,
          platform_notice: meta.anomalyStatus === "abnormal" ? normalizeOptionalText(meta.platformNotice ?? "") : undefined,
          appeal: meta.anomalyStatus === "abnormal" ? normalizeOptionalText(meta.appeal ?? "") : undefined,
          topic_tag: meta.topicTag || null,
          video_form: meta.videoForm || null,
          topic_id: meta.topicId || null,
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
      shouldAutoRedirectAfterSubmitRef.current = shouldAutoRedirectAfterSubmit;
      setSubmittedVideo(submittedVideo);
      setIsSubmitted(true);
      if (shouldAutoRedirectAfterSubmit) {
        setCountdown(3);
        router.prefetch("/growth");
      }
      onSubmitted(submittedVideo, aiTags, summaryOverride);
      feedbackToast.success("数据提交成功", {
        duration: 2000,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-xl",
      });
      trackUsageEvent({ path: "/dashboard", eventType: "submit_daily_report" });
      clearDraft();
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }


  /* ---------------------------------------------------------------- */
  /*  双态面板状态及队列上传                                            */
  /* ---------------------------------------------------------------- */
  const [activePanelTab, setActivePanelTab] = useState<"upload" | "confirm">("upload");
  const isAbnormalStatus = meta.anomalyStatus === "abnormal";

  // 统一的多图指派与上传
  const handleUnifiedUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const roles: SubmissionSlotRole[] = ["screenshot_1", "screenshot_2", "screenshot_3"];
    const uploadsToStart: { role: SubmissionSlotRole; file: File }[] = [];

    let fileIndex = 0;
    for (const role of roles) {
      if (fileIndex >= files.length) break;
      const slot = slots[role];
      if (slot.status === "empty" || slot.status === "failed") {
        uploadsToStart.push({ role, file: files[fileIndex] });
        fileIndex++;
      }
    }

    await Promise.all(
      uploadsToStart.map(({ role, file }) => handleSlotUpload(role, file))
    );

    if (fileIndex < files.length) {
      toast.warning(`槽位已满，仅上传了前 ${uploadsToStart.length} 张图片`);
    }
  }, [slots, handleSlotUpload]);

  // 1. OCR 识别完成自动切 Tab 逻辑
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (autoAdvancedRef.current) return;
    if (isAbnormalStatus) return;
    const slot1 = slots.screenshot_1;
    const slot2 = slots.screenshot_2;
    if (!slot1 || !slot2) return;
    
    const bothConfirmed = slot1.status === "confirmed" && slot2.status === "confirmed";
    const anyPending =
      slot1.status === "pending_confirm" ||
      slot2.status === "pending_confirm" ||
      slot1.status === "uploading" ||
      slot2.status === "uploading" ||
      slot1.status === "recognizing" ||
      slot2.status === "recognizing";

    if (bothConfirmed && !anyPending) {
      autoAdvancedRef.current = true;
      const timer = window.setTimeout(() => {
        setActivePanelTab("confirm");
      }, 350);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [slots, isAbnormalStatus]);

  // 当用户主动清空/重置截图槽位时，重置自动切换标志，并且如果无任何上传图片，强制回切 upload 面板
  useEffect(() => {
    const slot1 = slots.screenshot_1;
    const slot2 = slots.screenshot_2;
    const anyEmpty = slot1?.status === "empty" || slot2?.status === "empty";
    if (anyEmpty) {
      autoAdvancedRef.current = false;
    }

    const hasAnyUpload = Object.values(slots).some((slot) => slot.status !== "empty");
    if (!hasAnyUpload && !isAbnormalStatus) {
      setActivePanelTab("upload");
    }
  }, [slots, isAbnormalStatus]);

  // 异常状态(限流/删稿)下强行锁死为 confirm 态并隐藏上传
  useEffect(() => {
    if (isAbnormalStatus) {
      setActivePanelTab("confirm");
    }
  }, [isAbnormalStatus]);

  // 2. 快捷键：Ctrl+Enter 快捷提交，Esc 切换 Tab 面板
  const isSubmittingRef = useRef(isSubmitting);
  const canSubmitRef = useRef(canActuallySubmit);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);
  useEffect(() => { canSubmitRef.current = canActuallySubmit; }, [canActuallySubmit]);

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isSubmittingRef.current) return;
      const target = event.target as HTMLElement | null;

      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const cmdEnter = event.key === "Enter" && (isMac ? event.metaKey : event.ctrlKey);

      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
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

      if (event.key === "Escape") {
        if (document.querySelector('[role="dialog"]')) {
          return;
        }
        event.preventDefault();
        setActivePanelTab((tab) => (tab === "upload" ? "confirm" : "upload"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerSubmit]);




  if (!account) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="text-[13px] text-stone-500">
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
          <div 
            className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] select-none"
          >
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#6FAA7D]/5 border border-[#6FAA7D]/10">
              <svg
                className="size-8 text-[#6FAA7D]"
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
            <h3 className="text-[18px] font-medium tracking-tight text-stone-700">
              数据提交成功
            </h3>
            <p className="mt-2 text-[13px] text-stone-500">
              归属日期：{meta.bizDate}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setCountdown(null);
                  setHasUserInteracted(true);
                  setIsSubmitted(false);
                  setSubmittedVideo(null);
                  setQualityCheck({ data: null, loading: false });
                  onCancel?.();
                }}
                className="h-9 rounded-xl border-stone-200 px-4 text-[12px] text-stone-700 hover:bg-stone-50"
              >
                返回
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={qualityCheck.loading}
                onClick={(e) => {
                  e.stopPropagation();
                  setCountdown(null);
                  setHasUserInteracted(true);
                  handleQualityCheck();
                }}
                className="h-9 rounded-xl border-stone-200 px-4 text-[12px] text-stone-700 hover:bg-stone-50"
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
            <div className="mt-4 pt-4 border-t border-stone-100 flex justify-center">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCountdown(null);
                  setHasUserInteracted(true);
                  handleGoToGrowth();
                }}
                className="w-full max-w-xs h-10 rounded-xl bg-[#D97757] hover:bg-[#C96442] text-white font-medium text-[13px] transition-all duration-150 flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                去查看我的成长与大盘数据 🚀 {countdown !== null ? `(${countdown}s)` : ""}
              </Button>
            </div>
          </div>

          {qualityCheck.data ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 items-center justify-center rounded-lg px-2 text-[12px] font-medium",
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
                <span className="text-[12px] text-stone-500">
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
                        <p className="text-[13px] font-medium text-stone-700">
                          {issue.title}
                        </p>
                        <p className="text-[12px] text-stone-500">
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
                        className="h-8 shrink-0 rounded-xl border-stone-200 px-3 text-[12px] text-stone-700 hover:bg-stone-50"
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
            <DialogContent className="max-w-md rounded-2xl border border-stone-200 bg-white p-0 shadow-xl">
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
                        "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-xl",
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
            <div className="mx-auto max-w-3xl space-y-6 py-2">
              {/* 1. 局部双态自管理容器 */}
              <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-medium text-stone-700">核心指标与截图</span>
                    <div className="flex items-center gap-2">
                      <VideoStatusSegmented
                        value={meta.anomalyStatus}
                        onChange={(value) => updateMeta("anomalyStatus", value)}
                      />
                      {meta.anomalyStatus === "abnormal" && (
                        <select
                          value={meta.punishType || "限流"}
                          onChange={(e) => updateMeta("punishType", e.target.value)}
                          className="h-9 rounded-full border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 shadow-sm outline-none focus:border-stone-300 focus:ring-1 focus:ring-stone-200"
                        >
                          <option value="限流">限流</option>
                          <option value="删稿">删稿</option>
                          <option value="投流">投流</option>
                          <option value="活动干预">活动干预</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* 仅当有已上传图片时且处于正常状态下显示 Tab 切换 */}
                  {!isAbnormalStatus && Object.values(slots).some((slot) => slot.status !== "empty") && (
                    <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
                      <button
                        type="button"
                        onClick={() => setActivePanelTab("upload")}
                        title="Esc 快速切换"
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-150",
                          activePanelTab === "upload"
                            ? "bg-white text-stone-700 shadow-sm"
                            : "text-stone-500 hover:text-stone-700"
                        )}
                      >
                        截图列表
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePanelTab("confirm")}
                        title="Esc 快速切换"
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-150",
                          activePanelTab === "confirm"
                            ? "bg-white text-stone-700 shadow-sm"
                            : "text-stone-500 hover:text-stone-700"
                        )}
                      >
                        指标核对
                      </button>
                    </div>
                  )}
                </div>

                {/* 局部面板过渡内容：锁定高度，防抖，支持 smooth scroll/overflow */}
                <div className="min-h-[290px] max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                  {activePanelTab === "upload" ? (
                    <div ref={slotsSectionRef} className="space-y-4">
                      <截图槽位区
                        slots={slots}
                        onSelectFile={handleSlotUpload}
                        onUploadFiles={handleUnifiedUpload}
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
                  ) : (
                    <motion.div
                      ref={metricsSectionRef}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
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
                    </motion.div>
                  )}
                </div>
              </div>

              {/* 2. 视频信息及基础元数据表单（常驻底层，防焦点丢失） */}
              <div
                ref={metaSectionRef}
                className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-6 space-y-6"
              >
                <div className="space-y-1 rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-stone-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && meta.anomalyStatus !== "abnormal" && issueSummary.missingRequiredMeta.includes("videoTitle")}>
                  <Label htmlFor="video_title" className="text-[13px] font-medium text-stone-500">视频标题 {meta.anomalyStatus !== "abnormal" && <span className="text-[#C9604D]">*</span>}</Label>
                  <Input
                    id="video_title"
                    value={meta.videoTitle}
                    onChange={(event) => updateMeta("videoTitle", event.target.value)}
                    placeholder="输入视频标题"
                    className="h-10 rounded-xl bg-stone-100/70 border-transparent text-[13px] text-stone-700 focus:bg-white focus:border-stone-200 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150"
                    aria-invalid={hasAttemptedSubmit && meta.anomalyStatus !== "abnormal" && issueSummary.missingRequiredMeta.includes("videoTitle") ? "true" : "false"}
                    aria-describedby={hasAttemptedSubmit && meta.anomalyStatus !== "abnormal" && issueSummary.missingRequiredMeta.includes("videoTitle") ? "video_title_error" : undefined}
                  />
                  {hasAttemptedSubmit && meta.anomalyStatus !== "abnormal" && issueSummary.missingRequiredMeta.includes("videoTitle") ? (
                    <p id="video_title_error" role="alert" className="text-[12px] font-medium text-[#C9604D]">必填，仍未填写视频标题</p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-stone-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content")}>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="content" className="text-[13px] font-medium text-stone-500">文案 <span className="text-[#C9604D]">*</span></Label>
                    <button
                      type="button"
                      onClick={handlePasteContent}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 hover:text-stone-700 transition-colors duration-150 focus-visible:outline-none"
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
                    className="mt-1 min-h-[140px] w-full resize-y rounded-xl border border-transparent bg-stone-100/70 px-4 py-3 text-[13px] leading-[1.7] tracking-[0.005em] text-stone-700 placeholder:text-stone-500 outline-none focus:bg-white focus:border-stone-200 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150"
                    aria-invalid={hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content") ? "true" : "false"}
                    aria-describedby={hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content") ? "content_error" : undefined}
                  />
                  {hasAttemptedSubmit && issueSummary.missingRequiredMeta.includes("content") ? (
                    <p id="content_error" role="alert" className="mt-1 text-[12px] font-medium text-[#C9604D]">必填，仍未填写文案</p>
                  ) : null}
                </div>

                {/* 关联选题字段 (任务 F) */}
                <div className="rounded-xl border border-stone-200/70 bg-stone-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[13px] font-semibold text-stone-705 flex items-center gap-1.5 select-none">
                      <Lightbulb className="size-4 text-[#D97757]" />
                      <span>关联选题库</span>
                    </Label>
                    {!urlLocked ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSearchDialogOpen(true)}
                          className="text-[12px] font-medium text-[#8AA8C7] hover:underline focus:outline-none cursor-pointer"
                        >
                          换一个
                        </button>
                        <span className="text-stone-300 text-[10px]">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            updateMeta("topicId", null);
                            isManuallySetRef.current = true;
                            setIsManuallySet(true);
                          }}
                          className="text-[12px] font-medium text-stone-400 hover:text-stone-600 focus:outline-none cursor-pointer"
                        >
                          暂无对应
                        </button>
                        <span className="text-stone-300 text-[10px]">|</span>
                        <button
                          type="button"
                          onClick={() => triggerGlobalTopicCreate({ title: meta.videoTitle })}
                          className="text-[12px] font-medium text-[#D97757] hover:underline inline-flex items-center gap-0.5 focus:outline-none cursor-pointer"
                        >
                          <Plus className="size-3 stroke-[2.5]" />
                          <span>新建选题</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {meta.topicId ? (
                    <div className="flex items-center justify-between rounded-lg border border-[#8AA8C7]/20 bg-white p-3 shadow-[0_2px_8px_-3px_rgba(138,168,199,0.1)]">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {selectedTopicCategory && (
                          <span className="shrink-0 inline-flex items-center rounded-md bg-[#8AA8C7]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#8AA8C7]">
                            {selectedTopicCategory}
                          </span>
                        )}
                        <span className="text-[12.5px] font-semibold text-stone-800 truncate">
                          {topicNameError === "not_found"
                            ? "未找到该选题（可能已被删除）"
                            : topicNameError === "load_failed"
                              ? "选题信息加载失败"
                              : selectedTopicName || "获取选题信息中..."}
                        </span>
                      </div>
                      
                      {topicNameError === "not_found" ? (
                        <button
                          type="button"
                          onClick={() => {
                            updateMeta("topicId", null);
                            urlLockedRef.current = false;
                            isManuallySetRef.current = true;
                            setUrlLocked(false);
                            setIsManuallySet(true);
                          }}
                          className="shrink-0 text-[10.5px] text-stone-500 hover:text-stone-700 bg-stone-100 rounded-md px-1.5 py-0.5 font-medium"
                        >
                          清除关联
                        </button>
                      ) : topicNameError === "load_failed" ? (
                        <button
                          type="button"
                          onClick={() => setTopicNameRetrySeq((value) => value + 1)}
                          className="shrink-0 text-[10.5px] text-stone-500 hover:text-stone-700 bg-stone-100 rounded-md px-1.5 py-0.5 font-medium"
                        >
                          重试
                        </button>
                      ) : urlLocked ? (
                        <span className="shrink-0 flex items-center gap-0.5 text-[10.5px] text-stone-400 bg-stone-100 rounded-md px-1.5 py-0.5 font-medium select-none">
                          <Lock className="size-3 text-stone-400" />
                          认领锁定
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10.5px] text-[#6FAA7D] bg-[#6FAA7D]/5 rounded-md px-1.5 py-0.5 font-medium select-none">
                          已关联
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11.5px] text-stone-400 leading-normal">
                        {loadingSuggestions ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <Loader2 className="size-3 animate-spin text-stone-400" />
                            <span>正在匹配关联的选题...</span>
                          </div>
                        ) : suggestFailed ? (
                          <div className="flex items-center gap-2 py-1">
                            <span className="text-[#C9604D]">选题推荐加载失败</span>
                            <button
                              type="button"
                              onClick={() => setSuggestRetrySeq((value) => value + 1)}
                              className="text-[11.5px] font-medium text-stone-500 hover:text-stone-700 underline-offset-2 hover:underline"
                            >
                              重试
                            </button>
                          </div>
                        ) : isManuallySet && !urlLocked ? (
                          <div className="flex items-center justify-between gap-3 py-1">
                            <span className="text-stone-500">已标记：本条作品暂无对应选题</span>
                            <button
                              type="button"
                              onClick={() => {
                                isManuallySetRef.current = false;
                                setIsManuallySet(false);
                              }}
                              className="shrink-0 text-[11.5px] font-medium text-[#8AA8C7] hover:underline"
                            >
                              重新自动匹配
                            </button>
                          </div>
                        ) : suggestions.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="block text-[11px] font-medium text-stone-400">系统根据标题/文案推荐选题：</span>
                            <div className="flex flex-wrap gap-1.5">
                              {suggestions.slice(0, 2).map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    updateMeta("topicId", s.id);
                                    isManuallySetRef.current = true;
                                    setIsManuallySet(true);
                                  }}
                                  className="inline-flex items-center rounded-lg border border-stone-200 bg-white hover:border-stone-300 px-2 py-1 text-[11px] font-medium text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
                                >
                                  {s.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="italic block py-1">输入标题或文案，系统将自动匹配选题库。</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {meta.anomalyStatus === "abnormal" && (
                  <div className="flex flex-col gap-4 rounded-xl border border-transparent bg-stone-50 p-5">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="platform_notice" className="text-[13px] font-medium text-stone-600">平台通知 (选填)</Label>
                      <Input
                        id="platform_notice"
                        value={meta.platformNotice || ""}
                        onChange={(e) => updateMeta("platformNotice", e.target.value)}
                        placeholder="若有平台处罚通知，请复制内容粘贴到此处"
                        className="h-10 rounded-xl bg-white border-transparent text-[13px] text-stone-700 focus:bg-white focus:border-stone-200 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="appeal" className="text-[13px] font-medium text-stone-600">申诉进展 (选填)</Label>
                      <Input
                        id="appeal"
                        value={meta.appeal || ""}
                        onChange={(e) => updateMeta("appeal", e.target.value)}
                        placeholder="如果已申诉，记录当前申诉状态或结果"
                        className="h-10 rounded-xl bg-white border-transparent text-[13px] text-stone-700 focus:bg-white focus:border-stone-200 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150"
                      />
                    </div>
                  </div>
                )}

                {/* Topic tag & Video form (Memory layer) */}
                <div className="rounded-lg border-t border-stone-100 pt-4">
                  {!isMemoryExpanded ? (
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-stone-500 font-medium">已记配置：</span>
                        <span className="bg-stone-100 text-stone-500 rounded-lg px-2 py-1 text-[13px]">
                          {meta.topicTag}
                        </span>
                        <span className="bg-stone-100 text-stone-500 rounded-lg px-2 py-1 text-[13px]">
                          {meta.videoForm}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMemoryExpanded(true)}
                        className="text-[13px] font-medium text-[#D97757] hover:text-[#C96442] transition-colors"
                      >
                        修改
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-lg bg-stone-50/50 p-4 border border-stone-200/40">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div ref={topicTagSectionRef} className="space-y-2 rounded-lg border border-transparent p-0 transition-colors data-[missing=true]:border-[#C9604D]/40 data-[missing=true]:bg-stone-50 data-[missing=true]:p-3" data-missing={hasAttemptedSubmit && issueSummary.topicTagMissing}>
                          <Label className="text-[13px] font-medium text-stone-500">话题标签 <span className="text-[#C9604D]">*</span></Label>
                          <div
                            role="group"
                            aria-label="话题标签"
                            aria-describedby={hasAttemptedSubmit && issueSummary.topicTagMissing ? "topic_tag_error" : undefined}
                            className="grid grid-cols-2 gap-2"
                          >
                            {(["干货", "复盘"] as const).map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => updateMeta("topicTag", meta.topicTag === tag ? "" : tag)}
                                className={cn(
                                  "h-10 rounded-lg border transition-all duration-150 text-[13px] font-medium",
                                  meta.topicTag === tag
                                    ? "border-[#D97757] bg-[#D97757] text-white hover:bg-[#C96442]"
                                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                                )}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                          {hasAttemptedSubmit && issueSummary.topicTagMissing ? (
                            <p id="topic_tag_error" role="alert" className="text-[12px] font-medium text-[#C9604D]">必填，仍未选择话题标签</p>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[13px] font-medium text-stone-500">视频形式 <span className="text-[#C9604D]">*</span></Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(["出镜", "图文"] as const).map((form) => (
                              <button
                                key={form}
                                type="button"
                                onClick={() => updateMeta("videoForm", form)}
                                className={cn(
                                  "h-10 rounded-lg border transition-all duration-150 text-[13px] font-medium",
                                  meta.videoForm === form
                                    ? "border-[#D97757] bg-[#D97757] text-white hover:bg-[#C96442]"
                                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                                )}
                              >
                                {form}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {meta.topicTag && meta.videoForm && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setIsMemoryExpanded(false)}
                            className="text-[12px] font-medium text-stone-500 hover:text-stone-700 transition-colors"
                          >
                            收起选项
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Publish & Upload time accordion (Default settings) */}
                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsMoreSettingsExpanded(!isMoreSettingsExpanded)}
                    className="flex items-center gap-1.5 text-[13px] font-medium text-stone-500 hover:text-stone-700 transition-colors focus-visible:outline-none"
                  >
                    <ChevronDown className={cn("size-4 stroke-[1.5] transition-transform duration-150", isMoreSettingsExpanded && "rotate-180")} />
                    {isMoreSettingsExpanded ? "收起更多设置" : "展开更多设置"}
                  </button>
                  
                  <AnimatePresence initial={false}>
                    {isMoreSettingsExpanded && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="grid gap-4 sm:grid-cols-2 pt-1"
                      >
                        <div className="space-y-1">
                          <Label htmlFor="published_at" className="text-[13px] font-medium text-stone-500">发布时间</Label>
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
                            className="h-10 rounded-xl bg-stone-100/70 border-transparent text-[13px] text-stone-700 focus:bg-white focus:border-stone-200 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[13px] font-medium text-stone-500">上传时间</Label>
                          <div className="flex h-10 items-center rounded-xl border border-stone-200 bg-stone-100/70 px-3 text-[13px] text-stone-500">
                            {meta.uploadedAt || "--"}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* 3. 底部主操作栏 */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                <div className="flex items-center gap-3">
                  {!canActuallySubmit ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D99E55] bg-white px-2.5 py-1 text-[12px] font-medium text-[#D99E55]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55]" />
                      <span>{issueSummary.reason || "请补全必要信息"}</span>
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6FAA7D] bg-white px-2.5 py-1 text-[12px] font-medium text-[#6FAA7D]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
                        <span>已就绪,可提交</span>
                      </span>
                      <span className="text-[12px] text-stone-400">⌘/Ctrl + Enter 快捷提交</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  {isBackfillMode || submittedViewActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      className="h-10 rounded-xl px-5 text-[13px] font-medium"
                    >
                      取消
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    onClick={triggerSubmit}
                    disabled={isSubmitting || !canActuallySubmit}
                    className="h-10 rounded-xl px-6 text-[13px] font-medium bg-[#D97757] hover:bg-[#C96442] text-white disabled:bg-[#D97757]/40 disabled:text-white/70 disabled:cursor-not-allowed transition-all duration-150"
                  >
                    {submitButtonLabel}
                  </Button>
                </div>
              </div>
            </div>
          </motion.form>
        </>
      )}

      <AnimatePresence>
        {isRedirecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20 animate-bounce">
                <Zap className="size-6 stroke-[2] fill-current" />
              </div>
              <div className="space-y-1">
                <h4 className="text-[14px] font-semibold text-stone-900">数据同步中</h4>
                <p className="text-[12px] text-stone-500">正在前往数据分析...</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 模糊选择选题 Dialog */}
      <Dialog
        open={searchDialogOpen}
        onOpenChange={(open) => {
          setSearchDialogOpen(open);
          if (open) {
            setSearching(true);
            setSearchError(false);
          } else {
            setSearchQuery("");
            setSearchResults([]);
            setSearchError(false);
            setSearching(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md w-full max-w-[calc(100%-2rem)] md:max-w-[460px] p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle>选择关联的子选题</DialogTitle>
            <DialogDescription>
              模糊搜索您在选题池里已录入的子题。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入关键词进行搜索..."
              className="h-9.5 rounded-xl border border-stone-200"
            />
            {searching ? (
              <div className="flex h-36 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-stone-400" />
              </div>
            ) : searchError ? (
              <div className="flex h-36 items-center justify-center text-[12.5px] text-[#C9604D]">
                搜索失败，请重试
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-[12.5px] text-stone-400">
                未搜索到匹配的选题
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      updateMeta("topicId", item.id);
                      isManuallySetRef.current = true;
                      setIsManuallySet(true);
                      setSearchDialogOpen(false);
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchError(false);
                      setSearching(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-stone-200/60 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 p-3 text-left text-[12.5px] font-medium text-stone-700 transition-colors cursor-pointer"
                  >
                    <span className="truncate max-w-[240px] text-stone-800 font-semibold">{item.title}</span>
                    <span className="text-[10px] bg-stone-200/85 px-1.5 py-0.5 rounded-md text-stone-500 font-semibold">
                      {getTopicName(item.topics) || "常规"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchDialogOpen(false);
                setSearchQuery("");
                setSearchResults([]);
                setSearchError(false);
                setSearching(false);
              }}
              className="rounded-lg"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WIZARD_STEPS = [
  { key: "screenshots", label: "截图与识别", hint: "上传 2 张关键截图，OCR 自动识别成功后会进入下一步。" },
  { key: "metrics", label: "数据指标", hint: "核对识别结果，按需补全播放、互动与留存指标。" },
  { key: "info", label: "视频信息", hint: "补全标题、文案与发布时间，提交即归档到团队数据流。" },
];

const VIDEO_STATUS_OPTIONS: Array<{
  value: AnomalyStatus;
  label: string;
  dotClass: string;
  activeTextClass: string;
}> = [
  { value: "normal", label: "正常", dotClass: "bg-[#6FAA7D]", activeTextClass: "text-stone-700" },
  { value: "abnormal", label: "异常", dotClass: "bg-[#D99E55]", activeTextClass: "text-[#D99E55]" },
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
    const currentIndex = VIDEO_STATUS_OPTIONS.findIndex((option) => option.value === value);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % VIDEO_STATUS_OPTIONS.length
        : (currentIndex - 1 + VIDEO_STATUS_OPTIONS.length) % VIDEO_STATUS_OPTIONS.length;
    onChange(VIDEO_STATUS_OPTIONS[nextIndex].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label="视频状态"
      onKeyDown={handleKeyDown}
      className="inline-flex h-9 items-center rounded-full border border-stone-200 bg-stone-50 p-0.5"
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
                : "text-stone-500 hover:text-stone-700",
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

"use client";

import { useMemo, useState, type FormEvent } from "react";
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
  SubmissionAssetMeta,
  Video,
  VideoTagReviewDimension,
} from "@/types";
import { 提交成功卡 } from "@/components/submission/提交成功卡";
import { 提交进度条 } from "@/components/submission/提交进度条";
import { 指标分组区 } from "@/components/submission/指标分组区";
import { 截图槽位区 } from "@/components/submission/截图槽位区";
import {
  canSubmit,
  createInitialSubmissionState,
  getSubmissionStage,
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
  getBizDateHelperText,
  getRecentBizDateRange,
  isBizDateSelectable,
  syncPublishedAtAndText,
  toManualFieldState,
} from "@/components/submission/填报表单状态";

interface VideoSubmitFormProps {
  account: { id: string; name: string; content_direction: string | null } | null;
  userId: string;
  today: string;
  onSubmitted: (
    video: Video,
    aiTags: Array<{
      tag_dimension: VideoTagReviewDimension;
      tag_value: string;
      confidence: number | null;
      reason: string | null;
    }>
  ) => void;
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
    topicTag: "",
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

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

function buildAssets(slots: Record<SubmissionSlotRole, SlotViewState>): SubmissionAssetMeta[] {
  return (Object.keys(slots) as SubmissionSlotRole[])
    .map((role) => slots[role])
    .filter((slot) => slot.assetUrl)
    .map((slot) => ({
      role: slot.role,
      url: slot.assetUrl!,
      confirmed: slot.confirmed,
      confidence_score: slot.confidenceScore,
    }));
}

export function VideoSubmitForm({ account, userId, today, onSubmitted }: VideoSubmitFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [meta, setMeta] = useState<FormMetaState>(() => createInitialMeta(today));
  const [fields, setFields] = useState<SubmissionState["fields"]>(() => createEditableFields());
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, SlotViewState>>(() => createEditableSlots());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [deleteTargetRole, setDeleteTargetRole] = useState<SubmissionSlotRole | null>(null);
  const [keywordInput, setKeywordInput] = useState("");

  const recentBizDates = useMemo(() => getRecentBizDateRange(today), [today]);
  const keywordSuggestions = useMemo(() => extractKeywordSuggestions(meta.content), [meta.content]);
  const submissionState = buildSubmissionState(slots, fields, isSubmitted);
  const submitCheck = canSubmit(submissionState);
  const topicTagMissing = !meta.topicTag;
  const canActuallySubmit = submitCheck.ok && !topicTagMissing;
  const currentStage = getSubmissionStage(submissionState);
  const bizDateHelper = getBizDateHelperText(meta.bizDate);

  function updateMeta<Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) {
    setMeta((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setMeta(createInitialMeta(today));
    setFields(createEditableFields());
    setSlots(createEditableSlots());
    setIsSubmitted(false);
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
            requiresManualConfirmation: confidence?.[key as keyof typeof confidence] === "low",
            confirmed: confidence?.[key as keyof typeof confidence] !== "low",
            confidenceScore: mapConfidenceToScore(confidence?.[key as keyof typeof confidence]),
          };
        }
      }

      return next;
    });
  }

  async function handleSlotUpload(role: SubmissionSlotRole, file: File) {
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
        },
      }));

      if (data.slot_status === "failed") {
        feedbackToast.error(normalizedSlotError || OCR_FAIL_MESSAGE);
        return;
      }

      const detectedType = (payload as { screenshot_type?: string }).screenshot_type;

      if (detectedType === "data" && data.recognized_fields) {
        applyOverviewFields(data.recognized_fields, data.confidence);
      }

      if (detectedType === "retention" && data.recognized_fields) {
        setFields((current) => ({
          ...current,
          avg_play_duration: { ...current.avg_play_duration, source: "ocr", requiresManualConfirmation: true, confirmed: false },
          bounce_rate_2s: { ...current.bounce_rate_2s, source: "ocr", requiresManualConfirmation: true, confirmed: false },
          completion_rate_5s: { ...current.completion_rate_5s, source: "ocr", requiresManualConfirmation: true, confirmed: false },
          completion_rate: { ...current.completion_rate, source: "ocr", requiresManualConfirmation: true, confirmed: false },
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

  function confirmLowConfidenceItems() {
    setSlots((current) => {
      const next = { ...current };
      for (const role of Object.keys(next) as SubmissionSlotRole[]) {
        if (next[role].status === "pending_confirm") {
          next[role] = {
            ...next[role],
            status: "confirmed",
            confirmed: true,
            requiresManualConfirmation: false,
          };
        }
      }
      return next;
    });

    setFields((current) => {
      const next = { ...current };
      for (const key of Object.keys(next) as EditableMetricKey[]) {
        if (next[key].requiresManualConfirmation) {
          next[key] = {
            ...next[key],
            requiresManualConfirmation: false,
            confirmed: true,
          };
        }
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!account) {
      feedbackToast.error("请先选择提交账号");
      return;
    }

    if (!submitCheck.ok) {
      feedbackToast.error(submitCheck.reason || "当前还不能提交");
      return;
    }

    if (!meta.topicTag) {
      feedbackToast.error("请选择话题标签（干货或复盘）");
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
      setIsSubmitted(true);
      onSubmitted(submittedVideo, aiTags);
      feedbackToast.success("数据提交成功", {
        duration: 2000,
        className:
          "fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
      });
      window.setTimeout(() => {
        resetForm();
      }, 2200);
    } catch (error) {
      feedbackToast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

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
        className="space-y-5 pb-[140px] md:pb-6"
      >
        <motion.div variants={itemVariants}>
          <MotionCard className="border-none bg-white/70">
            <div className="space-y-5 p-5">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                  数据填报
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  当前账号：{account.name} · 内容方向：{account.content_direction?.trim() || "未设置内容方向"}
                </p>
              </div>

              <提交进度条 currentStage={currentStage} />
            </div>
          </MotionCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <MotionCard className="border-none bg-white/70">
            <div className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="video_url">抖音视频链接</Label>
                  <Input
                    id="video_url"
                    value={meta.videoUrl}
                    onChange={(event) => updateMeta("videoUrl", event.target.value)}
                    placeholder="https://www.douyin.com/video/..."
                    className="h-11 rounded-[var(--radius-lg)] bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="video_title">视频标题</Label>
                  <Input
                    id="video_title"
                    value={meta.videoTitle}
                    onChange={(event) => updateMeta("videoTitle", event.target.value)}
                    placeholder="输入视频标题"
                    className="h-11 rounded-[var(--radius-lg)] bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">文案</Label>
                <textarea
                  id="content"
                  value={meta.content}
                  onChange={(event) => updateMeta("content", event.target.value)}
                  placeholder="粘贴视频文案，可选"
                  className="min-h-[120px] w-full rounded-[var(--radius-lg)] border border-black/8 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:rgba(0,122,255,0.16)]"
                />
              </div>

              <div className="space-y-3">
                <Label>话题标签 <span className="text-red-500">*</span></Label>
                <div className="flex gap-3">
                  {(["干货", "复盘"] as const).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => updateMeta("topicTag", meta.topicTag === tag ? "" : tag)}
                      className={[
                        "flex-1 h-11 rounded-[var(--radius-lg)] border text-sm font-medium transition-all",
                        meta.topicTag === tag
                          ? "border-[#007AFF] bg-[#007AFF] text-white"
                          : "border-black/10 bg-white text-[var(--color-text-primary)] hover:border-[#007AFF]/50",
                      ].join(" ")}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>
                  内容标签{" "}
                  <span className="text-xs text-[var(--color-text-secondary)] font-normal">最多3个</span>
                </Label>
                {keywordSuggestions.length > 0 && (
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
                          "rounded-full border px-3 py-1 text-xs transition-all",
                          meta.contentKeywords.includes(kw)
                            ? "border-[#007AFF] bg-[#007AFF] text-white"
                            : "border-black/10 bg-white text-[var(--color-text-secondary)] hover:border-[#007AFF]/50 disabled:opacity-40",
                        ].join(" ")}
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                )}
                {meta.contentKeywords.length > 0 && (
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
                )}
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && keywordInput.trim() && meta.contentKeywords.length < 3) {
                        e.preventDefault();
                        const kw = keywordInput.trim();
                        if (!meta.contentKeywords.includes(kw)) {
                          updateMeta("contentKeywords", [...meta.contentKeywords, kw]);
                        }
                        setKeywordInput("");
                      }
                    }}
                    placeholder={meta.contentKeywords.length >= 3 ? "最多3个标签" : "输入后按空格或回车添加"}
                    disabled={meta.contentKeywords.length >= 3}
                    className="h-9 rounded-[var(--radius-lg)] bg-white text-sm"
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
                    className="h-9 rounded-[var(--radius-lg)] px-3 text-sm"
                  >
                    添加
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>异常状态</Label>
                <Select
                  value={meta.anomalyStatus}
                  onValueChange={(value) => updateMeta("anomalyStatus", value as AnomalyStatus)}
                >
                  <SelectTrigger className="h-11 rounded-[var(--radius-lg)] bg-white">
                    <SelectValue placeholder="请选择异常状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {ANOMALY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    className="h-11 rounded-[var(--radius-lg)] bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>上传时间</Label>
                  <div className="flex h-11 items-center rounded-[var(--radius-lg)] border border-black/8 bg-[color:rgba(255,255,255,0.7)] px-3 text-sm text-[var(--color-text-secondary)]">
                    {meta.uploadedAt}
                  </div>
                </div>
              </div>
            </div>
          </MotionCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <截图槽位区
            slots={slots}
            onSelectFile={handleSlotUpload}
            onDelete={(role) => setDeleteTargetRole(role)}
            onRetry={handleSlotRetry}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <指标分组区 fields={fields} onFieldChange={updateField} anomalyStatus={meta.anomalyStatus} />
        </motion.div>

        <motion.div variants={itemVariants} className="hidden md:block">
          <MotionCard className="border-none bg-white/70">
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {submitCheck.ok ? "已满足提交条件" : submitCheck.reason || "请补全表单后提交"}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  必传槽位确认 + 低置信字段确认后才可提交。
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" className="h-11 rounded-[10px] px-6" onClick={confirmLowConfidenceItems}>
                  一键确认低置信
                </Button>
                <Button type="button" variant="outline" className="h-11 rounded-[10px] px-6" onClick={resetForm}>
                  重置表单
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !canActuallySubmit}
                  title={canActuallySubmit ? undefined : (topicTagMissing ? "请选择话题标签" : submitCheck.reason || undefined)}
                  className="h-11 rounded-[10px] px-6"
                >
                  {isSubmitting ? "提交中..." : "提交视频数据"}
                </Button>
              </div>
            </div>
          </MotionCard>
        </motion.div>
      </motion.form>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/92 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-[18px] md:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {canActuallySubmit ? "已满足提交条件" : (topicTagMissing ? "请选择话题标签（干货或复盘）" : submitCheck.reason || "请补全表单后提交")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" className="h-11 rounded-[10px] px-2 text-xs" onClick={confirmLowConfidenceItems}>
              确认低置信
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-[10px] px-2 text-xs" onClick={resetForm}>
              重置
            </Button>
            <Button
              type="submit"
              form="video-submit-form"
              disabled={isSubmitting || !canActuallySubmit}
              title={canActuallySubmit ? undefined : (topicTagMissing ? "请选择话题标签" : submitCheck.reason || undefined)}
              className="h-11 rounded-[10px] px-2 text-xs"
            >
              {isSubmitting ? "提交中..." : "提交"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Video, AnomalyStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getDefaultPublishedAtValue } from "@/lib/日报";

interface VideoSubmitFormProps {
  account: { id: string; name: string; content_direction: string | null } | null;
  userId: string;
  today: string;
  onSubmitted: (video: Video) => void;
}

type OcrFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain";

type OcrResponse = {
  data?: Partial<Record<OcrFieldKey, number | null>>;
  error?: string;
};

type SubmitResponse = {
  data?: Video;
  video?: Video;
  error?: string;
};

type MetricFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain"
  | "follower_loss"
  | "follower_convert";

type FormState = {
  video_url: string;
  video_title: string;
  content: string;
  published_at: string;
  anomaly_status: AnomalyStatus;
  play_count: string;
  likes: string;
  comments: string;
  shares: string;
  favorites: string;
  follower_gain: string;
  follower_loss: string;
  follower_convert: string;
};

const ANOMALY_OPTIONS: AnomalyStatus[] = ["正常", "删稿", "限流", "投流", "活动干预", "未满24h"];
const OCR_FIELD_KEYS: OcrFieldKey[] = [
  "play_count",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_gain",
];
const METRIC_FIELDS: Array<{ key: MetricFieldKey; label: string; step?: string }> = [
  { key: "play_count", label: "播放量", step: "1" },
  { key: "likes", label: "点赞", step: "1" },
  { key: "comments", label: "评论", step: "1" },
  { key: "shares", label: "分享", step: "1" },
  { key: "favorites", label: "收藏", step: "1" },
  { key: "follower_gain", label: "涨粉", step: "1" },
  { key: "follower_loss", label: "掉粉", step: "1" },
  { key: "follower_convert", label: "导粉", step: "1" },
];

function createInitialState(): FormState {
  return {
    video_url: "",
    video_title: "",
    content: "",
    published_at: getDefaultPublishedAtValue(),
    anomaly_status: "正常",
    play_count: "",
    likes: "",
    comments: "",
    shares: "",
    favorites: "",
    follower_gain: "",
    follower_loss: "0",
    follower_convert: "0",
  };
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

export function VideoSubmitForm({ account, userId, today, onSubmitted }: VideoSubmitFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<FormState>(() => createInitialState());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(createInitialState());
  }

  async function handleScreenshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user && !userId) {
        throw new Error("登录状态已失效，请刷新页面后重试");
      }

      const formData = new FormData();
      formData.append("image", file);
      formData.append("file", file);

      const response = await fetch("/api/ocr-screenshot", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as OcrResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "截图识别失败，请稍后重试");
      }

      setForm((current) => {
        const next = { ...current };
        for (const key of OCR_FIELD_KEYS) {
          const value = payload.data?.[key];
          if (value != null) {
            next[key] = String(value);
          }
        }
        return next;
      });

      toast.success("截图识别完成，已回填核心指标");
    } catch (error) {
      toast.error((error as Error).message || "截图识别失败，请手动填写");
    } finally {
      event.target.value = "";
      setIsOcrLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!account) {
      toast.error("请先选择提交账号");
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_id: account.id,
          video_url: normalizeOptionalText(form.video_url),
          video_title: normalizeOptionalText(form.video_title),
          content: normalizeOptionalText(form.content),
          published_at: form.published_at || getDefaultPublishedAtValue(),
          anomaly_status: form.anomaly_status,
          metrics: {
            play_count: parseMetric(form.play_count),
            likes: parseMetric(form.likes),
            comments: parseMetric(form.comments),
            shares: parseMetric(form.shares),
            favorites: parseMetric(form.favorites),
            follower_gain: parseMetric(form.follower_gain),
            follower_loss: parseMetric(form.follower_loss),
            follower_convert: parseMetric(form.follower_convert),
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

      onSubmitted(submittedVideo);
      resetForm();
      toast.success("视频数据提交成功");
    } catch (error) {
      toast.error((error as Error).message || "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!account) {
    return (
      <Card className="rounded-[28px] border border-dashed border-border/70 bg-muted/30 shadow-sm">
        <CardContent className="px-6 py-8 text-sm text-muted-foreground">
          请先选择一个视频账号，再填写提交信息。
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card className="rounded-[28px] border-border/60 bg-background/90 shadow-sm backdrop-blur-md">
        <CardContent className="space-y-5 px-6 py-6 sm:px-7">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">视频信息</h3>
            <p className="text-sm text-muted-foreground">
              当前账号：{account.name} · 日期：{today}
            </p>
            <p className="text-sm text-muted-foreground">
              内容方向：{account.content_direction?.trim() || "未设置内容方向"}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="video_url">抖音视频链接</Label>
              <Input
                id="video_url"
                value={form.video_url}
                onChange={(event) => updateField("video_url", event.target.value)}
                placeholder="https://www.douyin.com/video/..."
                className="h-11 rounded-2xl bg-muted/35"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="video_title">视频标题</Label>
              <Input
                id="video_title"
                value={form.video_title}
                onChange={(event) => updateField("video_title", event.target.value)}
                placeholder="输入视频标题"
                className="h-11 rounded-2xl bg-muted/35"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">文案</Label>
            <textarea
              id="content"
              value={form.content}
              onChange={(event) => updateField("content", event.target.value)}
              placeholder="粘贴视频文案，可选"
              className="min-h-[132px] w-full resize-y rounded-2xl border border-input bg-muted/35 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="published_at">发布时间</Label>
              <Input
                id="published_at"
                type="datetime-local"
                value={form.published_at}
                onChange={(event) => updateField("published_at", event.target.value)}
                className="h-11 rounded-2xl bg-muted/35"
              />
            </div>

            <div className="space-y-2">
              <Label>异常状态</Label>
              <Select
                value={form.anomaly_status}
                onValueChange={(value) => updateField("anomaly_status", value as AnomalyStatus)}
              >
                <SelectTrigger className="h-11 rounded-2xl bg-muted/35">
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
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/60 bg-muted/20 shadow-sm backdrop-blur-md">
        <CardContent className="space-y-5 px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">截图识别</h3>
              <p className="text-sm text-muted-foreground">
                上传抖音截图后自动回填播放、互动和涨粉数据。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="video-screenshot">上传截图</Label>
              <Input
                id="video-screenshot"
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleScreenshotChange}
                disabled={isOcrLoading}
                className="h-11 rounded-2xl bg-background"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            {isOcrLoading
              ? "正在识别截图，请稍候。"
              : "支持 jpg、png、webp。识别后你仍可手动修改所有指标。"}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/60 bg-background/90 shadow-sm backdrop-blur-md">
        <CardContent className="space-y-5 px-6 py-6 sm:px-7">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">24h 指标</h3>
            <p className="text-sm text-muted-foreground">
              OCR 可自动填充，空值也支持直接手动录入。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {METRIC_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type="number"
                  min={0}
                  step={field.step}
                  value={form[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  className="h-11 rounded-2xl bg-muted/35"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={resetForm}
          disabled={isSubmitting || isOcrLoading}
          className="h-11 rounded-2xl px-6"
        >
          重置表单
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isOcrLoading}
          className="h-11 rounded-2xl px-6"
        >
          {isSubmitting ? "提交中..." : "提交视频数据"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
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
import { ScreenshotImport, type ScreenshotImportEditableValues } from "@/components/screenshot-import";
import { build24hSnapshotPayload } from "@/lib/video-admin";
import type { Video, VideoMetricsSnapshot } from "@/types";

const METRIC_FIELDS = [
  { key: "play_count", label: "播放量" },
  { key: "likes", label: "点赞" },
  { key: "comments", label: "评论" },
  { key: "shares", label: "分享" },
  { key: "favorites", label: "收藏" },
  { key: "follower_gain", label: "涨粉" },
  { key: "follower_loss", label: "掉粉" },
  { key: "follower_convert", label: "导粉" },
] as const;

type MetricKey = (typeof METRIC_FIELDS)[number]["key"];

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FormState = Record<MetricKey, string>;

interface Patch24hDialogProps {
  open: boolean;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: { video: VideoRow; snapshot: VideoMetricsSnapshot }) => void;
}

function createInitialState(snapshot: VideoMetricsSnapshot | null): FormState {
  return {
    play_count: snapshot?.play_count != null ? String(snapshot.play_count) : "",
    likes: snapshot?.likes != null ? String(snapshot.likes) : "",
    comments: snapshot?.comments != null ? String(snapshot.comments) : "",
    shares: snapshot?.shares != null ? String(snapshot.shares) : "",
    favorites: snapshot?.favorites != null ? String(snapshot.favorites) : "",
    follower_gain: snapshot?.follower_gain != null ? String(snapshot.follower_gain) : "",
    follower_loss: snapshot?.follower_loss != null ? String(snapshot.follower_loss) : "0",
    follower_convert: snapshot?.follower_convert != null ? String(snapshot.follower_convert) : "0",
  };
}

function parseMetric(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toScreenshotInitialValues(form: FormState): ScreenshotImportEditableValues {
  return {
    play_count: form.play_count,
    likes: form.likes,
    comments: form.comments,
    shares: form.shares,
    favorites: form.favorites,
    follower_gain: form.follower_gain,
  };
}

export function Patch24hDialog({ open, video, snapshot, onOpenChange, onSaved }: Patch24hDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => createInitialState(snapshot));

  const dialogKey = `${video?.id ?? "empty"}-${snapshot?.id ?? "new"}-${open ? "open" : "closed"}`;

  function updateField(key: MetricKey, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleImportConfirm(values: ScreenshotImportEditableValues) {
    setForm((current) => ({
      ...current,
      play_count: values.play_count,
      likes: values.likes,
      comments: values.comments,
      shares: values.shares,
      favorites: values.favorites,
      follower_gain: values.follower_gain,
    }));
    feedbackToast.success("OCR 结果已回填，可继续补充其余指标");
  }

  function handleSubmit() {
    if (!video) return;

    startTransition(async () => {
      const metrics = {
        play_count: parseMetric(form.play_count),
        likes: parseMetric(form.likes),
        comments: parseMetric(form.comments),
        shares: parseMetric(form.shares),
        favorites: parseMetric(form.favorites),
        follower_gain: parseMetric(form.follower_gain),
        follower_loss: parseMetric(form.follower_loss),
        follower_convert: parseMetric(form.follower_convert),
      };

      const snapshotPayload = build24hSnapshotPayload(video.id, metrics, null);

      const snapshotQuery = snapshot
        ? supabase.from("video_metrics_snapshots").update(snapshotPayload).eq("id", snapshot.id)
        : supabase.from("video_metrics_snapshots").insert(snapshotPayload);

      const { error: snapshotError } = await snapshotQuery;
      if (snapshotError) {
        feedbackToast.error(snapshotError.message || "24h 数据保存失败");
        return;
      }

      if (video.anomaly_status === "未满24h") {
        const { error: videoError } = await supabase
          .from("videos")
          .update({ anomaly_status: "正常" })
          .eq("id", video.id);

        if (videoError) {
          feedbackToast.error(videoError.message || "状态更新失败");
          return;
        }
      }

      const savedSnapshot: VideoMetricsSnapshot = {
        id: snapshot?.id ?? `temp-${video.id}`,
        ...snapshotPayload,
        captured_at: new Date().toISOString(),
      };

      const savedVideo: VideoRow = {
        ...video,
        anomaly_status: video.anomaly_status === "未满24h" ? "正常" : video.anomaly_status,
      };

      feedbackToast.success("24h 数据已补录");
      onOpenChange(false);
      onSaved({ video: savedVideo, snapshot: savedSnapshot });
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent key={dialogKey} className="max-w-3xl" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>补录24h数据</DialogTitle>
          <DialogDescription>
            {video ? `为《${video.video_title?.trim() || "未命名视频"}》上传截图并补录 24h 指标。` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto pr-1">
          <ScreenshotImport
            initialValues={toScreenshotInitialValues(form)}
            onConfirm={handleImportConfirm}
          />

          <div className="grid gap-4 md:grid-cols-2">
            {METRIC_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`patch-${field.key}`} className="text-[12px] text-stone-500">{field.label}</Label>
                <Input
                  id={`patch-${field.key}`}
                  type="number"
                  min={0}
                  step="1"
                  value={form[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  disabled={isPending}
                  className="h-9 rounded-xl border-stone-200 bg-stone-50 text-[13px] text-stone-700 focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            保存24h数据
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

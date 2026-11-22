"use client";

import { useEffect, useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScreenshotImport, type ScreenshotImportEditableValues } from "@/components/screenshot-import";
import type { Patch24hMetricsFormState } from "@/lib/video-admin";
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
  { key: "avg_play_ratio", label: "平均播放占比" },
] as const;

type MetricKey = (typeof METRIC_FIELDS)[number]["key"];

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FormState = Patch24hMetricsFormState;

interface Patch24hDialogProps {
  open: boolean;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: { video: VideoRow; snapshot: VideoMetricsSnapshot }) => void;
}

function createInitialState(snapshot: VideoMetricsSnapshot | null): FormState {
  // 空槽位一律回填空字符串，禁止默认成 "0"——那会在保存时把未采集写成 0
  return {
    play_count: snapshot?.play_count != null ? String(snapshot.play_count) : "",
    likes: snapshot?.likes != null ? String(snapshot.likes) : "",
    comments: snapshot?.comments != null ? String(snapshot.comments) : "",
    shares: snapshot?.shares != null ? String(snapshot.shares) : "",
    favorites: snapshot?.favorites != null ? String(snapshot.favorites) : "",
    follower_gain: snapshot?.follower_gain != null ? String(snapshot.follower_gain) : "",
    follower_loss: snapshot?.follower_loss != null ? String(snapshot.follower_loss) : "",
    follower_convert: snapshot?.follower_convert != null ? String(snapshot.follower_convert) : "",
    avg_play_ratio: snapshot?.avg_play_ratio != null ? String(snapshot.avg_play_ratio * 100) : "",
  };
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
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => createInitialState(snapshot));

  const dialogKey = `${video?.id ?? "empty"}-${snapshot?.id ?? "new"}-${open ? "open" : "closed"}`;

  // 换视频 / 换快照 / 每次重新打开都回到该快照的初始值：
  // 原实现只在组件挂载时初始化一次，取消补录后重开会残留上一次未保存的数字
  useEffect(() => {
    setForm(createInitialState(snapshot));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在上下文 key 变化时重置；snapshot 引用变化（后台刷新）不应抹掉正在编辑的内容
  }, [dialogKey]);

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
      let response: Response;
      try {
        response = await fetchWithTimeout(`/api/admin/videos/${video.id}/patch-24h`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshotId: snapshot?.id ?? null,
            metrics: form,
          }),
        });
      } catch (error) {
        feedbackToast.error(error instanceof Error ? error.message : "24h 数据保存失败");
        return;
      }

      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string | { message?: string };
        video?: { anomaly_status?: VideoRow["anomaly_status"] };
        snapshot?: VideoMetricsSnapshot;
      } | null;

      if (!response.ok || !payload?.ok) {
        const message = typeof payload?.error === "string"
          ? payload.error
          : payload?.error?.message;
        feedbackToast.error(message || "24h 数据保存失败");
        return;
      }

      // Topics V3：24h 数据补全后触发干货自动入库评估（幂等，失败不影响本次补录结果）
      try {
        await fetch("/api/admin/topics-library/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: video.id }),
        });
      } catch {
        // 评估失败仅意味着入库延迟，补录数据本身已保存成功
      }

      const savedSnapshot: VideoMetricsSnapshot = payload.snapshot ?? {
        ...(snapshot ?? {
          id: `temp-${video.id}`,
          video_id: video.id,
          snapshot_type: "24h",
          play_count: null,
          likes: null,
          comments: null,
          shares: null,
          favorites: null,
          follower_gain: null,
          follower_loss: null,
          fan_play_ratio: null,
          homepage_visits: 0,
          follower_convert: null,
          cover_click_rate: null,
          avg_play_duration: null,
          completion_rate: null,
          bounce_rate_2s: null,
          completion_rate_5s: null,
          avg_play_ratio: null,
          vs_previous: null,
          screenshot_urls: null,
          curve_screenshot_url: null,
          retention_screenshot_url: null,
          captured_at: new Date().toISOString(),
        }),
        captured_at: new Date().toISOString(),
      };

      const savedVideo: VideoRow = {
        ...video,
        anomaly_status: payload.video?.anomaly_status ?? (video.anomaly_status === "未满24h" ? "正常" : video.anomaly_status),
      };

      onOpenChange(false);
      onSaved({ video: savedVideo, snapshot: savedSnapshot });
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent key={dialogKey} className="flex flex-col max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-3xl overflow-hidden p-4 sm:p-6" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle className=" text-[#141413]">补录24h数据</DialogTitle>
          <DialogDescription>
            {video ? `为《${video.video_title?.trim() || "未命名视频"}》上传截图并补录 24h 指标。` : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 sm:space-y-6 pr-1">
          <ScreenshotImport
            initialValues={toScreenshotInitialValues(form)}
            resetKey={dialogKey}
            onConfirm={handleImportConfirm}
          />

          <div className="grid gap-4 md:grid-cols-2">
            {METRIC_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`patch-${field.key}`}>{field.label}</Label>
                <Input
                  id={`patch-${field.key}`}
                  type="number"
                  min={0}
                  step={field.key === "avg_play_ratio" ? "0.01" : "1"}
                  value={form[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  disabled={isPending}
                  className="h-9 rounded-xl bg-[#FCFCFB]"
                />
              </div>
            ))}
          </div>
        </DialogBody>

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

"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fanConversionRate,
  followerConversionRate,
  homepageVisitRate,
  interactionRate,
} from "@/lib/video-metrics";
import type { Video, VideoMetricsSnapshot } from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

interface VideoDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "border-emerald-200 bg-emerald-50 text-emerald-700",
  删稿: "border-red-200 bg-red-50 text-red-700",
  限流: "border-red-200 bg-red-50 text-red-700",
  投流: "border-amber-200 bg-amber-50 text-amber-700",
  活动干预: "border-amber-200 bg-amber-50 text-amber-700",
  "未满24h": "border-slate-200 bg-slate-100 text-slate-600",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function renderSnapshotFields(snapshot: VideoMetricsSnapshot) {
  const fields: Array<{ label: string; value: string }> = [
    { label: "快照类型", value: snapshot.snapshot_type },
    { label: "播放量", value: formatNumber(snapshot.play_count) },
    { label: "点赞", value: formatNumber(snapshot.likes) },
    { label: "评论", value: formatNumber(snapshot.comments) },
    { label: "分享", value: formatNumber(snapshot.shares) },
    { label: "收藏", value: formatNumber(snapshot.favorites) },
    { label: "涨粉", value: formatNumber(snapshot.follower_gain) },
    { label: "掉粉", value: formatNumber(snapshot.follower_loss) },
    { label: "导粉", value: formatNumber(snapshot.follower_convert) },
    { label: "主页访问", value: formatNumber(snapshot.homepage_visits) },
    { label: "粉丝播放占比", value: formatPercent(snapshot.fan_play_ratio) },
    { label: "封面点击率", value: formatPercent(snapshot.cover_click_rate) },
    { label: "平均播放时长", value: snapshot.avg_play_duration == null ? "-" : `${snapshot.avg_play_duration} 秒` },
    { label: "完播率", value: formatPercent(snapshot.completion_rate) },
    { label: "2 秒跳出率", value: formatPercent(snapshot.bounce_rate_2s) },
    { label: "5 秒完播率", value: formatPercent(snapshot.completion_rate_5s) },
    { label: "平均播放进度", value: formatPercent(snapshot.avg_play_ratio) },
    { label: "抓取时间", value: formatDateTime(snapshot.captured_at) },
  ];

  return fields.map((field) => (
    <div key={field.label} className="rounded-2xl bg-muted/50 p-4">
      <div className="text-xs text-muted-foreground">{field.label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{field.value}</div>
    </div>
  ));
}

export function VideoDetailDialog({ open, onOpenChange, video, snapshot }: VideoDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-[32px] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-4xl">
        <DialogHeader className="border-b border-border/60 px-6 py-5 sm:px-7">
          <DialogTitle className="text-xl font-semibold tracking-tight">视频详情</DialogTitle>
        </DialogHeader>

        {video ? (
          <div className="max-h-[80vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-7">
            <section className="space-y-4 rounded-[28px] bg-muted/35 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-foreground">
                    {video.video_title?.trim() || "未命名视频"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    账号：{video.accounts.name} · 负责人：{video.profiles.name}
                  </div>
                </div>
                <Badge variant="outline" className={statusClassName[video.anomaly_status]}>
                  {video.anomaly_status}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">发布时间</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {formatDateTime(video.published_at)}
                  </div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">视频链接</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {video.video_url ? (
                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary underline underline-offset-4"
                      >
                        {video.video_url}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-background/80 p-4">
                <div className="text-xs text-muted-foreground">内容文案</div>
                <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {video.content?.trim() || "-"}
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-[28px] bg-muted/35 p-5">
              <div className="text-base font-semibold text-foreground">核心计算指标</div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">互动率</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {formatPercent(snapshot ? interactionRate(snapshot) : null)}
                  </div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">粉转率</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {formatPercent(snapshot ? followerConversionRate(snapshot) : null)}
                  </div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">导粉率</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {formatPercent(snapshot ? fanConversionRate(snapshot) : null)}
                  </div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">主页访问率</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {formatPercent(snapshot ? homepageVisitRate(snapshot) : null)}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-[28px] bg-muted/35 p-5">
              <div className="text-base font-semibold text-foreground">快照明细</div>
              {snapshot ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {renderSnapshotFields(snapshot)}
                </div>
              ) : (
                <div className="rounded-2xl bg-background/80 p-4 text-sm text-muted-foreground">
                  暂无快照数据。
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

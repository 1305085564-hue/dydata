"use client";

import { useEffect, useMemo, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  fanConversionRate,
  followerConversionRate,
  homepageVisitRate,
  interactionRate,
} from "@/lib/video-metrics";
import { buildTagFilterState, getTagReviewStatus } from "@/lib/video-tags";
import { TAG_ENUMS, VIDEO_TAG_REVIEW_DIMENSIONS, type Video, type VideoMetricsSnapshot, type VideoTag } from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

interface VideoDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  tags: VideoTag[];
  onTagsSaved: (tags: VideoTag[]) => void;
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "border-zinc-200 bg-[#6FAA7D]/10 text-[#6FAA7D]",
  删稿: "border-zinc-200 bg-[#C9604D]/10 text-[#C9604D]",
  限流: "border-zinc-200 bg-[#C9604D]/10 text-[#C9604D]",
  投流: "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]",
  活动干预: "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]",
  "未满24h": "border-zinc-200 bg-zinc-100 text-zinc-600",
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center border-l-2 border-[#D97757] pl-3">
      <h3 className="text-[14px] font-medium tracking-tight text-zinc-800">{children}</h3>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className="mt-1 text-[13px] text-zinc-700">{value}</div>
    </div>
  );
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

  return fields.map((field) => <MetricCard key={field.label} label={field.label} value={field.value} />);
}

export function VideoDetailDialog({ open, onOpenChange, video, snapshot, tags, onTagsSaved }: VideoDetailDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [selection, setSelection] = useState(() => buildTagFilterState(tags));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelection(buildTagFilterState(tags));
  }, [tags]);

  async function handleSaveTags() {
    if (!video) return;

    setIsSaving(true);
    try {
      const payload = VIDEO_TAG_REVIEW_DIMENSIONS.map((dimension) => {
        const currentTag = tags.find((tag) => tag.tag_dimension === dimension) ?? null;
        return {
          video_id: video.id,
          tag_dimension: dimension,
          tag_value: selection[dimension] || currentTag?.tag_value || TAG_ENUMS[dimension][0],
          source: "manual" as const,
          confidence: currentTag?.confidence ?? null,
          reason: currentTag?.reason ?? null,
        };
      });

      const dimensions = payload.map((item) => item.tag_dimension);

      const { error: deleteError } = await supabase
        .from("video_tags")
        .delete()
        .eq("video_id", video.id)
        .in("tag_dimension", dimensions);

      if (deleteError) {
        throw new Error(deleteError.message || "标签保存失败");
      }

      const { data, error } = await supabase
        .from("video_tags")
        .insert(payload)
        .select("*");

      if (error) {
        throw new Error(error.message || "标签保存失败");
      }

      feedbackToast.success("标签已更新");
      onTagsSaved((data ?? []) as VideoTag[]);
    } catch (error) {
      feedbackToast.error((error as Error).message || "标签保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-2xl border-zinc-200 bg-white p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-zinc-200 px-6 py-4">
          <DialogTitle className="text-[18px] font-medium tracking-tight text-zinc-800">视频详情</DialogTitle>
        </DialogHeader>

        {video ? (
          <div className="max-h-[80vh] space-y-6 overflow-y-auto px-6 py-6">
            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-[18px] font-medium tracking-tight text-zinc-800">
                    {video.video_title?.trim() || "未命名视频"}
                  </div>
                  <div className="text-[12px] text-zinc-500">
                    账号：{video.accounts.name} · 负责人：{video.profiles.name}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[12px] ${statusClassName[video.anomaly_status]}`}>
                  {video.anomaly_status}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <MetricCard label="发布时间" value={formatDateTime(video.published_at)} />
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[11px] text-zinc-400">视频链接</div>
                  <div className="mt-1 text-[13px]">
                    {video.video_url ? (
                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-[#D97757] underline underline-offset-4"
                      >
                        {video.video_url}
                      </a>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] text-zinc-400">内容文案</div>
                <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-700">
                  {video.content?.trim() || "-"}
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle>核心计算指标</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="互动率" value={formatPercent(snapshot ? interactionRate(snapshot) : null)} />
                <MetricCard label="粉转率" value={formatPercent(snapshot ? followerConversionRate(snapshot) : null)} />
                <MetricCard label="导粉率" value={formatPercent(snapshot ? fanConversionRate(snapshot) : null)} />
                <MetricCard label="主页访问率" value={formatPercent(snapshot ? homepageVisitRate(snapshot) : null)} />
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>标签信息</SectionTitle>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-xl bg-white text-[12px]"
                  onClick={handleSaveTags}
                  disabled={isSaving}
                >
                  {isSaving ? "保存中..." : "保存标签"}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {VIDEO_TAG_REVIEW_DIMENSIONS.map((dimension) => {
                  const tag = tags.find((item) => item.tag_dimension === dimension) ?? null;
                  const status = getTagReviewStatus(tag?.confidence ?? null);
                  const selectedValue = selection[dimension] || tag?.tag_value || "";
                  return (
                    <div key={dimension} className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium text-zinc-700">{dimension}</div>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${
                            status === "可信"
                              ? "border-zinc-200 bg-[#6FAA7D]/10 text-[#6FAA7D]"
                              : "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]"
                          }`}
                        >
                          {status}
                        </Badge>
                      </div>

                      <Select
                        value={selectedValue}
                        onValueChange={(value) =>
                          setSelection((current) => ({
                            ...current,
                            [dimension]: value ?? "",
                          }))
                        }
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-white text-[13px]">
                          <SelectValue>{selectedValue || `选择${dimension}`}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {TAG_ENUMS[dimension].map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="space-y-0.5 text-[11px] text-zinc-500">
                        <div>来源：{tag?.source === "manual" ? "手动" : "AI"}</div>
                        <div>置信度：{tag?.confidence != null ? `${Math.round(tag.confidence * 100)}%` : "-"}</div>
                        <div className="line-clamp-3">理由：{tag?.reason || "-"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle>快照明细</SectionTitle>
              {snapshot ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {renderSnapshotFields(snapshot)}
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[13px] text-zinc-500">
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

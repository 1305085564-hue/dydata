"use client";

import { useEffect, useMemo, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { TAG_ENUMS, VIDEO_TAG_REVIEW_DIMENSIONS, type Video, type VideoAssetLibraryRecord, type VideoAssetLevel, type VideoMetricsSnapshot, type VideoTag } from "@/types";

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
  assetRecord: VideoAssetLibraryRecord | null;
  onTagsSaved: (tags: VideoTag[]) => void;
  onAssetSaved: (videoId: string, record: VideoAssetLibraryRecord) => void;
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  删稿: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  限流: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  投流: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  活动干预: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  "未满24h": "border-stone-200 bg-stone-100 text-stone-500",
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
      <h3 className="text-[13px] font-medium text-stone-700">{children}</h3>
    </div>
  );
}

function MetricCard({ label, value, placeholder }: { label: string; value: string; placeholder?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-[12px] text-stone-500">{label}</div>
      <div className={`mt-1 text-[13px] ${placeholder ? "text-stone-500" : "text-stone-700"}`}>{value}</div>
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

export function VideoDetailDialog({ open, onOpenChange, video, snapshot, tags, assetRecord, onTagsSaved, onAssetSaved }: VideoDetailDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [selection, setSelection] = useState(() => buildTagFilterState(tags));
  const [isSaving, setIsSaving] = useState(false);
  const [isAssetSaving, setIsAssetSaving] = useState(false);
  const [assetLevel, setAssetLevel] = useState<VideoAssetLevel | null>(assetRecord?.asset_level ?? null);
  const [assetNote, setAssetNote] = useState(assetRecord?.asset_note ?? "");

  useEffect(() => {
    setSelection(buildTagFilterState(tags));
  }, [tags]);

  useEffect(() => {
    setAssetLevel(assetRecord?.asset_level ?? null);
    setAssetNote(assetRecord?.asset_note ?? "");
  }, [assetRecord?.asset_level, assetRecord?.asset_note]);

  async function handleSaveAsset() {
    if (!video) return;
    setIsAssetSaving(true);
    try {
      const res = await fetch(`/api/admin/video-assets/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_level: assetLevel,
          asset_note: assetNote.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; asset?: VideoAssetLibraryRecord; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      if (data.asset) {
        onAssetSaved(video.id, data.asset);
        feedbackToast.success("素材资料已保存");
      }
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setIsAssetSaving(false);
    }
  }

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-3xl">
        <SheetHeader>
          <SheetTitle>视频详情</SheetTitle>
        </SheetHeader>
        <SheetBody>

        {video ? (
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-[18px] font-medium text-stone-900">
                    {video.video_title?.trim() || "未命名视频"}
                  </div>
                  <div className="text-[12px] text-stone-500">
                    账号：{video.accounts.name} · 负责人：{video.profiles.name}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[12px] ${statusClassName[video.anomaly_status]}`}>
                  {video.anomaly_status}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <MetricCard label="发布时间" value={formatDateTime(video.published_at)} />
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-[12px] text-stone-500">视频链接</div>
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
                      <span className="text-stone-500">-</span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-[12px] text-stone-500">素材等级</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Select
                      value={assetLevel ?? "__null__"}
                      onValueChange={(value) => setAssetLevel(value === "__null__" ? null : (value as VideoAssetLevel))}
                    >
                      <SelectTrigger className="h-8 w-24 rounded-lg text-[13px]">
                        <SelectValue placeholder="未评级" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">未评级</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                        <SelectItem value="A">A</SelectItem>
                        <SelectItem value="B">B</SelectItem>
                        <SelectItem value="C">C</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="text-[12px] text-stone-500">人工备注</div>
                  <textarea
                    value={assetNote}
                    onChange={(e) => setAssetNote(e.target.value)}
                    className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-stone-50 p-2 text-[13px] leading-[1.6] text-stone-700 placeholder:text-stone-500 focus-visible:outline-none focus-visible:border-stone-500 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-stone-900/5"
                    rows={2}
                    placeholder="输入备注..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl text-[12px]"
                    onClick={handleSaveAsset}
                    disabled={isAssetSaving}
                  >
                    {isAssetSaving ? "保存中..." : "保存素材资料"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="text-[12px] text-stone-500">内容文案</div>
                <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-stone-700">
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
                    <div key={dimension} className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium text-stone-700">{dimension}</div>
                        <Badge
                          variant="outline"
                          className={`text-[12px] ${
                            status === "可信"
                              ? "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700"
                              : "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700"
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

                      <div className="space-y-0.5 text-[12px] text-stone-500">
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
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-[13px] text-stone-500">
                  暂无快照数据。
                </div>
              )}
            </section>
          </div>
        ) : null}
      </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

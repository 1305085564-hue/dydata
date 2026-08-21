"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Play,
  Flame,
  Award,
  FileText,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  UserCheck,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
} from "@/components/ui/sheet";
import {
  fanConversionRate,
  followerConversionRate,
  homepageVisitRate,
  interactionRate,
} from "@/lib/video-metrics";
import {
  type Video,
  type VideoAssetLibraryRecord,
  type VideoAssetLevel,
  type VideoMetricsSnapshot,
  type VideoTag,
} from "@/types";

import type { UserPermissionInfo } from "@/lib/permissions";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
  trashed_by_name?: string | null;
};

interface VideoDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  tags?: VideoTag[];
  assetRecord: VideoAssetLibraryRecord | null;
  onTagsSaved?: (tags: VideoTag[]) => void;
  onAssetSaved: (videoId: string, record: VideoAssetLibraryRecord) => void;
  permissionInfo: UserPermissionInfo;
  onLifecycleChanged: () => void;
}

const statusBadgeConfig: Record<string, { label: string; className: string }> =
  {
    normal: {
      label: "正常",
      className: "bg-[#16A34A]/10 text-zinc-700 border-zinc-200/60",
    },
    abnormal: {
      label: "异常",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    正常: {
      label: "正常",
      className: "bg-[#16A34A]/10 text-zinc-700 border-zinc-200/60",
    },
    异常: {
      label: "异常",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    删稿: {
      label: "删稿",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    deleted: {
      label: "删稿",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    限流: {
      label: "限流",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    limited: {
      label: "限流",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    投流: {
      label: "投流",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    traffic_boost: {
      label: "投流",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    paid_boost: {
      label: "投流",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    活动干预: {
      label: "活动干预",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    activity_boost: {
      label: "活动干预",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    campaign_intervention: {
      label: "活动干预",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    未满24h: {
      label: "未满24h",
      className: "bg-zinc-100 text-zinc-500 border-zinc-200",
    },
    under_24h: {
      label: "未满24h",
      className: "bg-zinc-100 text-zinc-500 border-zinc-200",
    },
    pending: {
      label: "未满24h",
      className: "bg-zinc-100 text-zinc-500 border-zinc-200",
    },
    腰斩: {
      label: "腰斩",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
    halve: {
      label: "腰斩",
      className: "bg-zinc-100 text-zinc-600 border-zinc-200/60",
    },
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
  if (value == null) return "—";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  return `${seconds.toFixed(1)} s`;
}

export function VideoDetailDialog({
  open,
  onOpenChange,
  video,
  snapshot,
  assetRecord,
  onAssetSaved,
  permissionInfo,
  onLifecycleChanged,
}: VideoDetailDialogProps) {
  const [isAssetSaving, setIsAssetSaving] = useState(false);
  const [assetLevel, setAssetLevel] = useState<VideoAssetLevel | null>(
    assetRecord?.asset_level ?? null,
  );
  const [assetNote, setAssetNote] = useState(assetRecord?.asset_note ?? "");
  const [isOperating, setIsOperating] = useState(false);
  const [showConfirmPurge, setShowConfirmPurge] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [showFullMetrics, setShowFullMetrics] = useState(false);

  const canOperate = permissionInfo.permissions.manage_videos === true;
  const canPurge = permissionInfo.companyRole === "company_owner" || permissionInfo.groupMode === true;

  useEffect(() => {
    setAssetLevel(assetRecord?.asset_level ?? null);
    setAssetNote(assetRecord?.asset_note ?? "");
  }, [assetRecord?.asset_level, assetRecord?.asset_note]);

  const handleCopyContent = useCallback(async () => {
    if (!video?.content) return;
    try {
      await navigator.clipboard.writeText(video.content);
      setCopiedContent(true);
      feedbackToast.success("文案已复制到剪贴板");
      setTimeout(() => setCopiedContent(false), 2000);
    } catch {
      feedbackToast.error("复制失败，请重试");
    }
  }, [video?.content]);

  const handleLifecycleAction = async (
    action: "trash" | "restore" | "purge",
  ) => {
    if (!video) return;
    setIsOperating(true);
    try {
      const res = await fetch(`/api/admin/videos/${video.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "操作失败");
      }
      setShowConfirmPurge(false);
      onLifecycleChanged();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setIsOperating(false);
    }
  };

  const isPurgeEligible = (trashedAt: string | null | undefined) => {
    if (!trashedAt) return false;
    const diff = Date.now() - new Date(trashedAt).getTime();
    return diff >= 30 * 24 * 60 * 60 * 1000;
  };

  const getPurgeTooltip = (trashedAt: string | null | undefined) => {
    if (!trashedAt) return "";
    const targetDate = new Date(
      new Date(trashedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return "";
    const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return `未满 30 天（剩余约 ${daysLeft} 天，可于 ${targetDate.toLocaleString("zh-CN")} 后删除）`;
  };

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
      const data = (await res.json()) as {
        ok?: boolean;
        asset?: VideoAssetLibraryRecord;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "保存失败");
      }
      if (data.asset) {
        onAssetSaved(video.id, data.asset);
      }
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setIsAssetSaving(false);
    }
  }

  // Calculated metrics
  const interaction = snapshot ? interactionRate(snapshot) : null;
  const followerConv = snapshot ? followerConversionRate(snapshot) : null;
  const fanConv = snapshot ? fanConversionRate(snapshot) : null;
  const homepageVisit = snapshot ? homepageVisitRate(snapshot) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-4xl p-0 sm:max-w-4xl border-l border-zinc-200/80 bg-zinc-50/60 backdrop-blur-xl"
      >
        <SheetHeader className="border-b border-zinc-200/80 bg-white/90 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-500">
              <span className="flex items-center gap-1 text-zinc-700 font-semibold">
                <Flame className="size-3.5 text-[#D97757]" />
                素材库 · 视频工作舱
              </span>
              <span>·</span>
              <span className="tabular-nums">ID: {video?.id.slice(0, 8)}</span>
            </div>

            {video && canOperate && (
              <div className="flex items-center gap-2">
                {video.lifecycle_state === "trashed" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLifecycleAction("restore")}
                      disabled={isOperating}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-[#16A34A]/10/80 px-3 text-[12px] font-medium text-zinc-700 hover:bg-[#16A34A]/10/80 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" />
                      恢复作品
                    </button>
                    {canPurge &&
                      (() => {
                        const eligible = isPurgeEligible(
                          video.trashed_at ?? null,
                        );
                        const tooltip = getPurgeTooltip(
                          video.trashed_at ?? null,
                        );
                        return (
                          <button
                            type="button"
                            onClick={() => setShowConfirmPurge(true)}
                            disabled={!eligible || isOperating}
                            title={tooltip || undefined}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-100/80 px-3 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100/80 transition-colors disabled:text-zinc-400 disabled:bg-zinc-100 disabled:border-zinc-200 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="size-3.5" />
                            永久删除
                          </button>
                        );
                      })()}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLifecycleAction("trash")}
                    disabled={isOperating}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 hover:text-[#DC2626] hover:border-zinc-200 transition-colors disabled:opacity-50 shadow-2xs"
                  >
                    <Trash2 className="size-3.5" />
                    移入回收站
                  </button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <SheetBody className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-65px)]">
          {video ? (
            <>
              {/* 锁定提示横幅 */}
              {video.lifecycle_state === "trashed" &&
                canPurge &&
                !isPurgeEligible(video.trashed_at ?? null) && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-100/60 p-3.5 text-[12px] text-zinc-600 leading-relaxed shadow-2xs">
                    <AlertTriangle className="size-4 text-[#F59E0B] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">
                        作品处于回收站保护期：
                      </span>{" "}
                      移入未满 30 天，可于{" "}
                      <span className="font-semibold tabular-nums text-zinc-600">
                        {new Date(
                          new Date(video.trashed_at!).getTime() +
                            30 * 24 * 60 * 60 * 1000,
                        ).toLocaleString("zh-CN")}
                      </span>{" "}
                      之后执行彻底物理销毁。
                    </div>
                  </div>
                )}

              {/* 1. 顶部全景单大卡片 (视频元数据 + 爆款数据核心大盘 融为一体) */}
              <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs space-y-5">
                {/* 1.1 视频元信息 header */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between border-b border-zinc-100 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {video.lifecycle_state === "trashed" && (
                        <Badge
                          variant="secondary"
                          className="bg-zinc-100 text-zinc-600 text-[11px] font-medium"
                        >
                          回收站
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium border px-2 py-0.5 rounded-md ${
                          statusBadgeConfig[video.anomaly_status]?.className ??
                          "bg-zinc-100 text-zinc-600 border-zinc-200"
                        }`}
                      >
                        {statusBadgeConfig[video.anomaly_status]?.label ??
                          video.anomaly_status}
                      </Badge>
                      <h2 className="text-[18px] font-semibold text-zinc-900 tracking-tight leading-snug">
                        {video.video_title?.trim() || "未命名视频"}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-zinc-500">
                      <span className="flex items-center gap-1 font-medium text-zinc-700">
                        <span className="text-zinc-400">账号:</span>{" "}
                        {video.accounts.name}
                      </span>
                      <span className="text-zinc-300">·</span>
                      <span className="flex items-center gap-1 font-medium text-zinc-700">
                        <UserCheck className="size-3.5 text-zinc-400" />
                        <span className="text-zinc-400">责任人:</span>{" "}
                        {video.profiles.name}
                      </span>
                      <span className="text-zinc-300">·</span>
                      <span>
                        <span className="text-zinc-400">发布时间:</span>{" "}
                        <span className="tabular-nums">
                          {formatDateTime(video.published_at ?? null)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {video.video_url && (
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors shrink-0 shadow-2xs"
                    >
                      <ExternalLink className="size-3.5 text-[#D97757]" />
                      打开源视频网页
                    </a>
                  )}
                </div>

                {/* 1.2 爆款数据核心大盘 (融于同卡内) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-[#D97757]" />
                      <h3 className="text-[13px] font-semibold text-zinc-900 tracking-tight">
                        爆款数据核心大盘
                      </h3>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-normal">
                      抓取时间: {formatDateTime(snapshot?.captured_at ?? null)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* 播放量 */}
                    <div className="relative overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-3.5 transition-all hover:bg-zinc-50/80">
                      <div className="text-[12px] font-medium text-zinc-500 flex items-center justify-between">
                        <span>播放量</span>
                        <Play className="size-3.5 text-zinc-400" />
                      </div>
                      <div className="mt-1.5 text-[22px] font-semibold tabular-nums text-zinc-900 tracking-tight">
                        {formatNumber(snapshot?.play_count)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 font-normal">
                        {snapshot?.play_count && snapshot.play_count >= 100000
                          ? "🔥 爆款层级"
                          : "日常播放"}
                      </div>
                    </div>

                    {/* 完播率 */}
                    <div className="relative overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-3.5 transition-all hover:bg-zinc-50/80">
                      <div className="text-[12px] font-medium text-zinc-500 flex items-center justify-between">
                        <span>完播率</span>
                        <Activity className="size-3.5 text-[#16A34A]" />
                      </div>
                      <div className="mt-1.5 text-[22px] font-semibold tabular-nums text-[#16A34A] tracking-tight">
                        {formatPercent(snapshot?.completion_rate)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 font-normal">
                        5s完播:{" "}
                        <span className="tabular-nums font-medium text-zinc-700">
                          {formatPercent(snapshot?.completion_rate_5s)}
                        </span>
                      </div>
                    </div>

                    {/* 综合互动率 */}
                    <div className="relative overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-3.5 transition-all hover:bg-zinc-50/80">
                      <div className="text-[12px] font-medium text-zinc-500 flex items-center justify-between">
                        <span>综合互动率</span>
                        <TrendingUp className="size-3.5 text-[#D97757]" />
                      </div>
                      <div className="mt-1.5 text-[22px] font-semibold tabular-nums text-[#D97757] tracking-tight">
                        {formatPercent(interaction)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 font-normal">
                        赞/评/藏/转 聚合
                      </div>
                    </div>

                    {/* 粉转率 */}
                    <div className="relative overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-3.5 transition-all hover:bg-zinc-50/80">
                      <div className="text-[12px] font-medium text-zinc-500 flex items-center justify-between">
                        <span>粉转率</span>
                        <Sparkles className="size-3.5 text-[#43718E]" />
                      </div>
                      <div className="mt-1.5 text-[22px] font-semibold tabular-nums text-[#43718E] tracking-tight">
                        {formatPercent(followerConv)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 font-normal">
                        净增:{" "}
                        <span className="tabular-nums font-medium text-zinc-700">
                          +{formatNumber(snapshot?.follower_gain)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. 全量快照指标数据 (放在文案内容库上方，默认展开) */}
              {snapshot && (
                <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-zinc-500" />
                      <h3 className="text-[13px] font-semibold text-zinc-900 tracking-tight">
                        快照全量指标明细
                      </h3>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-medium">
                      ({snapshot.snapshot_type} 抓取维度)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-1 sm:grid-cols-3 xl:grid-cols-4 text-[12px]">
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">点赞数</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatNumber(snapshot.likes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">评论数</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatNumber(snapshot.comments)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">分享数</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatNumber(snapshot.shares)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">收藏数</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatNumber(snapshot.favorites)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">涨粉量</span>
                      <span className="font-medium tabular-nums text-[#16A34A]">
                        +{formatNumber(snapshot.follower_gain)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">掉粉量</span>
                      <span className="font-medium tabular-nums text-[#DC2626]">
                        -{formatNumber(snapshot.follower_loss)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">导粉量</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatNumber(snapshot.follower_convert)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">主页访问</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatNumber(snapshot.homepage_visits)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">导粉率</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatPercent(fanConv)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">主页访问率</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatPercent(homepageVisit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">粉丝播放占比</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatPercent(snapshot.fan_play_ratio)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">封面点击率</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatPercent(snapshot.cover_click_rate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">平均播放时长</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatDuration(snapshot.avg_play_duration)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">2s 跳出率</span>
                      <span className="font-medium tabular-nums text-[#DC2626]">
                        {formatPercent(snapshot.bounce_rate_2s)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">5s 完播率</span>
                      <span className="font-medium tabular-nums text-[#16A34A]">
                        {formatPercent(snapshot.completion_rate_5s)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-zinc-100/60">
                      <span className="text-zinc-600">平均播放进度</span>
                      <span className="font-medium tabular-nums text-zinc-950">
                        {formatPercent(snapshot.avg_play_ratio)}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* 3. 脚本文案与内容库 */}
              <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-zinc-600" />
                    <h3 className="text-[13px] font-semibold text-zinc-900 tracking-tight">
                      视频文案内容库
                    </h3>
                    <span className="text-[11px] text-zinc-400 font-normal">
                      ({video.content?.length ?? 0} 字)
                    </span>
                  </div>
                  {video.content && (
                    <button
                      type="button"
                      onClick={handleCopyContent}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] hover:text-[#C46A4D] transition-colors"
                    >
                      {copiedContent ? (
                        <Check className="size-3.5 text-[#16A34A]" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedContent ? "已复制" : "复制文案"}
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/50 p-4 max-h-60 overflow-y-auto text-[13px] leading-[1.7] text-zinc-800 whitespace-pre-wrap break-words">
                  {video.content?.trim() || (
                    <span className="text-zinc-400 italic">暂无文案记录。</span>
                  )}
                </div>
              </section>

              {/* 4. 素材评价与评级 (置于最底部，精简尺寸) */}
              <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="size-4 text-[#F59E0B]" />
                    <h3 className="text-[13px] font-semibold text-zinc-900 tracking-tight">
                      素材评价与评级
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7.5 rounded-lg border-zinc-200 text-[12px] font-medium hover:bg-zinc-50 shadow-2xs"
                    onClick={handleSaveAsset}
                    disabled={isAssetSaving}
                  >
                    {isAssetSaving ? "保存中..." : "保存评价"}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-zinc-500 shrink-0">
                      素材等级:
                    </span>
                    <div className="flex items-center gap-1 flex-1">
                      {(["S", "A", "B", "C"] as VideoAssetLevel[]).map(
                        (level) => {
                          const isSelected = assetLevel === level;
                          const levelStyles: Record<VideoAssetLevel, string> = {
                            S: isSelected
                              ? "bg-[#D97757] text-white border-[#D97757] font-medium shadow-2xs"
                              : "bg-zinc-100 text-zinc-600 border-zinc-200/60 hover:bg-zinc-200/50",
                            A: isSelected
                              ? "bg-zinc-950 text-white border-zinc-950 font-medium shadow-2xs"
                              : "bg-zinc-100 text-zinc-800 border-zinc-200 hover:bg-zinc-200/50",
                            B: isSelected
                              ? "bg-zinc-800 text-white border-zinc-800 font-medium shadow-2xs"
                              : "bg-zinc-100 text-zinc-800 border-zinc-200 hover:bg-zinc-200/50",
                            C: isSelected
                              ? "bg-zinc-600 text-white border-zinc-600 font-medium shadow-2xs"
                              : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200/50",
                          };
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                setAssetLevel(isSelected ? null : level)
                              }
                              className={`h-7 flex-1 rounded-lg border text-[12px] transition-all active:scale-95 ${levelStyles[level]}`}
                            >
                              {level}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={assetNote}
                      onChange={(e) => setAssetNote(e.target.value)}
                      className="w-full h-8 rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-400 focus:outline-none transition-all"
                      placeholder="添加人工复盘备注 & 亮点评语..."
                    />
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>

      {/* 永久删除二次确认弹窗 */}
      {showConfirmPurge && video && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <AlertTriangle className="size-5 text-[#DC2626]" />
              永久物理删除确认
            </h3>
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
              将永久隐藏作品「{video.video_title || "未命名视频"}
              」，并清理系统归属截图。此操作属于不可逆底层清理，请谨慎操作。
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                className="h-8.5 rounded-xl border border-zinc-200 px-4 text-zinc-700 hover:bg-zinc-50 text-[12px] font-medium transition-colors"
                onClick={() => setShowConfirmPurge(false)}
                disabled={isOperating}
              >
                取消
              </button>
              <button
                type="button"
                className="h-8.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white px-4 text-[12px] font-medium transition-colors disabled:opacity-50"
                onClick={() => handleLifecycleAction("purge")}
                disabled={isOperating}
              >
                {isOperating ? "正在删除..." : "确定永久物理删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

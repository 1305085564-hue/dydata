"use client";

import { useEffect, useState, useCallback } from "react";
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
  UserCheck,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
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
      className: "bg-[#6FAA7D]/10 text-[#292524] border-[#E5E0D6]/60",
    },
    abnormal: {
      label: "异常",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    正常: {
      label: "正常",
      className: "bg-[#6FAA7D]/10 text-[#292524] border-[#E5E0D6]/60",
    },
    异常: {
      label: "异常",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    删稿: {
      label: "删稿",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    deleted: {
      label: "删稿",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    限流: {
      label: "限流",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    limited: {
      label: "限流",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    投流: {
      label: "投流",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    traffic_boost: {
      label: "投流",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    paid_boost: {
      label: "投流",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    活动干预: {
      label: "活动干预",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    activity_boost: {
      label: "活动干预",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    campaign_intervention: {
      label: "活动干预",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    未满24h: {
      label: "未满24h",
      className: "bg-[#F5F3EE] text-[#78716C] border-[#E5E0D6]",
    },
    under_24h: {
      label: "未满24h",
      className: "bg-[#F5F3EE] text-[#78716C] border-[#E5E0D6]",
    },
    pending: {
      label: "未满24h",
      className: "bg-[#F5F3EE] text-[#78716C] border-[#E5E0D6]",
    },
    腰斩: {
      label: "腰斩",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
    },
    halve: {
      label: "腰斩",
      className: "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60",
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
  // 捕获挂载时刻用于回收站 30 天保护期判断，避免 render 中调用 Date.now()（React Compiler purity）
  const [now] = useState(() => Date.now());
  const [assetLevel, setAssetLevel] = useState<VideoAssetLevel | null>(
    assetRecord?.asset_level ?? null,
  );
  const [assetNote, setAssetNote] = useState(assetRecord?.asset_note ?? "");
  const [isOperating, setIsOperating] = useState(false);
  const [showConfirmPurge, setShowConfirmPurge] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const canOperate = permissionInfo.permissions.manage_videos === true;
  const canPurge = permissionInfo.companyRole === "company_owner" || permissionInfo.groupMode === true;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 素材记录变化时同步可编辑表单（支持就地保存）
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
  }, [video]);

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
    const diff = now - new Date(trashedAt).getTime();
    return diff >= 30 * 24 * 60 * 60 * 1000;
  };

  const getPurgeTooltip = (trashedAt: string | null | undefined) => {
    if (!trashedAt) return "";
    const targetDate = new Date(
      new Date(trashedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const diff = targetDate.getTime() - now;
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
        className="w-full max-w-4xl p-0 sm:max-w-4xl border-l border-[#ECE7DE] bg-[#FBF9F5]/95 shadow-claude-dialog"
      >
        <SheetHeader className="border-b border-[#ECE7DE] bg-white px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#78716C]">
              <span className="flex items-center gap-1 text-[#292524] font-semibold">
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="s"
                      onClick={() => handleLifecycleAction("restore")}
                      disabled={isOperating}
                      className="bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20"
                    >
                      <RotateCcw className="size-3" />
                      恢复作品
                    </Button>
                    {canPurge &&
                      (() => {
                        const eligible = isPurgeEligible(
                          video.trashed_at ?? null,
                        );
                        const tooltip = getPurgeTooltip(
                          video.trashed_at ?? null,
                        );
                        return (
                          <Button
                            type="button"
                            variant="secondary"
                            size="s"
                            onClick={() => setShowConfirmPurge(true)}
                            disabled={!eligible || isOperating}
                            title={tooltip || undefined}
                          >
                            <Trash2 className="size-3" />
                            永久删除
                          </Button>
                        );
                      })()}
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="s"
                    onClick={() => handleLifecycleAction("trash")}
                    disabled={isOperating}
                    className="hover:text-[#C0685C]"
                  >
                    <Trash2 className="size-3" />
                    移入回收站
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        {/* 永久删除就地确认横幅（消除 Sheet 外再叠弹窗） */}
        {showConfirmPurge && video && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECE7DE] bg-[#FAF8F4] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 text-[#78716C] min-w-0">
              <AlertTriangle className="size-4 text-[#C0685C] shrink-0" />
              <span>确认彻底删除此作品？将永久隐藏并清理截图，此操作不可撤销。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={() => setShowConfirmPurge(false)}
                disabled={isOperating}
              >
                暂保留
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="s"
                onClick={() => handleLifecycleAction("purge")}
                disabled={isOperating}
              >
                {isOperating ? "正在删除..." : "彻底删除"}
              </Button>
            </div>
          </div>
        )}

        <SheetBody className="p-4 sm:p-6 space-y-5 overflow-y-auto max-h-[calc(100dvh-65px)] pb-[calc(2.5rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-6">
          {video ? (
            <>
              {/* 锁定提示横幅 */}
              {video.lifecycle_state === "trashed" &&
                canPurge &&
                !isPurgeEligible(video.trashed_at ?? null) && (
                  <Alert variant="warning" className="items-start text-[12px]">
                    <div>
                      <span className="font-semibold">
                        作品处于回收站保护期：
                      </span>{" "}
                      移入未满 30 天，可于{" "}
                      <span className="font-semibold tabular-nums text-[#292524]">
                        {new Date(
                          new Date(video.trashed_at!).getTime() +
                            30 * 24 * 60 * 60 * 1000,
                        ).toLocaleString("zh-CN")}
                      </span>{" "}
                      之后执行彻底物理销毁。
                    </div>
                  </Alert>
                )}

              {/* 1. 顶部全景单大卡片 (视频元数据 + 爆款数据核心大盘 融为一体) */}
              <section className="rounded-2xl bg-white p-5 shadow-card-ring space-y-5">
                {/* 1.1 视频元信息 header */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between border-b border-[#ECE7DE] pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {video.lifecycle_state === "trashed" && (
                        <Badge
                          variant="secondary"
                          className="bg-[#F5F3EE] text-[#292524] text-[11px] font-medium"
                        >
                          回收站
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium border px-2 py-0.5 rounded-md ${
                          statusBadgeConfig[video.anomaly_status]?.className ??
                          "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]"
                        }`}
                      >
                        {statusBadgeConfig[video.anomaly_status]?.label ??
                          video.anomaly_status}
                      </Badge>
                      <h2 className="text-lg font-[580] text-[#1C1917] leading-snug">
                        {video.video_title?.trim() || "未命名视频"}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[#78716C]">
                      <span className="flex items-center gap-1 font-medium text-[#292524]">
                        <span className="text-[#78716C]">账号:</span>{" "}
                        {video.accounts.name}
                      </span>
                      <span className="text-[#E5E0D6]">·</span>
                      <span className="flex items-center gap-1 font-medium text-[#292524]">
                        <UserCheck className="size-3.5 text-[#78716C]" />
                        <span className="text-[#78716C]">责任人:</span>{" "}
                        {video.profiles.name}
                      </span>
                      <span className="text-[#E5E0D6]">·</span>
                      <span>
                        <span className="text-[#78716C]">发布时间:</span>{" "}
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E0D6] bg-[#FBF9F5]/80 px-3 py-1.5 text-[12px] font-medium text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors shrink-0 shadow-2xs"
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
                      <h3 className="text-[13px] font-medium text-[#1C1917] tracking-tight">
                        爆款数据核心大盘
                      </h3>
                    </div>
                    <span className="text-[11px] text-[#78716C] font-normal">
                      抓取时间: {formatDateTime(snapshot?.captured_at ?? null)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* 播放量 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E5E0D6]/70 bg-[#FBF9F5]/40 p-3.5 transition-all hover:bg-[#FBF9F5]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>播放量</span>
                        <Play className="size-3.5 text-[#78716C]" />
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatNumber(snapshot?.play_count)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#78716C] font-normal">
                        {snapshot?.play_count && snapshot.play_count >= 100000
                          ? "🔥 爆款层级"
                          : "日常播放"}
                      </div>
                    </div>

                    {/* 完播率 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E5E0D6]/70 bg-[#FBF9F5]/40 p-3.5 transition-all hover:bg-[#FBF9F5]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>完播率</span>
                        <Activity className="size-3.5 text-[#6FAA7D]" />
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatPercent(snapshot?.completion_rate)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#78716C] font-normal">
                        5s完播:{" "}
                        <span className="tabular-nums font-medium text-[#292524]">
                          {formatPercent(snapshot?.completion_rate_5s)}
                        </span>
                      </div>
                    </div>

                    {/* 综合互动率 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E5E0D6]/70 bg-[#FBF9F5]/40 p-3.5 transition-all hover:bg-[#FBF9F5]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>综合互动率</span>
                        <TrendingUp className="size-3.5 text-[#D97757]" />
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatPercent(interaction)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#78716C] font-normal">
                        赞/评/藏/转 聚合
                      </div>
                    </div>

                    {/* 粉转率 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E5E0D6]/70 bg-[#FBF9F5]/40 p-3.5 transition-all hover:bg-[#FBF9F5]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>粉转率</span>
                        <Sparkles className="size-3.5 text-[#43718E]" />
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatPercent(followerConv)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#78716C] font-normal">
                        净增:{" "}
                        <span className="tabular-nums font-medium text-[#292524]">
                          +{formatNumber(snapshot?.follower_gain)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. 全量快照指标数据 (放在文案内容库上方，默认展开) */}
              {snapshot && (
                <section className="rounded-2xl bg-white p-5 shadow-card-ring space-y-3">
                  <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-[#78716C]" />
                      <h3 className="text-[13px] font-semibold text-[#1C1917] tracking-tight">
                        快照全量指标明细
                      </h3>
                    </div>
                    <span className="text-[11px] text-[#78716C] font-medium">
                      ({snapshot.snapshot_type} 抓取维度)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-1 sm:grid-cols-3 xl:grid-cols-4 text-[12px]">
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">点赞数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.likes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">评论数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.comments)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">分享数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.shares)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">收藏数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.favorites)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">涨粉量</span>
                      <span className="font-medium tabular-nums text-[#6FAA7D]">
                        +{formatNumber(snapshot.follower_gain)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">掉粉量</span>
                      <span className="font-medium tabular-nums text-[#C0685C]">
                        -{formatNumber(snapshot.follower_loss)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">导粉量</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.follower_convert)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">主页访问</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.homepage_visits)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">导粉率</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatPercent(fanConv)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">主页访问率</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatPercent(homepageVisit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">粉丝播放占比</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatPercent(snapshot.fan_play_ratio)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">封面点击率</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatPercent(snapshot.cover_click_rate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">平均播放时长</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatDuration(snapshot.avg_play_duration)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">2s 跳出率</span>
                      <span className="font-medium tabular-nums text-[#C0685C]">
                        {formatPercent(snapshot.bounce_rate_2s)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">5s 完播率</span>
                      <span className="font-medium tabular-nums text-[#6FAA7D]">
                        {formatPercent(snapshot.completion_rate_5s)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#ECE7DE]/60">
                      <span className="text-[#292524]">平均播放进度</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatPercent(snapshot.avg_play_ratio)}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* 3. 脚本文案与内容库 */}
              <section className="rounded-2xl bg-white p-5 shadow-card-ring space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-[#292524]" />
                    <h3 className="text-[13px] font-medium text-[#1C1917] tracking-tight">
                      视频文案内容库
                    </h3>
                    <span className="text-[11px] text-[#78716C] font-normal">
                      ({video.content?.length ?? 0} 字)
                    </span>
                  </div>
                  {video.content && (
                    <button
                      type="button"
                      onClick={handleCopyContent}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] hover:text-[#C46A4D] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                    >
                      {copiedContent ? (
                        <Check className="size-3.5 text-[#6FAA7D]" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedContent ? "已复制" : "复制文案"}
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-[#ECE7DE] bg-[#FAF8F4]/50 p-4 max-h-60 overflow-y-auto text-[13px] leading-[1.7] text-[#292524] whitespace-pre-wrap break-words">
                  {video.content?.trim() || (
                    <span className="text-[#78716C]">暂未录入视频文案</span>
                  )}
                </div>
              </section>

              {/* 4. 素材评价与评级 (置于最底部，精简尺寸) */}
              <section className="rounded-2xl bg-white p-4 shadow-card-ring space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="size-4 text-[#B98A54]" />
                    <h3 className="text-[13px] font-medium text-[#1C1917] tracking-tight">
                      素材评价与评级
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="s"
                    className="h-7 rounded-md border-[#ECE7DE] text-[12px] font-medium shadow-2xs active:scale-[0.99] active:duration-120"
                    onClick={handleSaveAsset}
                    disabled={isAssetSaving}
                  >
                    {isAssetSaving ? "保存中..." : "保存评价"}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[#78716C] shrink-0">
                      素材等级:
                    </span>
                    <div className="flex items-center gap-1 flex-1">
                      {(["S", "A", "B", "C"] as VideoAssetLevel[]).map(
                        (level) => {
                          const isSelected = assetLevel === level;
                          const levelStyles: Record<VideoAssetLevel, string> = {
                            S: isSelected
                              ? "bg-[#D97757] text-white border-[#D97757] font-medium shadow-2xs"
                              : "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6]/60 hover:bg-[#E5E0D6]/50",
                            A: isSelected
                              ? "bg-[#43718E] text-white border-[#43718E] font-medium shadow-2xs"
                              : "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6] hover:bg-[#E5E0D6]/50",
                            B: isSelected
                              ? "bg-[#B98A54] text-white border-[#B98A54] font-medium shadow-2xs"
                              : "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6] hover:bg-[#E5E0D6]/50",
                            C: isSelected
                              ? "bg-[#ECE7DE] text-[#1C1917] border-[#D9D3C7] font-medium shadow-2xs"
                              : "bg-[#F5F3EE] text-[#292524] border-[#E5E0D6] hover:bg-[#E5E0D6]/50",
                          };
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                setAssetLevel(isSelected ? null : level)
                              }
                              className={`h-7 flex-1 rounded-lg border text-[12px] transition-all active:scale-[0.99] active:duration-120 ${levelStyles[level]}`}
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
                      className="w-full h-8 rounded-lg border border-[#E5E0D6] bg-[#FBF9F5]/50 px-3 text-[12px] text-[#292524] placeholder:text-[#78716C] focus:bg-white focus:border-[#78716C] focus:outline-none transition-all"
                      placeholder="添加人工复盘备注 & 亮点评语..."
                    />
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

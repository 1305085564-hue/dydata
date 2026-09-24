"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Play,
  Flame,
  FileText,
  Bookmark,
  Layers,
  UserCheck,
  TrendingUp,
  ThumbsUp,
  Sparkles,
  ZoomIn,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Columns2,
  Maximize2,
  Smartphone,
  Monitor,
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
  favoriteRate,
  followerConversionRate,
  interactionRate,
  likeRate,
} from "@/lib/video-metrics";
import {
  BREAKOUT_GRADE_TEXT_CLASS,
  breakoutRating,
  breakoutTargetsFor,
  formatAchievement,
  hasKnownTopicKind,
  type BreakoutRating,
} from "@/lib/breakout-rating";
import { resolveReviewScreenshots } from "@/lib/video-screenshot";
import { describeImpossibleRatio, isImpossibleRatio } from "@/lib/metric-bounds";
import { shouldShowPatch24hButton } from "@/lib/video-admin";
import { Patch24hDialog } from "../videos/patch-24h-dialog";
import type { VideoTopicKind, VideoTopicLibraryStatus } from "@/lib/topics/library";
import {
  type Video,
  type VideoMetricsSnapshot,
} from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
  trashed_by_name?: string | null;
};

interface ContentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  canOperateLifecycle?: boolean;
  canPurge?: boolean;
  onLifecycleChanged: () => void;
  topicLibraryStatus?: VideoTopicLibraryStatus | null;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率；null = 话题未识别（不出评级，不按复盘口径兜底） */
  topicKind?: VideoTopicKind | null;
  onToggleTopicLibrary?: (action: "remove" | "restore") => Promise<void>;
}

const statusBadgeConfig: Record<string, { label: string; className: string }> =
  {
    normal: {
      label: "正常",
      className: "bg-[#6FAA7D]/10 text-[#292524] border-[#E2E2DF]/60",
    },
    abnormal: {
      label: "异常",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    正常: {
      label: "正常",
      className: "bg-[#6FAA7D]/10 text-[#292524] border-[#E2E2DF]/60",
    },
    异常: {
      label: "异常",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    删稿: {
      label: "删稿",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    deleted: {
      label: "删稿",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    限流: {
      label: "限流",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    limited: {
      label: "限流",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    投流: {
      label: "投流",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    traffic_boost: {
      label: "投流",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    paid_boost: {
      label: "投流",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    活动干预: {
      label: "活动干预",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    activity_boost: {
      label: "活动干预",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    campaign_intervention: {
      label: "活动干预",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    未满24h: {
      label: "未满24h",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    under_24h: {
      label: "未满24h",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    pending: {
      label: "未满24h",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    腰斩: {
      label: "腰斩",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
    },
    halve: {
      label: "腰斩",
      className: "bg-transparent text-[#78716C] border border-[#E2E2DF]",
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

function formatPercentagePoints(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  return `${seconds.toFixed(1)} s`;
}

/** 爆款标准线文案：0.025 → "2.5%" */
function formatTarget(target: number) {
  return `${Number((target * 100).toFixed(2))}%`;
}

/** 2s 跳出率动态预警色：>=30 绿，<=25 红，中间中性 */
function getBounceRate2sClass(value: number | null | undefined): string {
  if (value == null) return "text-[#1C1917]";
  if (value >= 30) return "text-[#6FAA7D]";
  if (value <= 25) return "text-[#C0685C]";
  return "text-[#1C1917]";
}

/** 5s 完播率动态预警色：>=55 红，<=50 绿，中间中性 */
function getCompletionRate5sClass(value: number | null | undefined): string {
  if (value == null) return "text-[#1C1917]";
  if (value >= 55) return "text-[#C0685C]";
  if (value <= 50) return "text-[#6FAA7D]";
  return "text-[#1C1917]";
}

/** 完播率动态预警色：>=10 红，<=4 绿（4以下），中间中性 */
function getCompletionRateClass(value: number | null | undefined): string {
  if (value == null) return "text-[#1C1917]";
  if (value >= 10) return "text-[#C0685C]";
  if (value <= 4) return "text-[#6FAA7D]";
  return "text-[#1C1917]";
}

/** 比率明细值：越界（>100%）时覆盖语义色，按脏值样式打出并给出说明，不再冒充正常信号 */
function MetricPercentValue({
  value,
  normalClassName,
}: {
  value: number | null | undefined;
  normalClassName?: string;
}) {
  const dirty = isImpossibleRatio(value);
  return (
    <span
      className={`font-medium tabular-nums ${
        dirty
          ? "text-[#C0685C] underline decoration-[#C0685C]/60 decoration-dotted underline-offset-2 cursor-help"
          : normalClassName ?? ""
      }`}
      title={dirty ? describeImpossibleRatio() : undefined}
    >
      {formatPercentagePoints(value)}
    </span>
  );
}

/** 单项爆款评级标签：评级 + 达成率（如「良 92%」）；无气垫背景，与辅助小字保持同级纯文本排版 */
function BreakoutGradeTag({
  rating,
  metricLabel,
  targetLabel,
}: {
  rating: BreakoutRating | null;
  metricLabel: string;
  targetLabel: string;
}) {
  if (!rating) return null;
  return (
    <span
      className={`shrink-0 tabular-nums font-medium ${BREAKOUT_GRADE_TEXT_CLASS[rating.grade]}`}
      title={`${metricLabel}达成率 ${formatAchievement(rating.achievement)}（${rating.grade}），爆款标准 ${targetLabel}`}
    >
      {rating.grade}
      {formatAchievement(rating.achievement)}
    </span>
  );
}

export function ContentDetailDialog({
  open,
  onOpenChange,
  video,
  snapshot,
  canOperateLifecycle = false,
  canPurge = false,
  onLifecycleChanged,
  topicLibraryStatus = null,
  topicKind = null,
  onToggleTopicLibrary,
}: ContentDetailDialogProps) {
  // 捕获挂载时刻用于回收站 30 天保护期判断，避免 render 中调用 Date.now()（React Compiler purity）
  const [now] = useState(() => Date.now());
  const [isOperating, setIsOperating] = useState(false);
  const [showConfirmPurge, setShowConfirmPurge] = useState(false);
  // 恢复会连带复活关联的成员绩效日报，与另两个生命周期操作一样走就地确认
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [showConfirmTrash, setShowConfirmTrash] = useState(false);
  // 抽屉打开时的落焦目标：默认落在容器上，不落在「移入回收站」这种破坏性按钮上
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [copiedContent, setCopiedContent] = useState(false);
  const [isTopicUpdating, setIsTopicUpdating] = useState(false);
  const [showPatch24h, setShowPatch24h] = useState(false);

  const canOperate = canOperateLifecycle;

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
      setShowConfirmRestore(false);
      setShowConfirmTrash(false);
      if (action === "trash") {
        feedbackToast.success("作品已移入回收站，关联日报已作废");
      } else if (action === "restore") {
        feedbackToast.success("作品已恢复，关联日报已复活");
      } else if (action === "purge") {
        feedbackToast.success("作品已彻底物理删除");
      }
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

  const screenshots = resolveReviewScreenshots(snapshot);
  const curveScreenshot = screenshots.find((item) => item.slot === "curve");
  const retentionScreenshot = screenshots.find((item) => item.slot === "retention");

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [viewLayout, setViewLayout] = useState<"auto" | "side-by-side" | "stacked">("auto");

  const handleImageLoad = useCallback((url: string, ratio: number) => {
    setAspectRatios((prev) => {
      if (prev[url] === ratio) return prev;
      return { ...prev, [url]: ratio };
    });
  }, []);

  const activeScreenshots = useMemo(() => {
    const list: { label: string; url: string; subLabel: string }[] = [];
    if (curveScreenshot) list.push({ label: "流量曲线截图", subLabel: "流量曲线", url: curveScreenshot.url });
    if (retentionScreenshot) list.push({ label: "留存脱落截图", subLabel: "留存脱落", url: retentionScreenshot.url });
    return list;
  }, [curveScreenshot, retentionScreenshot]);

  const hasWideScreenshot = useMemo(() => {
    return activeScreenshots.some((s) => (aspectRatios[s.url] ?? 0.5) > 1.15);
  }, [activeScreenshots, aspectRatios]);

  const effectiveLayout = useMemo(() => {
    if (viewLayout === "stacked") return "stacked";
    if (viewLayout === "side-by-side") return "side-by-side";
    return hasWideScreenshot ? "stacked" : "side-by-side";
  }, [viewLayout, hasWideScreenshot]);

  useEffect(() => {
    if (previewIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setPreviewIndex(null);
      } else if (e.key === "ArrowLeft" && activeScreenshots.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : activeScreenshots.length - 1));
      } else if (e.key === "ArrowRight" && activeScreenshots.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        setPreviewIndex((i) => (i !== null && i < activeScreenshots.length - 1 ? i + 1 : 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [previewIndex, activeScreenshots]);

  const handleTopicToggle = async () => {
    if (!onToggleTopicLibrary || isTopicUpdating) return;
    setIsTopicUpdating(true);
    try {
      await onToggleTopicLibrary(topicLibraryStatus === "in_library" ? "remove" : "restore");
      feedbackToast.success(topicLibraryStatus === "in_library" ? "已移出选题库" : "已恢复到选题库");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "选题库操作失败");
    } finally {
      setIsTopicUpdating(false);
    }
  };

  // Calculated metrics
  const interaction = snapshot ? interactionRate(snapshot) : null;
  const followerConv = snapshot ? followerConversionRate(snapshot) : null;
  const fanConv = snapshot ? fanConversionRate(snapshot) : null;

  // 大盘第四格：干货看收藏率，复盘及其他看点赞率
  // 只有拿到三种已知分类之一才算「话题已识别」：null（状态未取到）与 undefined（调用方未传 prop）
  // 都属于未识别，一律不按复盘口径出数，避免静默错口径
  const hasTopicKind = hasKnownTopicKind(topicKind);
  const fourthSlotIsFavorite = topicKind === "dry_goods";
  const fourthSlotLabel = !hasTopicKind ? "话题未识别" : fourthSlotIsFavorite ? "收藏率" : "点赞率";
  const fourthSlotValue = snapshot && hasTopicKind
    ? fourthSlotIsFavorite
      ? favoriteRate(snapshot)
      : likeRate(snapshot)
    : null;

  // 爆款评级：三项各自独立，实际值 ÷ 该话题标准线（干货看收藏率，复盘及其他看点赞率）
  // 话题未识别时标准线无从选择（两套互动率先不同），整体不出评级
  const breakoutTargets = hasTopicKind ? breakoutTargetsFor(topicKind) : null;
  const followerRating = breakoutTargets ? breakoutRating(followerConv, breakoutTargets.follower) : null;
  const interactionRating = breakoutTargets ? breakoutRating(interaction, breakoutTargets.interaction) : null;
  const fourthRating = breakoutTargets ? breakoutRating(fourthSlotValue, breakoutTargets.fourth) : null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        role="dialog"
        aria-modal="true"
        aria-label="视频复盘工作舱详情"
        ref={sheetContentRef}
        tabIndex={-1}
        // 默认落焦是弹层内第一个可聚焦元素，DOM 顺序上就是「补录24h → 移入回收站」——
        // 键盘用户一按回车就落到移入回收站的确认框。这里改成落在弹层容器自身，
        // 用户主动 Tab 才进入具体操作（Sheet 基于 Base UI Dialog，落焦 prop 为 initialFocus）。
        initialFocus={sheetContentRef}
        className="w-full max-w-4xl p-0 sm:max-w-4xl border-l border-[#E2E2DF] bg-[#FCFCFB]/95 shadow-claude-dialog"
      >
        <SheetHeader className="border-b border-[#E2E2DF] bg-white px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#78716C]">
              <span className="flex items-center gap-1 text-[#292524] font-medium">
                <Flame className="size-3.5 text-[#D97757]" />
                视频复盘 · 视频工作舱
              </span>
              <span>·</span>
              <span className="tabular-nums">ID: {video?.id.slice(0, 8)}</span>
            </div>

            {video && canOperate && (
              <div className="flex items-center gap-2">
                {video.lifecycle_state !== "trashed" && shouldShowPatch24hButton(video, snapshot) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="s"
                    onClick={() => setShowPatch24h(true)}
                  >
                    补录24h
                  </Button>
                ) : null}
                {video.lifecycle_state === "trashed" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="s"
                      onClick={() => {
                        setShowConfirmPurge(false);
                        setShowConfirmRestore(true);
                      }}
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
                            onClick={() => {
                              setShowConfirmRestore(false);
                              setShowConfirmPurge(true);
                            }}
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
                    onClick={() => setShowConfirmTrash(true)}
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

        {/* 移入回收站就地确认横幅（防误触作废日报） */}
        {showConfirmTrash && video && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF] bg-[#FCFCFB] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 text-[#78716C] min-w-0">
              <AlertTriangle className="size-4 text-[#B98A54] shrink-0" />
              <span>确认移入回收站？该作品将隐藏，关联的成员绩效日报将同步作废。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={() => setShowConfirmTrash(false)}
                disabled={isOperating}
              >
                暂保留
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="s"
                onClick={() => handleLifecycleAction("trash")}
                disabled={isOperating}
              >
                {isOperating ? "正在移入..." : "确认移入"}
              </Button>
            </div>
          </div>
        )}

        {/* 永久删除就地确认横幅（消除 Sheet 外再叠弹窗） */}
        {showConfirmPurge && video && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF] bg-[#FCFCFB] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
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

        {/* 恢复就地确认横幅（会连带复活关联日报，与另两个生命周期操作同规格） */}
        {showConfirmRestore && video && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF] bg-[#FCFCFB] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 text-[#78716C] min-w-0">
              <AlertTriangle className="size-4 text-[#6FAA7D] shrink-0" />
              <span>确认恢复该作品？将重新出现在列表中，并复活关联的成员绩效日报。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={() => setShowConfirmRestore(false)}
                disabled={isOperating}
              >
                暂不恢复
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={() => handleLifecycleAction("restore")}
                disabled={isOperating}
                className="bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20"
              >
                {isOperating ? "正在恢复..." : "确认恢复"}
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
                video.trashed_at &&
                !isPurgeEligible(video.trashed_at) && (
                  <Alert variant="warning" className="items-start text-[12px]">
                    <div>
                      <span className="font-semibold">
                        作品处于回收站保护期：
                      </span>{" "}
                      移入未满 30 天，可于{" "}
                      <span className="font-semibold tabular-nums text-[#292524]">
                        {new Date(
                          new Date(video.trashed_at).getTime() +
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
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between border-b border-[#E2E2DF] pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {video.lifecycle_state === "trashed" && (
                        <Badge
                          variant="secondary"
                          className="bg-[#F1F1F0] text-[#292524] text-[11px] font-medium"
                        >
                          回收站
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium border px-2 py-0.5 rounded-md ${
                          statusBadgeConfig[video.anomaly_status]?.className ??
                          "bg-[#F1F1F0] text-[#292524] border-[#E2E2DF]"
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
                      <span className="text-[#E2E2DF]">·</span>
                      <span className="flex items-center gap-1 font-medium text-[#292524]">
                        <UserCheck className="size-3.5 text-[#78716C]" />
                        <span className="text-[#78716C]">责任人:</span>{" "}
                        {video.profiles.name}
                      </span>
                      <span className="text-[#E2E2DF]">·</span>
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E2DF] bg-[#FCFCFB]/80 px-3 py-1.5 text-[12px] font-medium text-[#292524] hover:bg-[#EBEBE9] hover:text-[#1C1917] transition-colors shrink-0 shadow-2xs"
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
                      {!hasTopicKind && "话题未识别，暂不评级 · "}
                      抓取时间: {formatDateTime(snapshot?.captured_at ?? null)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* 播放量 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E2E2DF]/70 bg-[#FCFCFB]/40 p-3.5 transition-all hover:bg-[#EBEBE9]/80">
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

                    {/* 转粉率 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E2E2DF]/70 bg-[#FCFCFB]/40 p-3.5 transition-all hover:bg-[#EBEBE9]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>转粉率</span>
                        <Sparkles className="size-3.5 text-[#78716C]" />
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatPercent(followerConv)}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#78716C] font-normal">
                        <span>
                          涨粉量:{" "}
                          <span className="tabular-nums font-medium text-[#292524]">
                            +{formatNumber(snapshot?.follower_gain)}
                          </span>
                        </span>
                        <BreakoutGradeTag
                          rating={followerRating}
                          metricLabel="转粉率"
                          targetLabel={breakoutTargets ? formatTarget(breakoutTargets.follower) : ""}
                        />
                      </div>
                    </div>

                    {/* 互动率 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E2E2DF]/70 bg-[#FCFCFB]/40 p-3.5 transition-all hover:bg-[#EBEBE9]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>互动率</span>
                        <TrendingUp className="size-3.5 text-[#78716C]" />
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatPercent(interaction)}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#78716C] font-normal">
                        <span>赞/评/藏/转</span>
                        <BreakoutGradeTag
                          rating={interactionRating}
                          metricLabel="互动率"
                          targetLabel={breakoutTargets ? formatTarget(breakoutTargets.interaction) : ""}
                        />
                      </div>
                    </div>

                    {/* 点赞率 / 收藏率：干货看收藏率，复盘及其他看点赞率 */}
                    <div className="relative overflow-hidden rounded-xl border border-[#E2E2DF]/70 bg-[#FCFCFB]/40 p-3.5 transition-all hover:bg-[#EBEBE9]/80">
                      <div className="text-[12px] font-medium text-[#78716C] flex items-center justify-between">
                        <span>{fourthSlotLabel}</span>
                        {fourthSlotIsFavorite ? (
                          <Bookmark className="size-3.5 text-[#78716C]" />
                        ) : (
                          <ThumbsUp className="size-3.5 text-[#78716C]" />
                        )}
                      </div>
                      <div className="mt-1.5 text-2xl font-[580] tabular-nums text-[#1C1917] tracking-tight">
                        {formatPercent(fourthSlotValue)}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#78716C] font-normal">
                        <span>
                          {hasTopicKind ? (
                            <>
                              {fourthSlotIsFavorite ? "收藏" : "点赞"}{" "}
                              <span className="tabular-nums font-medium text-[#292524]">
                                {formatNumber(fourthSlotIsFavorite ? snapshot?.favorites : snapshot?.likes)}
                              </span>
                            </>
                          ) : (
                            "话题标签缺失"
                          )}
                        </span>
                        <BreakoutGradeTag
                          rating={fourthRating}
                          metricLabel={fourthSlotLabel}
                          targetLabel={breakoutTargets ? formatTarget(breakoutTargets.fourth) : ""}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. 快照全量指标明细 (紧随爆款数据核心大盘下方) */}
              {snapshot && (
                <section className="rounded-2xl bg-white p-5 shadow-card-ring space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E2E2DF] pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-[#78716C]" />
                      <h3 className="text-[13px] font-medium text-[#1C1917] tracking-tight">
                        快照全量指标明细
                      </h3>
                    </div>
                    <span className="text-[11px] text-[#78716C] font-medium">
                      ({snapshot.snapshot_type} 抓取维度)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-1 sm:grid-cols-3 xl:grid-cols-4 text-[12px]">
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">点赞数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.likes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">评论数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.comments)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">分享数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.shares)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">收藏数</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.favorites)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">涨粉量</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        +{formatNumber(snapshot.follower_gain)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">掉粉量</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        -{formatNumber(snapshot.follower_loss)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">导粉量</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatNumber(snapshot.follower_convert)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">导粉率</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatPercent(fanConv)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">2s 跳出率</span>
                      <MetricPercentValue
                        value={snapshot.bounce_rate_2s}
                        normalClassName={getBounceRate2sClass(snapshot.bounce_rate_2s)}
                      />
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">5s 完播率</span>
                      <MetricPercentValue
                        value={snapshot.completion_rate_5s}
                        normalClassName={getCompletionRate5sClass(snapshot.completion_rate_5s)}
                      />
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">完播率</span>
                      <MetricPercentValue
                        value={snapshot.completion_rate}
                        normalClassName={getCompletionRateClass(snapshot.completion_rate)}
                      />
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-[#E2E2DF]/60">
                      <span className="text-[#292524]">平均播放时长</span>
                      <span className="font-medium tabular-nums text-[#1C1917]">
                        {formatDuration(snapshot.avg_play_duration)}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* 3. 数据截图证据 (智能自适应手机长图与电脑宽图，可单列大图/双列对照，支持点击全屏放大) */}
              <details className="group/details rounded-2xl bg-white p-4 shadow-card-ring" open>
                <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium text-[#1C1917] select-none">
                  <div className="flex items-center gap-2">
                    <span>数据截图证据</span>
                    {activeScreenshots.length > 0 && (
                      <span className="text-[12px] font-normal text-[#78716C]">
                        {hasWideScreenshot ? "（含电脑宽幅，已智能全宽展开）" : "（点击可全屏放大）"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    {activeScreenshots.length > 1 && (
                      <div
                        className="hidden sm:inline-flex items-center rounded-lg border border-[#E2E2DF] bg-[#F7F7F6] p-0.5 text-[11px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setViewLayout("side-by-side")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                            effectiveLayout === "side-by-side"
                              ? "bg-white text-[#1C1917] shadow-xs"
                              : "text-[#78716C] hover:text-[#1C1917]"
                          }`}
                          title="双列左右并排对照"
                        >
                          <Columns2 className="size-3" />
                          双列对照
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewLayout("stacked")}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                            effectiveLayout === "stacked"
                              ? "bg-white text-[#1C1917] shadow-xs"
                              : "text-[#78716C] hover:text-[#1C1917]"
                          }`}
                          title="单列大画幅展开，字迹更大更清晰"
                        >
                          <Maximize2 className="size-3" />
                          单列大图
                        </button>
                      </div>
                    )}
                    <ChevronDown className="size-4 text-[#78716C] transition-transform duration-200 group-open/details:rotate-180" />
                  </div>
                </summary>

                <div
                  className={`mt-3 ${
                    effectiveLayout === "stacked"
                      ? "flex flex-col gap-5"
                      : "grid gap-4 md:grid-cols-2"
                  }`}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5">
                        {curveScreenshot && (aspectRatios[curveScreenshot.url] ?? 0.5) > 1.15 ? (
                          <Monitor className="size-3.5 text-[#78716C]" />
                        ) : (
                          <Smartphone className="size-3.5 text-[#78716C]" />
                        )}
                        <span className="font-medium text-[#292524]">流量曲线</span>
                        {curveScreenshot && (
                          <span className="text-[11px] text-[#A8A29E]">
                            {(aspectRatios[curveScreenshot.url] ?? 0.5) > 1.15 ? "电脑端宽图" : "手机端截图"}
                          </span>
                        )}
                      </div>
                      {curveScreenshot && (
                        <span className="text-[11px] text-[#A8A29E]">点击全屏</span>
                      )}
                    </div>

                    {curveScreenshot ? (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = activeScreenshots.findIndex((s) => s.url === curveScreenshot.url);
                          if (idx !== -1) setPreviewIndex(idx);
                        }}
                        className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-0 text-left transition-all hover:border-[#78716C]/50 hover:shadow-card-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] ${
                          effectiveLayout === "stacked" && (aspectRatios[curveScreenshot.url] ?? 0.5) <= 1.15
                            ? "max-w-[380px] mx-auto"
                            : ""
                        }`}
                        title="点击全屏放大预览"
                      >
                        <img
                          src={curveScreenshot.url}
                          alt="流量曲线截图"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              handleImageLoad(curveScreenshot.url, img.naturalWidth / img.naturalHeight);
                            }
                          }}
                          className={`w-full object-contain transition-transform duration-200 group-hover:scale-[1.01] ${
                            effectiveLayout === "stacked"
                              ? (aspectRatios[curveScreenshot.url] ?? 0.5) > 1.15
                                ? "max-h-[440px]"
                                : "max-h-[600px]"
                              : "max-h-[540px]"
                          }`}
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3 text-[12px] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <span>流量曲线截图</span>
                          <span className="flex items-center gap-1 font-medium">
                            <ZoomIn className="size-3.5" />
                            点击全屏放大
                          </span>
                        </div>
                      </button>
                    ) : (
                      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#E2E2DF] bg-[#FCFCFB] px-4 text-center text-[12px] text-[#A8A29E]">
                        暂无流量曲线截图
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5">
                        {retentionScreenshot && (aspectRatios[retentionScreenshot.url] ?? 0.5) > 1.15 ? (
                          <Monitor className="size-3.5 text-[#78716C]" />
                        ) : (
                          <Smartphone className="size-3.5 text-[#78716C]" />
                        )}
                        <span className="font-medium text-[#292524]">留存脱落</span>
                        {retentionScreenshot && (
                          <span className="text-[11px] text-[#A8A29E]">
                            {(aspectRatios[retentionScreenshot.url] ?? 0.5) > 1.15 ? "电脑端宽图" : "手机端截图"}
                          </span>
                        )}
                      </div>
                      {retentionScreenshot && (
                        <span className="text-[11px] text-[#A8A29E]">点击全屏</span>
                      )}
                    </div>

                    {retentionScreenshot ? (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = activeScreenshots.findIndex((s) => s.url === retentionScreenshot.url);
                          if (idx !== -1) setPreviewIndex(idx);
                        }}
                        className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] p-0 text-left transition-all hover:border-[#78716C]/50 hover:shadow-card-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] ${
                          effectiveLayout === "stacked" && (aspectRatios[retentionScreenshot.url] ?? 0.5) <= 1.15
                            ? "max-w-[380px] mx-auto"
                            : ""
                        }`}
                        title="点击全屏放大预览"
                      >
                        <img
                          src={retentionScreenshot.url}
                          alt="留存脱落截图"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              handleImageLoad(retentionScreenshot.url, img.naturalWidth / img.naturalHeight);
                            }
                          }}
                          className={`w-full object-contain transition-transform duration-200 group-hover:scale-[1.01] ${
                            effectiveLayout === "stacked"
                              ? (aspectRatios[retentionScreenshot.url] ?? 0.5) > 1.15
                                ? "max-h-[440px]"
                                : "max-h-[600px]"
                              : "max-h-[540px]"
                          }`}
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3 text-[12px] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <span>留存脱落截图</span>
                          <span className="flex items-center gap-1 font-medium">
                            <ZoomIn className="size-3.5" />
                            点击全屏放大
                          </span>
                        </div>
                      </button>
                    ) : (
                      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[#E2E2DF] bg-[#FCFCFB] px-4 text-center text-[12px] text-[#A8A29E]">
                        暂无留存脱落截图
                      </div>
                    )}
                  </div>
                </div>
              </details>

              {/* 4. 脚本文案与内容库 (置于截图下方，方便对照留存脱落点阅读文案，行高加舒展) */}
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

                <div className="rounded-xl shadow-card-ring bg-[#FCFCFB]/50 p-4 min-h-[200px] max-h-[460px] overflow-y-auto text-[13px] leading-[1.8] tracking-[0.01em] text-[#292524] whitespace-pre-wrap break-words">
                  {video.content?.trim() || (
                    <span className="text-[#78716C]">暂未录入视频文案</span>
                  )}
                </div>
              </section>

              {/* 5. 选题库流转 (依据定性证据决定入库/移出) */}
              <section className="rounded-2xl bg-white p-4 shadow-card-ring space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-medium text-[#1C1917]">选题库</h3>
                    <p className="mt-1 text-[12px] text-[#78716C]">
                      {topicLibraryStatus === "in_library"
                        ? "当前作品已自动入选题库"
                        : topicLibraryStatus === "removed"
                          ? "当前作品已从题库移出，可恢复入库"
                          : topicLibraryStatus === "review_excluded"
                            ? "复盘类型视频不进入干货选题库"
                            : topicLibraryStatus === "ineligible"
                              ? "暂未达到入库标准（24h 播放满 3 万自动进入）"
                              : topicLibraryStatus === "pending_entry"
                                ? "已满足条件，等待自动入库"
                                : "暂未取得选题库状态"}
                    </p>
                  </div>
                  {onToggleTopicLibrary && (topicLibraryStatus === "in_library" || topicLibraryStatus === "removed") ? (
                    <Button type="button" variant="secondary" size="s" onClick={handleTopicToggle} disabled={isTopicUpdating}>
                      {isTopicUpdating ? "处理中…" : topicLibraryStatus === "in_library" ? "移出选题库" : "恢复到选题库"}
                    </Button>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
    <Patch24hDialog
      open={showPatch24h}
      video={video}
      snapshot={snapshot}
      onOpenChange={setShowPatch24h}
      onSaved={() => onLifecycleChanged()}
    />
    {previewIndex !== null && activeScreenshots[previewIndex] && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#1C1917]/85 p-4 backdrop-blur-md animate-in fade-in-0 duration-150 select-none"
        onClick={() => setPreviewIndex(null)}
        role="dialog"
        aria-modal="true"
        aria-label="截图大图预览"
      >
        <button
          type="button"
          onClick={() => setPreviewIndex(null)}
          className="absolute right-5 top-5 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          title="关闭预览 (Esc)"
        >
          <X className="size-5" />
        </button>

        {activeScreenshots.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : activeScreenshots.length - 1));
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors cursor-pointer"
              title="上一张 (←)"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex((i) => (i !== null && i < activeScreenshots.length - 1 ? i + 1 : 0));
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors cursor-pointer"
              title="下一张 (→)"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}

        <div
          className="relative flex max-h-[calc(100dvh-4.5rem)] max-w-[calc(100vw-2.5rem)] flex-col items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={activeScreenshots[previewIndex].url}
            alt={activeScreenshots[previewIndex].label}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                handleImageLoad(activeScreenshots[previewIndex].url, img.naturalWidth / img.naturalHeight);
              }
            }}
            className={`rounded-xl border border-white/15 bg-black object-contain shadow-2xl transition-all duration-150 ${
              (aspectRatios[activeScreenshots[previewIndex].url] ?? 0.5) > 1.15
                ? "max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-3.5rem)] w-auto h-auto"
                : "max-h-[calc(100dvh-6.5rem)] max-w-[min(90vw,560px)] w-auto h-auto"
            }`}
          />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[12px] font-medium text-white shadow-sm backdrop-blur-md">
            <span className="flex items-center gap-1.5">
              {(aspectRatios[activeScreenshots[previewIndex].url] ?? 0.5) > 1.15 ? (
                <Monitor className="size-3.5 text-white/80" />
              ) : (
                <Smartphone className="size-3.5 text-white/80" />
              )}
              <span>{activeScreenshots[previewIndex].label}</span>
              <span className="text-white/60">
                {(aspectRatios[activeScreenshots[previewIndex].url] ?? 0.5) > 1.15 ? "· 电脑端截图" : "· 手机端截图"}
              </span>
            </span>
            {activeScreenshots.length > 1 && (
              <span className="text-white/60 tabular-nums">
                ({previewIndex + 1}/{activeScreenshots.length})
              </span>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

"use client";

import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Copy, Check, RotateCcw, Trash2, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { breakoutRating, breakoutTargetsFor } from "@/lib/breakout-rating";

import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
} from "@/components/ui/sheet";
import { fanConversionRate, followerConversionRate } from "@/lib/video-metrics";
import { resolveReviewScreenshots } from "@/lib/video-screenshot";
import { shouldShowPatch24hButton } from "@/lib/video-admin";
import { Patch24hDialog } from "../videos/patch-24h-dialog";
import type { VideoTopicKind, VideoTopicLibraryStatus } from "@/lib/topics/library";

import type { VideoMetricsSnapshot } from "@/types";
import type { VideoRow } from "@/lib/content/domain/detail";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";

export interface ContentDetailDialogProps {
  evaluationStandards?: EvaluationStandards;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  canOperateLifecycle?: boolean;
  canPurge?: boolean;
  onLifecycleChanged: () => void;
  topicLibraryStatus?: VideoTopicLibraryStatus | null;
  /** 视频话题分类，仅用于展示与选题分析。 */
  topicKind?: VideoTopicKind | null;
  onToggleTopicLibrary?: (action: "remove" | "restore") => Promise<void>;
  /** 抽屉标题前缀，默认为“数据复盘” */
  titlePrefix?: string;
  /** 返回上一级（如返回个人档案卡） */
  onBack?: () => void;
  /** 返回按钮标签（如“张三的档案”） */
  backLabel?: string;
  /** 呈现模式：sheet 为独立右侧抽屉，inline 为内嵌在父级抽屉视口中 */
  renderMode?: "sheet" | "inline";
  /** 在 inline 模式下彻底关闭整个抽屉的回调 */
  onCloseEntirely?: () => void;
  /** 当前作品在完整筛选结果中的全局索引（0-indexed，-1 表示未找到或深链） */
  currentIndex?: number;
  /** 列表当前作品总条数 */
  totalCount?: number;
  /** 相邻作品回调（支持跨分页） */
  onStepVideo?: (direction: "prev" | "next") => void;
  /** 选择作者回调：打开创作者作品流抽屉 */
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  /** 列表或协作入口已经计算好的统一内容质量结果。缺失时不显示综合评级。 */
  contentQuality?: WorkContentQuality | null;
}

import { useContentVideoStepShortcut } from "./content-video-navigation";
import { ContentDetailAllMetrics, ContentDetailCoreStats, ContentDetailHeadline, ContentDetailNotices } from "./detail/content-detail-metrics";
import { ContentDetailEvidence } from "./detail/content-detail-evidence";
import { ContentDetailPreview } from "./detail/content-detail-preview";
import { useContentDetailLifecycle } from "./content-detail-lifecycle";

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
  titlePrefix = "数据复盘",
  onBack,
  backLabel,
  renderMode = "sheet",
  onCloseEntirely,
  currentIndex = -1,
  totalCount = 0,
  onStepVideo,
  onSelectAuthor,
  ownerNames,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
  contentQuality = null,
}: ContentDetailDialogProps) {
  const {
    isOperating,
    isConfirmingPurge: showConfirmPurge,
    isConfirmingRestore: showConfirmRestore,
    isConfirmingTrash: showConfirmTrash,
    requestConfirmation,
    clearConfirmation,
    handleLifecycleAction,
    isPurgeEligible,
    getPurgeTooltip,
  } = useContentDetailLifecycle({ video, onLifecycleChanged });
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [copiedContent, setCopiedContent] = useState(false);
  const [isTopicUpdating, setIsTopicUpdating] = useState(false);
  const [showPatch24h, setShowPatch24h] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const hasIndex = typeof currentIndex === "number" && currentIndex >= 0;
  const hasPrev = hasIndex && currentIndex > 0;
  const hasNext = hasIndex && typeof totalCount === "number" && currentIndex < totalCount - 1;
  const isLast = !hasNext && hasIndex && typeof totalCount === "number" && totalCount > 0;
  const [displayCurrent, displayTotal] = [hasIndex ? currentIndex + 1 : "—", typeof totalCount === "number" && totalCount > 0 ? totalCount : "—"];

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

  const screenshots = resolveReviewScreenshots(snapshot, video?.id);
  const curveScreenshot = screenshots.find((item) => item.slot === "curve");
  const retentionScreenshot = screenshots.find((item) => item.slot === "retention");

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [failedScreenshots, setFailedScreenshots] = useState<Record<string, boolean>>({});

  const handleImageLoad = useCallback((url: string, ratio: number) => {
    setAspectRatios((prev) => {
      if (prev[url] === ratio) return prev;
      return { ...prev, [url]: ratio };
    });
    setFailedScreenshots((prev) => {
      if (!prev[url]) return prev;
      const next = { ...prev };
      delete next[url];
      return next;
    });
  }, []);

  const handleImageError = useCallback((url: string) => {
    setFailedScreenshots((prev) => {
      if (prev[url]) return prev;
      return { ...prev, [url]: true };
    });
  }, []);

  const activeScreenshots = useMemo(() => {
    const list: { label: string; url: string; subLabel: string }[] = [];
    if (curveScreenshot) list.push({ label: "流量曲线截图", subLabel: "流量曲线", url: curveScreenshot.url });
    if (retentionScreenshot) list.push({ label: "留存脱落截图", subLabel: "留存脱落", url: retentionScreenshot.url });
    return list;
  }, [curveScreenshot, retentionScreenshot]);

  const hasAvailableScreenshots = activeScreenshots.some((s) => !failedScreenshots[s.url]);
  // 有电脑宽图就上下排，全是手机竖图就左右并排；不再让人手动切
  const stackedScreenshots = activeScreenshots.some((s) => (aspectRatios[s.url] ?? 0.5) > 1.15);

  useEffect(() => {
    if (!open) return;
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewIndex !== null) return;
      if (showPatch24h) return;
      if (showConfirmTrash || showConfirmPurge || showConfirmRestore) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        clearConfirmation();
        return;
      }
      if (onBack) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onBack();
        return;
      }
      if (renderMode === "inline") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (onCloseEntirely) {
          onCloseEntirely();
        } else {
          onOpenChange(false);
        }
      }
    };
    window.addEventListener("keydown", handleEscKey, true);
    return () => window.removeEventListener("keydown", handleEscKey, true);
  }, [open, previewIndex, showPatch24h, showConfirmTrash, showConfirmPurge, showConfirmRestore, clearConfirmation, onBack, renderMode, onCloseEntirely, onOpenChange]);

  useContentVideoStepShortcut({
    open,
    onStepVideo,
    hasPrev,
    hasNext,
    disabled: previewIndex !== null || showPatch24h,
  });

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

  const followerConv = snapshot ? followerConversionRate(snapshot) : null;
  const fanConv = snapshot ? fanConversionRate(snapshot) : null;
  const breakoutTargets = breakoutTargetsFor(topicKind, evaluationStandards);
  const followerRating = breakoutTargets ? breakoutRating(followerConv, breakoutTargets.follower) : null;

  const closeEntirely = onCloseEntirely || (() => onOpenChange(false));

  const confirmBanner = !video ? null
    : showConfirmTrash ? {
        action: "trash" as const,
        message: "移入回收站后这条作品会隐藏，关联的成员绩效日报同步作废。",
        cancelLabel: "暂保留",
        confirmLabel: isOperating ? "正在移入..." : "确认移入",
        variant: "destructive" as const,
      }
    : showConfirmPurge ? {
        action: "purge" as const,
        message: "彻底删除后永久隐藏并清理截图，不能撤销。",
        cancelLabel: "暂保留",
        confirmLabel: isOperating ? "正在删除..." : "彻底删除",
        variant: "destructive" as const,
      }
    : showConfirmRestore ? {
        action: "restore" as const,
        message: "恢复后这条作品重新出现在列表里，关联的成员绩效日报一并恢复。",
        cancelLabel: "暂不恢复",
        confirmLabel: isOperating ? "正在恢复..." : "确认恢复",
        variant: "secondary" as const,
      }
    : null;

  const iconButton = "inline-flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:pointer-events-none";
  const textButton = "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

  const innerContent = (
    <div className={renderMode === "inline" ? "flex flex-col h-full bg-white select-text overflow-hidden" : "flex flex-col h-full"}>
      {/* 头部一行：左边回到哪，右边能做什么；不重复标题 */}
      <SheetHeader className="shrink-0 gap-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          {onBack ? (
            <button type="button" onClick={onBack} className={`${textButton} -ml-2 text-[14px]`}>
              <ChevronLeft className="size-3.5" aria-hidden />
              <span className="truncate">{backLabel ?? "返回"}</span>
            </button>
          ) : (
            <span className="text-[12px] text-[#78716C]">{titlePrefix} · 作品诊断</span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {video && onStepVideo && (
            <span className="inline-flex items-center">
              <SimpleTooltip side="bottom" tip="上一条（K 或 ↑）">
                <button type="button" onClick={() => onStepVideo("prev")} disabled={!hasPrev} aria-label="上一条" className={iconButton}>
                  <ChevronLeft className="size-3.5" aria-hidden />
                </button>
              </SimpleTooltip>
              <span className="px-1 text-[12px] text-[#78716C] tabular-nums select-none whitespace-nowrap">
                {displayCurrent} / {displayTotal}
              </span>
              <SimpleTooltip side="bottom" tip={isLast ? "已是最后一条" : "下一条（J 或 ↓）"}>
                <button type="button" onClick={() => onStepVideo("next")} disabled={!hasNext} aria-label="下一条" className={iconButton}>
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              </SimpleTooltip>
            </span>
          )}

          {video?.video_url && (
            <a href={video.video_url} target="_blank" rel="noreferrer" className={textButton}>
              <ExternalLink className="size-3" aria-hidden />
              打开源视频网页
            </a>
          )}

          {/* 写操作只在有管理作品权限时出现 */}
          {video && canOperate && (
            <>
              {video.lifecycle_state !== "trashed" && shouldShowPatch24hButton(video, snapshot) && (
                <button type="button" onClick={() => setShowPatch24h(true)} className={textButton}>
                  补录24h
                </button>
              )}
              {video.lifecycle_state === "trashed" ? (
                <>
                  <button type="button" onClick={() => requestConfirmation("restore")} disabled={isOperating} className={textButton}>
                    <RotateCcw className="size-3" aria-hidden />
                    恢复作品
                  </button>
                  {canPurge && (() => {
                    const eligible = isPurgeEligible(video.trashed_at ?? null);
                    const tooltip = getPurgeTooltip(video.trashed_at ?? null);
                    const purgeButton = (
                      <button type="button" onClick={() => requestConfirmation("purge")} disabled={!eligible || isOperating} className={`${textButton} hover:text-status-danger`}>
                        <Trash2 className="size-3" aria-hidden />
                        永久删除
                      </button>
                    );
                    return tooltip ? <SimpleTooltip side="bottom" align="end" tip={tooltip}>{purgeButton}</SimpleTooltip> : purgeButton;
                  })()}
                </>
              ) : (
                <button type="button" onClick={() => requestConfirmation("trash")} disabled={isOperating} className={`${textButton} hover:text-status-danger`}>
                  <Trash2 className="size-3" aria-hidden />
                  移入回收站
                </button>
              )}
            </>
          )}

          <SimpleTooltip side="bottom" align="end" tip="关闭（Esc）">
            <button type="button" onClick={closeEntirely} aria-label="关闭作品诊断" className={iconButton}>
              <X className="size-4" aria-hidden />
            </button>
          </SimpleTooltip>
        </div>
      </SheetHeader>

      {confirmBanner && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-y border-[#E2E2DF]/60 bg-[#FCFCFB] px-4 py-2 text-[14px] sm:px-6 animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="min-w-0 text-[#1F1E1D]">{confirmBanner.message}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" size="s" onClick={clearConfirmation} disabled={isOperating}>
              {confirmBanner.cancelLabel}
            </Button>
            <Button type="button" variant={confirmBanner.variant} size="s" onClick={() => handleLifecycleAction(confirmBanner.action)} disabled={isOperating}>
              {confirmBanner.confirmLabel}
            </Button>
          </div>
        </div>
      )}

      {/* 正文：结论 → 四个核心数 → 截图 → 全部指标 → 文案 → 选题库 */}
      <SheetBody className="px-4 pt-3 sm:px-6 space-y-5 overflow-y-auto max-h-[calc(100dvh-65px)] pb-[calc(2.5rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-6">
        {video ? (
          <>
            <ContentDetailNotices video={video} canPurge={canPurge} isPurgeEligible={isPurgeEligible} />
            <ContentDetailHeadline
              video={video}
              snapshot={snapshot}
              contentQuality={contentQuality}
              evaluationStandards={evaluationStandards}
              ownerNames={ownerNames}
              onSelectAuthor={onSelectAuthor}
            />
            <ContentDetailCoreStats
              snapshot={snapshot}
              contentQuality={contentQuality}
              followerConv={followerConv}
              followerRating={followerRating}
              evaluationStandards={evaluationStandards}
            />
            <ContentDetailEvidence
              activeScreenshots={activeScreenshots}
              stacked={stackedScreenshots}
              curveScreenshot={curveScreenshot}
              retentionScreenshot={retentionScreenshot}
              aspectRatios={aspectRatios}
              handleImageLoad={handleImageLoad}
              handleImageError={handleImageError}
              setPreviewIndex={setPreviewIndex}
            />
            <ContentDetailAllMetrics
              snapshot={snapshot}
              fanConv={fanConv}
              hasAvailableScreenshots={hasAvailableScreenshots}
              evaluationStandards={evaluationStandards}
            />

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[14px] text-[#141413]">
                  文案
                  <span className="ml-2 text-[12px] text-[#78716C] tabular-nums">{video.content?.length ?? 0} 字</span>
                </h3>
                {video.content && (
                  <button type="button" onClick={handleCopyContent} className={textButton}>
                    {copiedContent ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                    {copiedContent ? "已复制" : "复制文案"}
                  </button>
                )}
              </div>
              <div className="max-h-[460px] overflow-y-auto rounded-xl bg-[#FCFCFB] px-4 py-3 text-[13px] leading-[1.6] text-[#1F1E1D] whitespace-pre-wrap break-words">
                {video.content?.trim() || <span className="text-[#A8A29E]">还没有录入文案</span>}
              </div>
            </section>

            {onToggleTopicLibrary && (
              <section className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[14px] text-[#141413]">选题库</h3>
                  <p className="mt-1 text-[12px] text-[#78716C]">
                    {topicLibraryStatus === "in_library"
                      ? "已自动入选题库"
                      : topicLibraryStatus === "removed"
                        ? "已从选题库移出，可以恢复"
                        : topicLibraryStatus === "review_excluded"
                          ? "复盘类视频不进干货选题库"
                          : topicLibraryStatus === "ineligible"
                            ? "还没达到入库标准（24 小时播放满 3 万自动入库）"
                            : topicLibraryStatus === "pending_entry"
                              ? "已满足条件，等待自动入库"
                              : "暂未取得选题库状态"}
                  </p>
                </div>
                {(topicLibraryStatus === "in_library" || topicLibraryStatus === "removed") ? (
                  <Button type="button" variant="secondary" size="s" onClick={handleTopicToggle} disabled={isTopicUpdating}>
                    {isTopicUpdating ? "处理中…" : topicLibraryStatus === "in_library" ? "移出选题库" : "恢复到选题库"}
                  </Button>
                ) : null}
              </section>
            )}
          </>
        ) : null}
      </SheetBody>
      <ContentDetailPreview
        previewIndex={previewIndex}
        activeScreenshots={activeScreenshots}
        aspectRatios={aspectRatios}
        setPreviewIndex={setPreviewIndex}
        handleImageLoad={handleImageLoad}
      />
    </div>
  );
  return (
    <>
      {renderMode === "inline" ? (
        open ? innerContent : null
      ) : (
        <Sheet
          open={open}
          modal={!isDesktop}
          onOpenChange={(nextOpen, eventDetails) => {
            if (!nextOpen) {
              if (eventDetails?.reason === "focus-out") {
                return;
              }
              if (eventDetails?.event) {
                const target = eventDetails.event.target as Element | null;
                if (target?.closest?.("[data-video-id]")) {
                  return;
                }
              }
            }
            onOpenChange(nextOpen);
          }}
        >
          <SheetContent
            side="right"
            role="dialog"
            aria-modal="true"
            aria-label={`${titlePrefix} · 作品诊断`}
            ref={sheetContentRef}
            tabIndex={-1}
            initialFocus={sheetContentRef}
            showCloseButton={false}
            overlayClassName="md:pointer-events-none md:bg-transparent"
            className="w-full max-w-4xl p-0 sm:max-w-4xl border-l border-[#E2E2DF] bg-white shadow-claude-dialog"
          >
            {innerContent}
          </SheetContent>
        </Sheet>
      )}
      <Patch24hDialog
      open={showPatch24h}
      video={video}
      snapshot={snapshot}
      onOpenChange={setShowPatch24h}
      onSaved={() => onLifecycleChanged()}
    />
    </>
  );
}

export default ContentDetailDialog;

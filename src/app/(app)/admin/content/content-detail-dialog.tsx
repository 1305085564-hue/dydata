"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Copy, Check, RotateCcw, Trash2, AlertTriangle, FileText, ChevronLeft, Flame, X } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  breakoutRating,
  breakoutTargetsFor,
  hasKnownTopicKind,
  overallBreakoutGrade,
} from "@/lib/breakout-rating";

import { Button } from "@/components/ui/button";
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
import { resolveReviewScreenshots } from "@/lib/video-screenshot";
import { shouldShowPatch24hButton } from "@/lib/video-admin";
import { Patch24hDialog } from "../videos/patch-24h-dialog";
import type { VideoTopicKind, VideoTopicLibraryStatus } from "@/lib/topics/library";

import type { VideoMetricsSnapshot } from "@/types";
import type { VideoRow } from "@/lib/content/domain/detail";

export interface ContentDetailDialogProps {
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
  /** 抽屉标题前缀，默认为“视频复盘” */
  titlePrefix?: string;
  /** 返回上一级（如返回个人档案卡） */
  onBack?: () => void;
  /** 返回按钮标签（如“张三的档案”） */
  backLabel?: string;
  /** 呈现模式：sheet 为独立右侧抽屉，inline 为内嵌在父级抽屉视口中 */
  renderMode?: "sheet" | "inline";
  /** 在 inline 模式下彻底关闭整个抽屉的回调 */
  onCloseEntirely?: () => void;
}

import { ContentDetailMetrics } from "./detail/content-detail-metrics";
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
  titlePrefix = "视频复盘",
  onBack,
  backLabel,
  renderMode = "sheet",
  onCloseEntirely,
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

  useEffect(() => {
    if (!open) return;
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 1. 如果大图预览开着，由大图预览的 capture listener 处理
      if (previewIndex !== null) return;
      // 2. 如果补录24h弹窗开着，由 Dialog 处理
      if (showPatch24h) return;
      // 3. 如果有行内二次确认框，ESC 优先收起确认框，大图同款 capture 优先级
      if (showConfirmTrash || showConfirmPurge || showConfirmRestore) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        clearConfirmation();
        return;
      }
      // 4. 如果有上级档案卡（传入了 onBack），ESC 优先退回档案卡
      if (onBack) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onBack();
        return;
      }
      // 5. 如果是 inline 模式且没有 onBack，ESC 触发完全关闭抽屉
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
  // 话题未识别时标准线无从选择（第四格指标本身不同：收藏率 vs 点赞率），整体不出评级
  const breakoutTargets = hasTopicKind ? breakoutTargetsFor(topicKind) : null;
  const followerRating = breakoutTargets ? breakoutRating(followerConv, breakoutTargets.follower) : null;
  const interactionRating = breakoutTargets ? breakoutRating(interaction, breakoutTargets.interaction) : null;
  const fourthRating = breakoutTargets ? breakoutRating(fourthSlotValue, breakoutTargets.fourth) : null;

  // 综合只看互动率与第四格的平均达成率，播放封顶；转粉率保留单项标签（口径见数据口径 3.2）
  const overallGrade = overallBreakoutGrade(snapshot?.play_count, [
    interactionRating,
    fourthRating,
  ]);

  const innerContent = (
    <div className={renderMode === "inline" ? "flex flex-col h-full bg-white select-text overflow-hidden" : undefined}>
      <SheetHeader className="py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] font-normal text-[#78716C] min-w-0">
              {onBack && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="s"
                    onClick={onBack}
                    className="h-6 px-1.5 -ml-1 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] shrink-0 gap-0.5"
                    title="返回上一级"
                  >
                    <ChevronLeft className="size-3.5" />
                    <span>{backLabel ? `返回 ${backLabel}` : "返回"}</span>
                  </Button>
                  <span className="shrink-0 text-[#A8A29E]">·</span>
                </>
              )}
              <span className="flex items-center gap-1 text-[#1F1E1D] font-normal shrink-0">
                <Flame className="size-3.5 text-[#D97757]" />
                {titlePrefix} · 作品诊断
              </span>
              <span className="shrink-0 text-[#A8A29E]">·</span>
              <span className="tabular-nums shrink-0">ID: {video?.id.slice(0, 8)}</span>
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
                      onClick={() => requestConfirmation("restore")}
                      disabled={isOperating}
                      className="bg-status-success/10 text-status-success hover:bg-status-success/20"
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
                            onClick={() => requestConfirmation("purge")}
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
                    onClick={() => requestConfirmation("trash")}
                    disabled={isOperating}
                    className="hover:text-status-danger"
                  >
                    <Trash2 className="size-3" />
                    移入回收站
                  </Button>
                )}
              </div>
            )}

            {renderMode === "inline" && (
              <button
                type="button"
                onClick={onCloseEntirely || (() => onOpenChange(false))}
                className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors shrink-0 cursor-pointer"
                title="关闭抽屉 (Esc)"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </SheetHeader>

        {/* 移入回收站就地确认横幅（防误触作废日报） */}
        {showConfirmTrash && video && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF]/60 bg-[#FCFCFB] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 text-[#78716C] min-w-0">
              <AlertTriangle className="size-4 text-status-warning shrink-0" />
              <span>确认移入回收站？该作品将隐藏，关联的成员绩效日报将同步作废。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={clearConfirmation}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF]/60 bg-[#FCFCFB] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 text-[#78716C] min-w-0">
              <AlertTriangle className="size-4 text-status-danger shrink-0" />
              <span>确认彻底删除此作品？将永久隐藏并清理截图，此操作不可撤销。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={clearConfirmation}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E2DF]/60 bg-[#FCFCFB] px-6 py-3 text-[13px] animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 text-[#78716C] min-w-0">
              <AlertTriangle className="size-4 text-status-success shrink-0" />
              <span>确认恢复该作品？将重新出现在列表中，并复活关联的成员绩效日报。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="s"
                onClick={clearConfirmation}
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
                className="bg-status-success/10 text-status-success hover:bg-status-success/20"
              >
                {isOperating ? "正在恢复..." : "确认恢复"}
              </Button>
            </div>
          </div>
        )}

        <SheetBody className="p-4 sm:p-6 space-y-5 overflow-y-auto max-h-[calc(100dvh-65px)] pb-[calc(2.5rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-6">
          {video ? (
            <>
              <ContentDetailMetrics
                video={video}
                snapshot={snapshot}
                canPurge={canPurge}
                isPurgeEligible={isPurgeEligible}
                hasTopicKind={hasTopicKind}
                fourthSlotIsFavorite={fourthSlotIsFavorite}
                fourthSlotLabel={fourthSlotLabel}
                fourthSlotValue={fourthSlotValue}
                followerConv={followerConv}
                fanConv={fanConv}
                interaction={interaction}
                breakoutTargets={breakoutTargets}
                followerRating={followerRating}
                interactionRating={interactionRating}
                fourthRating={fourthRating}
                overallGrade={overallGrade}
              />
              <ContentDetailEvidence
                activeScreenshots={activeScreenshots}
                hasWideScreenshot={hasWideScreenshot}
                effectiveLayout={effectiveLayout}
                curveScreenshot={curveScreenshot}
                retentionScreenshot={retentionScreenshot}
                aspectRatios={aspectRatios}
                handleImageLoad={handleImageLoad}
                setPreviewIndex={setPreviewIndex}
                setViewLayout={setViewLayout}
              />
              {/* 4. 脚本文案与内容库 (置于截图下方，方便对照留存脱落点阅读文案，行高加舒展) */}
              <section className="border-t border-[#E2E2DF]/60 pt-5 mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-[#1F1E1D]" />
                    <h3 className="text-[13px] font-medium text-[#141413] tracking-tight">
                      视频文案内容库
                    </h3>
                    <span className="text-[12px] text-[#78716C] font-normal">
                      ({video.content?.length ?? 0} 字)
                    </span>
                  </div>
                  {video.content && (
                    <button
                      type="button"
                      onClick={handleCopyContent}
                      className="inline-flex items-center gap-1 text-[12px] font-normal text-[#D97757] hover:text-[#C46A4D] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                    >
                      {copiedContent ? (
                        <Check className="size-3.5 text-status-success" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedContent ? "已复制" : "复制文案"}
                    </button>
                  )}
                </div>

                <div className="bg-transparent border-t border-[#E2E2DF]/60 pt-4 min-h-[200px] max-h-[460px] overflow-y-auto text-[13px] leading-[1.8] tracking-[0.01em] text-[#1F1E1D] whitespace-pre-wrap break-words">
                  {video.content?.trim() || (
                    <span className="text-[#78716C]">暂未录入视频文案</span>
                  )}
                </div>
              </section>

              {/* 5. 选题库流转 (依据定性证据决定入库/移出) */}
              <section className="border-t border-[#E2E2DF]/60 pt-5 mt-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-medium text-[#141413]">选题库</h3>
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
    </div>
  );
  return (
    <>
      {renderMode === "inline" ? (
        open ? innerContent : null
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            role="dialog"
            aria-modal="true"
            aria-label={`${titlePrefix} · 作品诊断`}
            ref={sheetContentRef}
            tabIndex={-1}
            initialFocus={sheetContentRef}
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
    <ContentDetailPreview
      previewIndex={previewIndex}
      activeScreenshots={activeScreenshots}
      aspectRatios={aspectRatios}
      setPreviewIndex={setPreviewIndex}
      handleImageLoad={handleImageLoad}
    />
    </>
  );
}

export default ContentDetailDialog;

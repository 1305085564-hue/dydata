"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getApiFailureMessage } from "@/lib/api-failure-message";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { buildAuthorCollaborationUrl } from "@/lib/content/author-collaboration-link";
import { useAuthorWorks } from "./use-author-works";
import { useContentTopicLibrary } from "./content-topic-library";
import { interactionRate } from "@/lib/video-metrics";
import { ContentDetailDialog } from "./content-detail-dialog";
import { GradeMark } from "./content-list-row-parts";
import { shouldHandleInPlaceLinkClick } from "@/lib/navigation/link-click";
import type { AdminContentVideoDetail } from "@/lib/loaders/admin-content-page";

import { formatCompactNumber, formatPercent, formatDate, type AuthorWorksDrawerProps, type AuthorWorksViewProps } from "./author-works-shared";
export type { AuthorWorksDrawerProps, AuthorWorksViewProps } from "./author-works-shared";

type TimeRangeFilter = "30d" | "thisMonth" | "lastMonth" | "all";
type SortFilter = "published_at" | "play_count";

function AuthorStat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-[#78716C]">{label}</dt>
      <dd className="mt-1 text-[20px] leading-[1.20] tabular-nums text-[#141413]">
        {loading ? <Skeleton className="h-6 w-14 rounded-md" /> : value}
      </dd>
    </div>
  );
}

function SegmentGroup<K extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: K;
  options: ReadonlyArray<{ key: K; label: string }>;
  onChange: (key: K) => void;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2 text-[12px] transition-colors cursor-pointer",
            value === option.key ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AuthorWorksView({
  author,
  onClose,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
  canManageVideos = false,
  onViewInMainList,
  canReviewContent = false,
  canViewCollaboration = false,
  onWorksChanged,
  selectedVideoId: externalSelectedVideoId,
  onSelectVideoId,
}: AuthorWorksViewProps) {
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>("30d");
  const [sortField, setSortField] = useState<SortFilter>("published_at");
  const {data, loading, error, loadMore, refresh, retry} = useAuthorWorks({userId: author.id, timeRange, sortField});
  const videos = useMemo(() => data?.works ?? [], [data]);
  const snapshots = useMemo(() => Object.fromEntries((data?.snapshots ?? []).map(s => [s.video_id, s])), [data]);
  const qualityMap = data?.contentQualityByVideoId ?? {};
  const summary = error ? undefined : data?.summary;
  const [internalSelectedVideoId, setInternalSelectedVideoId] = useState<string | null>(null);
  const selectedVideoId = externalSelectedVideoId !== undefined ? externalSelectedVideoId : internalSelectedVideoId;
  const setSelectedVideoId = useCallback((id: string | null) => {
    if (onSelectVideoId) onSelectVideoId(id);
    else setInternalSelectedVideoId(id);
  }, [onSelectVideoId]);

  const collaborationUrl = useMemo(
    () => error ? null : buildAuthorCollaborationUrl(author.id, videos),
    [author.id, videos, error],
  );
  const [loadedDetails, setLoadedDetails] = useState<Record<string, AdminContentVideoDetail>>({});
  const [lastDisplayedDetail, setLastDisplayedDetail] = useState<AdminContentVideoDetail | null>(null);
  const selectVideoWithRetention = useCallback((id: string | null) => {
    if (!id) {
      setLastDisplayedDetail(null);
    } else if (loadedDetails[id]) {
      setLastDisplayedDetail(loadedDetails[id]);
    }
    setSelectedVideoId(id);
  }, [loadedDetails, setSelectedVideoId]);

  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const refreshWorks = useCallback(async () => {
    setLoadedDetails({});
    setLastDisplayedDetail(null);
    onWorksChanged?.();
    const updated = await refresh();
    if (updated && selectedVideoId && !updated.works.some(v => v.id === selectedVideoId)) selectVideoWithRetention(null);
  }, [onWorksChanged, refresh, selectedVideoId, selectVideoWithRetention]);
  const {topicLibraryStatuses, toggleTopicLibrary} = useContentTopicLibrary({videos, canReviewContent, refreshList: refreshWorks});

  // 当在内嵌详情中切换作品时加载详情数据
  useEffect(() => {
    if (!selectedVideoId || loadedDetails[selectedVideoId]) return;

    let cancelled = false;
    void (async () => {
      let response: Response | undefined;
      try {
        response = await fetch(`/api/admin/content/${selectedVideoId}?view=all`, { cache: "no-store" });
        if (!response.ok) {
          const message = await getApiFailureMessage(response, "加载作品复盘详情失败");
          if (!cancelled) setDetailError(message);
          return;
        }
        const detail = await response.json() as AdminContentVideoDetail;
        if (cancelled) return;
        setLoadedDetails((prev) => ({ ...prev, [detail.video.id]: detail }));
        setLastDisplayedDetail(detail);
      } catch {
        const message = await getApiFailureMessage(response, "加载作品复盘详情失败");
        if (cancelled) return;
        setDetailError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedVideoId, loadedDetails, detailAttempt]);

  // 详情只使用独立详情接口，列表摘要不能替代详情或补录后的新快照；切换相邻作品时保留上一条详情直至新详情就绪，避免骨架闪断。
  const activeDetail = selectedVideoId ? (loadedDetails[selectedVideoId] ?? lastDisplayedDetail ?? undefined) : undefined;
  const activeVideo = activeDetail?.video ?? null;
  const activeSnapshot = activeDetail?.snapshot ?? null;

  // 键盘与按钮快捷上下翻阅
  const currentIndex = useMemo(() => {
    if (!selectedVideoId) return -1;
    return videos.findIndex((v) => v.id === selectedVideoId);
  }, [selectedVideoId, videos]);

  const handleStepVideo = useCallback(
    (direction: "prev" | "next") => {
      setDetailError(null);
      if (currentIndex === -1 || videos.length === 0) return;
      if (direction === "prev" && currentIndex > 0) {
        selectVideoWithRetention(videos[currentIndex - 1].id);
      } else if (direction === "next" && currentIndex < videos.length - 1) {
        selectVideoWithRetention(videos[currentIndex + 1].id);
      } else if (direction === "next" && data?.hasNextPage && !loading) {
        void loadMore().then(next => { if (next?.works[currentIndex + 1]) selectVideoWithRetention(next.works[currentIndex + 1].id); });
      }
    },
    [currentIndex, videos, data?.hasNextPage, loading, loadMore, selectVideoWithRetention],
  );

  return (
    <div className="grid flex-1 min-h-0 grid-rows-[minmax(0,1fr)]">
      {/* 视图 1：创作者历史作品列表（当内嵌详情打开时仅视觉隐藏保住滚动位置） */}
      <div
        className={cn(
          "flex flex-col min-h-0 min-w-0 [grid-area:1/1]",
          selectedVideoId && "invisible pointer-events-none",
        )}
      >
        {/* 抽屉头部：名字即标题（20px Serif），下一行就是答案——这段时间交了几篇、表现如何 */}
        <header className="shrink-0 border-b border-[#E2E2DF] px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-[20px] leading-[1.20] text-[#141413]">{author?.name ?? "创作者"}</h2>
            <div className="flex shrink-0 items-center gap-1">
              {canViewCollaboration && collaborationUrl && (
                <Link
                  href={collaborationUrl}
                  className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
                >
                  个人档案
                </Link>
              )}
              {onViewInMainList && author?.id && (
                <button
                  type="button"
                  onClick={() => {
                    onViewInMainList(author.id);
                    onClose();
                  }}
                  className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
                >
                  列表只看此人
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-4 gap-4">
            <AuthorStat label="作品" loading={loading} value={summary ? `${summary.totalWorksCount} 篇` : "—"} />
            <AuthorStat label="条均播放" loading={loading} value={formatCompactNumber(summary?.averagePlayCount)} />
            <AuthorStat label="优质作品" loading={loading} value={summary ? `${summary.qualityWorksCount} 篇` : "—"} />
            <AuthorStat label="完播达标" loading={loading} value={summary ? `${summary.completionRatePassCount} 篇` : "—"} />
          </dl>
        </header>

        {/* 时间与排序：视图工具裸铺，激活态浅砂底 + 定名墨（美学宝典 §3.9） */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DF] px-6 py-2">
          <SegmentGroup
            ariaLabel="时间范围"
            value={timeRange}
            options={[
              { key: "30d", label: "近30天" },
              { key: "thisMonth", label: "本月" },
              { key: "lastMonth", label: "上月" },
              { key: "all", label: "全部" },
            ]}
            onChange={(key) => { selectVideoWithRetention(null); setTimeRange(key); }}
          />
          <SegmentGroup
            ariaLabel="排序"
            value={sortField}
            options={[
              { key: "published_at", label: "按发布时间" },
              { key: "play_count", label: "按播放量" },
            ]}
            onChange={(key) => { selectVideoWithRetention(null); setSortField(key); }}
          />
        </div>

        {/* 作品列表：列序与数据复盘主表一致——作品 → 评级 → 播放 → 互动率 → 留存达成 → 涨粉 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
          {loading && videos.length === 0 ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-center gap-2 py-12 text-[14px] text-[#1F1E1D]">
              <span>{error}</span>
              <Button type="button" size="s" variant="outline" onClick={() => void retry()}>重试</Button>
            </div>
          ) : videos.length === 0 ? (
            <div className="py-12">
              <EmptyState
                variant="compact"
                title="这段时间没有作品"
                description="换一个时间范围看看"
              />
            </div>
          ) : (
            <table className="w-full table-fixed text-left text-[13px] tabular-nums">
              <thead className="text-[12px] text-[#78716C] select-none [&_th]:font-normal">
                <tr className="border-b border-[#E2E2DF]/60">
                  <th className="w-[56px] py-2 pr-2">日期</th>
                  <th className="py-2 px-2">作品 · 账号</th>
                  <th className="w-[44px] py-2 px-2">评级</th>
                  <th className="w-[68px] py-2 px-2 text-right">播放量</th>
                  <th className="w-[64px] py-2 px-2 text-right">互动率</th>
                  <th className="w-[72px] py-2 px-2 text-right">留存达成</th>
                  <th className="w-[56px] py-2 pl-2 text-right">涨粉</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60">
                {videos.map((video) => {
                  const snap = snapshots[video.id];
                  const quality = qualityMap[video.id];
                  const interaction = snap ? interactionRate(snap) : null;
                  return (
                    <tr
                      key={video.id}
                      onClick={() => { setDetailError(null); selectVideoWithRetention(video.id); }}
                      className="group cursor-pointer transition-colors hover:bg-[#F7F7F6] active:bg-[#EBEBE9]"
                    >
                      <td className="py-2.5 pr-2 text-[12px] text-[#1F1E1D] whitespace-nowrap">{formatDate(video.published_at)}</td>
                      <td className="min-w-0 py-2.5 px-2">
                        <a
                          href={`/admin/content?videoId=${encodeURIComponent(video.id)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!shouldHandleInPlaceLinkClick(event)) return;
                            event.preventDefault();
                            setDetailError(null);
                            selectVideoWithRetention(video.id);
                          }}
                          onAuxClick={(event) => event.stopPropagation()}
                          className="block w-full truncate text-left text-[14px] text-[#1F1E1D] group-hover:text-[#141413] cursor-pointer outline-none focus-visible:underline focus-visible:underline-offset-2"
                        >
                          {video.video_title || video.content?.slice(0, 40) || "未命名视频"}
                        </a>
                        {video.accounts?.name && (
                          <div className="truncate text-[12px] text-[#78716C]">@{video.accounts.name}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-[14px]"><GradeMark grade={quality?.overallGrade} /></td>
                      <td className="py-2.5 px-2 text-right text-[14px] text-[#141413] whitespace-nowrap">{formatCompactNumber(snap?.play_count ?? null)}</td>
                      <td className="py-2.5 px-2 text-right text-[#1F1E1D] whitespace-nowrap">{interaction !== null ? formatPercent(interaction * 100) : "—"}</td>
                      <td className="py-2.5 px-2 text-right text-[#1F1E1D] whitespace-nowrap">{quality?.contentAchievement != null ? `${Math.round(quality.contentAchievement)}%` : "—"}</td>
                      <td className="py-2.5 pl-2 text-right text-[#78716C] whitespace-nowrap">{formatCompactNumber(snap?.follower_gain ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {data?.hasNextPage && !error && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMore()}
              className="w-full rounded-md py-3 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer disabled:cursor-wait"
            >
              {loading ? "正在加载…" : "加载更多作品"}
            </button>
          )}
        </div>
      </div>

      {/* 视图 2：内嵌作品复盘详情（外壳不飞，平滑内嵌） */}
      {selectedVideoId && (
        <div className="flex flex-col min-h-0 min-w-0 [grid-area:1/1]">
          {detailError ? (
            <div role="alert" className="flex flex-col gap-3 p-6 text-[14px] text-[#1F1E1D]">
              <p>详情没有加载出来：{detailError}</p>
              <div className="flex gap-2">
                <Button type="button" size="s" onClick={() => { setDetailError(null); setDetailAttempt(n => n + 1); }}>重试加载详情</Button>
                <Button type="button" size="s" variant="outline" onClick={() => { setDetailError(null); selectVideoWithRetention(null); }}>返回作品列表</Button>
              </div>
            </div>
          ) : !activeDetail ? (
            <div className="flex flex-col h-full bg-white p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-32 rounded-md" />
              </div>
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : (
            /* A3: 循环阻断——作者抽屉内嵌详情（第 2 层）不提供作者穿透入口（未传 onSelectAuthor），只保留右上角主页逃生口，严格防止嵌套 */
            <ContentDetailDialog
              open={true}
              onOpenChange={(openState) => {
                if (!openState) selectVideoWithRetention(null);
              }}
              renderMode="inline"
              video={activeVideo}
              ownerNames={{[author.id]: author.name}}
              snapshot={activeSnapshot}
              contentQuality={activeDetail.contentQuality ?? qualityMap[selectedVideoId] ?? null}
              evaluationStandards={activeDetail.evaluationStandards ?? data?.evaluationStandards ?? evaluationStandards}
              topicKind={activeDetail.topicKind}
              topicLibraryStatus={topicLibraryStatuses[activeDetail.video.id]?.status ?? null}
              onToggleTopicLibrary={canReviewContent ? action => toggleTopicLibrary(activeDetail.video.id, action) : undefined}
              canOperateLifecycle={canManageVideos}
              canPurge={false}
              titlePrefix="创作者档案"
              onBack={() => selectVideoWithRetention(null)}
              backLabel={author?.name ? `${author.name} 的作品` : "创作者作品"}
              onCloseEntirely={onClose}
              currentIndex={currentIndex}
              totalCount={data?.total ?? 0}
              onStepVideo={handleStepVideo}
              onLifecycleChanged={() => { void refreshWorks(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function AuthorWorksDrawer({
  author,
  open,
  onClose,
  ...rest
}: AuthorWorksDrawerProps) {
  const [embeddedVideoId, setEmbeddedVideoId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setEmbeddedVideoId(null);
    onClose();
  }, [onClose]);

  if (!open || !author) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          // A2: 点遮罩优先退回作品列表视图；仅第一层时点遮罩才关抽屉（照抄 personal-card.tsx L206-215 模式，缺口②）
          if (embeddedVideoId) {
            setEmbeddedVideoId(null);
            return;
          }
          handleClose();
        }
      }}
    >
      <SheetContent
        showCloseButton={false}
        className={cn(
          "w-full p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog rounded-l-2xl transition-[max-width] duration-240 ease-smooth max-w-4xl sm:max-w-4xl",
        )}
      >
        <AuthorWorksView
          key={author.id}
          author={author}
          onClose={handleClose}
          selectedVideoId={embeddedVideoId}
          onSelectVideoId={setEmbeddedVideoId}
          {...rest}
        />
      </SheetContent>
    </Sheet>
  );
}

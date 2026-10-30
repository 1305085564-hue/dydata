"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ExternalLink,
  Flame,
  PlaySquare,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { useAuthorWorks } from "./use-author-works";
import { useContentTopicLibrary } from "./content-topic-library";
import { interactionRate } from "@/lib/video-metrics";
import { ContentDetailDialog } from "./content-detail-dialog";
import type { AdminContentVideoDetail } from "@/lib/loaders/admin-content-page";

export interface AuthorWorksDrawerProps {
  author: { id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
  evaluationStandards?: EvaluationStandards;
  canManageVideos?: boolean;
  canReviewContent?: boolean;
  canViewCollaboration?: boolean;
  onWorksChanged?: () => void;
  onViewInMainList?: (authorId: string) => void;
}

export interface AuthorWorksViewProps {
  author: { id: string; name: string };
  onClose: () => void;
  onViewInMainList?: (authorId: string) => void;
  evaluationStandards?: EvaluationStandards;
  canManageVideos?: boolean;
  canReviewContent?: boolean;
  canViewCollaboration?: boolean;
  onWorksChanged?: () => void;
  selectedVideoId?: string | null;
  onSelectVideoId?: (videoId: string | null) => void;
}

type TimeRangeFilter = "30d" | "thisMonth" | "lastMonth" | "all";
type SortFilter = "published_at" | "play_count";

function formatCompactNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  if (val >= 100000000) return `${(val / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (val >= 10000) return `${(val / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return String(Math.round(val));
}

function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
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

  // B1/B2: 直达数据管理「人效档案」URL 计算
  // 月份取值定死：该作者在本页当前视图内最近一篇作品的发布月（发布日优先、无发布日回退 report_date），不是系统当前月；岗位 tab 取对应岗位
  const collaborationUrl = useMemo(() => {
    if (!author?.id) return null;
    let latestWork = videos[0] ?? null;
    for (const w of videos) {
      const wTime = w.published_at ? new Date(w.published_at).getTime() : (w.created_at ? new Date(w.created_at).getTime() : 0);
      const lTime = latestWork?.published_at ? new Date(latestWork.published_at).getTime() : (latestWork?.created_at ? new Date(latestWork.created_at).getTime() : 0);
      if (wTime > lTime) {
        latestWork = w;
      }
    }

    let targetYear: number;
    let targetMonth: number;
    const dateStr = latestWork?.published_at || latestWork?.created_at;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const shanghaiDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d);
        const [yStr, mStr] = shanghaiDate.split("-");
        targetYear = parseInt(yStr, 10);
        targetMonth = parseInt(mStr, 10);
      } else {
        const now = new Date();
        const shanghaiNow = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now);
        const [yStr, mStr] = shanghaiNow.split("-");
        targetYear = parseInt(yStr, 10);
        targetMonth = parseInt(mStr, 10);
      }
    } else {
      const now = new Date();
      const shanghaiNow = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now);
      const [yStr, mStr] = shanghaiNow.split("-");
      targetYear = parseInt(yStr, 10);
      targetMonth = parseInt(mStr, 10);
    }

    const params = new URLSearchParams({
      year: String(targetYear),
      month: String(targetMonth),
      tab: "talents",
      personId: author.id,
    });
    if (latestWork?.id) {
      params.set("from", "video");
      params.set("videoId", latestWork.id);
    }
    return `/admin/collaboration?${params.toString()}`;
  }, [author.id, videos]);
  const [loadedDetails, setLoadedDetails] = useState<Record<string, AdminContentVideoDetail>>({});

  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const refreshWorks = useCallback(async () => {
    setLoadedDetails({});
    onWorksChanged?.();
    const updated = await refresh();
    if (updated && selectedVideoId && !updated.works.some(v => v.id === selectedVideoId)) setSelectedVideoId(null);
  }, [onWorksChanged, refresh, selectedVideoId, setSelectedVideoId]);
  const {topicLibraryStatuses, toggleTopicLibrary} = useContentTopicLibrary({videos, canReviewContent, refreshList: refreshWorks});

  // 当在内嵌详情中切换作品时加载详情数据
  useEffect(() => {
    if (!selectedVideoId || loadedDetails[selectedVideoId]) return;

    let cancelled = false;
    fetch(`/api/admin/content/${selectedVideoId}?view=all`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("加载作品复盘详情失败");
        return res.json() as Promise<AdminContentVideoDetail>;
      })
      .then((detail) => {
        if (cancelled) return;
        setLoadedDetails((prev) => ({ ...prev, [detail.video.id]: detail }));
      })
      .catch((error) => {
        if (cancelled) return;
        setDetailError(error instanceof Error ? error.message : "详情加载失败");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVideoId, loadedDetails, detailAttempt]);

  // 详情只使用独立详情接口，列表摘要不能替代详情或补录后的新快照。
  const activeDetail = selectedVideoId ? loadedDetails[selectedVideoId] : undefined;
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
        setSelectedVideoId(videos[currentIndex - 1].id);
      } else if (direction === "next" && currentIndex < videos.length - 1) {
        setSelectedVideoId(videos[currentIndex + 1].id);
      } else if (direction === "next" && data?.hasNextPage && !loading) {
        void loadMore().then(next => { if (next?.works[currentIndex + 1]) setSelectedVideoId(next.works[currentIndex + 1].id); });
      }
    },
    [currentIndex, videos, data?.hasNextPage, loading, loadMore, setSelectedVideoId],
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
        {/* 抽屉头部：空间定名 20px Serif，两端对齐 */}
        <header className="flex flex-row items-center justify-between shrink-0 px-6 py-4 border-b border-[#E2E2DF] bg-[#FCFCFB]">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-[#F1F1F0] text-[#78716C] border border-[#E2E2DF] flex items-center justify-center text-[14px] font-normal">
              {author?.name?.slice(0, 1) || "作"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[20px] font-serif font-normal text-[#141413]">
                  {author?.name ?? "创作者"}
                </h2>
                <span className="rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] font-normal text-[#78716C]">
                  创作者作品档案
                </span>
              </div>
              <p className="text-[12px] text-[#78716C] mt-1">
                查看该创作者的历史作品走势与复盘详情
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canViewCollaboration && collaborationUrl && (
              <Link
                href={collaborationUrl}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-normal text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors"
                title="在数据管理中查看该作者岗位档案"
              >
                <TrendingUp className="size-3.5" />
                <span>人效档案</span>
              </Link>
            )}
            {onViewInMainList && author?.id && (
              <button
                type="button"
                onClick={() => {
                  onViewInMainList(author.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-normal text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
                title="在大盘中筛选并查看该作者全部数据"
              >
                <ExternalLink className="size-3.5" />
                <span>在复盘大盘中查看</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors shrink-0 cursor-pointer"
              title="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* 创作者轻量画像（极简 4 格概览，指标大数 20px） */}
        <div className="shrink-0 px-6 py-3 bg-[#F7F7F6] border-b border-[#E2E2DF]">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-white border border-[#E2E2DF] p-3">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C] mb-1">
                <PlaySquare className="size-3.5 text-[#78716C]" />
                <span>作品总数</span>
              </div>
              <div className="text-[20px] font-normal tabular-nums text-[#141413]">
                {loading ? <Skeleton className="h-6 w-12 rounded-md" /> : `${summary?.totalWorksCount ?? "—"} 篇`}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-[#E2E2DF] p-3">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C] mb-1">
                <TrendingUp className="size-3.5 text-[#78716C]" />
                <span>条均播放</span>
              </div>
              <div className="text-[20px] font-normal tabular-nums text-[#141413]">
                {loading ? <Skeleton className="h-6 w-16 rounded-md" /> : formatCompactNumber(summary?.averagePlayCount)}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-[#E2E2DF] p-3">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C] mb-1">
                <Flame className="size-3.5 text-[#D97757]" />
                <span>优质作品数</span>
              </div>
              <div className="text-[20px] font-normal tabular-nums text-[#141413]">
                {loading ? <Skeleton className="h-6 w-12 rounded-md" /> : `${summary?.qualityWorksCount ?? "—"} 篇`}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-[#E2E2DF] p-3">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C] mb-1">
                <Sparkles className="size-3.5 text-[#4B6B4E]" />
                <span>完播达标数</span>
              </div>
              <div className="text-[20px] font-normal tabular-nums text-[#141413]">
                {loading ? <Skeleton className="h-6 w-12 rounded-md" /> : `${summary?.completionRatePassCount ?? "—"} 篇`}
              </div>
            </div>
          </div>
        </div>

        {/* 快速筛选与排序栏：下沉槽分段控件（契约 §3.9：bg-white + shadow-input + #141413） */}
        <div className="shrink-0 flex items-center justify-between px-6 py-2 border-b border-[#E2E2DF] bg-white">
          {/* 周期切换 */}
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-[#78716C]">时间范围</span>
            <div className="inline-flex items-center rounded-md bg-[#F1F1F0] p-0.5">
              {(
                [
                  { key: "30d", label: "近30天" },
                  { key: "thisMonth", label: "本月" },
                  { key: "lastMonth", label: "上月" },
                  { key: "all", label: "全部历史" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setSelectedVideoId(null); setTimeRange(t.key); }}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md text-[12px] transition-all cursor-pointer font-normal",
                    timeRange === t.key
                      ? "bg-white text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 排序方式 */}
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-[#78716C]">排序</span>
            <div className="inline-flex items-center rounded-md bg-[#F1F1F0] p-0.5">
              {(
                [
                  { key: "published_at", label: "按发布时间" },
                  { key: "play_count", label: "按播放量" },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setSelectedVideoId(null); setSortField(s.key); }}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md text-[12px] transition-all cursor-pointer font-normal",
                    sortField === s.key
                      ? "bg-white text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413]",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 作品流列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          {loading && videos.length === 0 ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-[14px] text-status-danger">{error} <button type="button" onClick={() => void retry()}>重试</button></div>
          ) : videos.length === 0 ? (
            <div className="py-12">
              <EmptyState
                variant="compact"
                title="暂无该创作者的作品"
                description="所选时间范围内没有找到该创作者发布的作品记录"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-[#E2E2DF] overflow-hidden divide-y divide-[#E2E2DF]">
              <table className="w-full text-left text-[12px] table-fixed">
                <thead className="bg-[#F7F7F6] text-[#78716C] font-normal border-b border-[#E2E2DF] select-none">
                  <tr>
                    <th className="py-2 px-3 w-[72px] shrink-0 font-normal">发布日期</th>
                    <th className="py-2 px-3 min-w-[200px] font-normal">作品标题 / 账号</th>
                    <th className="py-2 px-2 text-right w-[80px] shrink-0 font-normal">播放量</th>
                    <th className="py-2 px-2 text-right w-[72px] shrink-0 font-normal">涨粉</th>
                    <th className="py-2 px-2 text-right w-[72px] shrink-0 font-normal">5s完播</th>
                    <th className="py-2 px-2 text-right w-[72px] shrink-0 font-normal">互动率</th>
                    <th className="py-2 px-3 text-center w-[60px] shrink-0 font-normal">评级</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E2DF] bg-white">
                  {videos.map((video) => {
                    const snap = snapshots[video.id];
                    const quality = qualityMap[video.id];
                    const play = snap?.play_count ?? null;
                    const followers = snap?.follower_gain ?? null;
                    const completion5s = snap?.completion_rate_5s ?? null;
                    const interaction = snap ? interactionRate(snap) : null;
                    const grade = quality?.overallGrade ?? null;

                    return (
                      <tr
                        key={video.id}
                        onClick={() => { setDetailError(null); setSelectedVideoId(video.id); }}
                        className="hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors cursor-pointer group"
                      >
                        <td className="py-2 px-3 text-[#78716C] tabular-nums whitespace-nowrap">
                          {formatDate(video.published_at)}
                        </td>
                        <td className="py-2 px-3 min-w-0">
                          <div className="font-normal text-[#1F1E1D] group-hover:text-[#141413] truncate">
                            {video.video_title || video.content?.slice(0, 40) || "未命名视频"}
                          </div>
                          {video.accounts?.name && (
                            <div className="text-[12px] text-[#A8A29E] truncate">
                              @{video.accounts.name}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-[#1F1E1D] whitespace-nowrap">
                          {formatCompactNumber(play)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                          {formatCompactNumber(followers)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                          {completion5s !== null ? formatPercent(completion5s) : "—"}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                          {interaction !== null ? formatPercent(interaction * 100) : "—"}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap font-normal">
                          {grade === "优" ? (
                            <span className="text-[#4B6B4E]">优</span>
                          ) : grade === "良" ? (
                            <span className="text-[#43718E]">良</span>
                          ) : grade === "劣" ? (
                            <span className="text-[#C0685C]">劣</span>
                          ) : (
                            <span className="text-[#78716C]">普</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 完卷微符 */}
          {data?.hasNextPage && !error && (
            <button type="button" disabled={loading} onClick={() => void loadMore()} className="w-full py-3 text-[12px] text-[#78716C]">{loading ? "正在加载…" : "加载更多作品"}</button>
          )}
          {!loading && !error && !data?.hasNextPage && videos.length > 0 && (
            <div className="flex items-center justify-center gap-3 py-6 text-[#E2E2DF]">
              <span className="h-[1px] w-8 bg-[#E2E2DF]" />
              <span className="text-[12px] text-[#A8A29E]">✦ 档案完卷</span>
              <span className="h-[1px] w-8 bg-[#E2E2DF]" />
            </div>
          )}
        </div>
      </div>

      {/* 视图 2：内嵌作品复盘详情（外壳不飞，平滑内嵌） */}
      {selectedVideoId && (
        <div className="flex flex-col min-h-0 min-w-0 [grid-area:1/1]">
          {detailError ? (
            <div role="alert" className="p-6">{detailError} <button type="button" onClick={() => { setDetailError(null); setDetailAttempt(n => n + 1); }}>重试详情</button> <button type="button" onClick={() => { setDetailError(null); setSelectedVideoId(null); }}>返回作品列表</button></div>
          ) : !loadedDetails[selectedVideoId] ? (
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
                if (!openState) setSelectedVideoId(null);
              }}
              renderMode="inline"
              video={activeVideo}
              ownerNames={{[author.id]: author.name}}
              snapshot={activeSnapshot}
              evaluationStandards={loadedDetails[selectedVideoId]?.evaluationStandards ?? data?.evaluationStandards ?? evaluationStandards}
              topicKind={loadedDetails[selectedVideoId]?.topicKind}
              topicLibraryStatus={topicLibraryStatuses[selectedVideoId]?.status ?? null}
              onToggleTopicLibrary={canReviewContent ? action => toggleTopicLibrary(selectedVideoId, action) : undefined}
              canOperateLifecycle={canManageVideos}
              canPurge={false}
              titlePrefix="创作者档案"
              onBack={() => setSelectedVideoId(null)}
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
          "w-full p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog rounded-l-2xl transition-[max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] max-w-4xl sm:max-w-4xl",
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

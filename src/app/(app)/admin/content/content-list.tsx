"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/ui/table-pagination";
import { EmptyState } from "@/components/ui/empty-state";
import type { ContentFeedbackCardView, ContentReviewReadiness, VideoMetricsSnapshot } from "@/types";
import { Check } from "lucide-react";
import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";

import {
  buildReviewQueue,
  buildSnapshotMap,
  type VideoRow,
} from "@/lib/review-queue";

interface ContentListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  feedbackCards: Record<string, ContentFeedbackCardView>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  totalCount?: number;
  view?: "pending" | "all";
  hasDeferredData?: boolean;
  isDeferredDataLoading?: boolean;
  onLoadDeferredData?: () => Promise<void>;
  onSelectVideoId: (id: string | null) => void;
}

type ViewMode = "interaction" | "completion";

type SortField =
  | "published_at"
  | "play_count"
  | "follower_gain"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "interaction_rate"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "avg_play_duration"
  | "completion_rate";

const DEFAULT_PAGE_SIZE = 20;

function formatCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  if (absVal >= 100000000) {
    const num = (absVal / 100000000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}亿`;
  }
  if (absVal >= 10000) {
    const num = (absVal / 10000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}万`;
  }
  return val.toLocaleString("zh-CN");
}

function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}

function formatDuration(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}s`;
}

function formatCompactTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

function getStatusDot(video: VideoRow) {
  const status = video.anomaly_status as string;
  const isHalve = video.play_change_signal === "halve";
  if (status === "deleted" || status === "limited" || status === "删稿" || status === "限流") {
    return {
      color: "bg-[#C9604D]",
      label: status === "deleted" || status === "删稿" ? "删稿" : "限流",
    };
  }
  if (isHalve || status === "traffic_boost" || status === "activity_boost" || status === "投流" || status === "活动干预") {
    return {
      color: "bg-[#D99E55]",
      label: isHalve ? "腰斩" : status === "traffic_boost" || status === "投流" ? "投流" : "活动干预",
    };
  }
  if (status === "normal" || status === "正常") {
    return {
      color: "bg-[#6FAA7D]",
      label: "正常",
    };
  }
  if (status === "pending" || status === "未满24h") {
    return {
      color: "bg-[#E5E0D6]",
      label: "未满24h",
    };
  }
  return {
    color: "bg-[#E5E0D6]",
    label: status || "未满24h",
  };
}

export function ContentList({
  videos,
  snapshots,
  feedbackCards,
  reviewReadiness,
  view = "pending",
  hasDeferredData = false,
  isDeferredDataLoading = false,
  onLoadDeferredData,
  onSelectVideoId,
}: ContentListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("interaction");
  const [sortField, setSortField] = useState<SortField>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [thresholds, setThresholds] = useState<VideoReviewThresholds>(DEFAULT_VIDEO_REVIEW_THRESHOLDS);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const hasTriggeredDeferredRef = useRef(false);

  useEffect(() => {
    fetch("/api/admin/settings/thresholds")
      .then((res) => res.json())
      .then((data) => {
        if (data?.thresholds) setThresholds(data.thresholds);
      })
      .catch(() => {});
  }, []);

  // 仅在首次需要时安全触发一次背景全量加载，杜绝循环重刷
  useEffect(() => {
    if (hasDeferredData && onLoadDeferredData && !isDeferredDataLoading && !hasTriggeredDeferredRef.current) {
      hasTriggeredDeferredRef.current = true;
      void onLoadDeferredData();
    }
  }, [hasDeferredData, onLoadDeferredData, isDeferredDataLoading]);

  const snapshotMap = useMemo(() => buildSnapshotMap(snapshots), [snapshots]);

  const queueRows = useMemo(() => {
    return buildReviewQueue({
      videos,
      snapshots: snapshotMap,
      feedbackCards,
      reviewReadiness,
      thresholds,
      sortMode: "priority",
      filterMode: view === "all" ? "all" : "all",
    });
  }, [feedbackCards, reviewReadiness, snapshotMap, thresholds, videos, view]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [sortField]);

  const processedRows = useMemo(() => {
    const rowsWithMetrics = queueRows.map((video) => {
      const snapshot = snapshotMap.get(video.id);
      const playCount = snapshot?.play_count ?? null;
      const followerGain = snapshot?.follower_gain ?? null;
      const likes = snapshot?.likes ?? null;
      const comments = snapshot?.comments ?? null;
      const shares = snapshot?.shares ?? null;
      const favorites = snapshot?.favorites ?? null;
      const totalInteraction =
        likes != null && comments != null && shares != null && favorites != null
          ? likes + comments + shares + favorites
          : null;
      const interactionRate =
        playCount && playCount > 0 && totalInteraction != null
          ? (totalInteraction / playCount) * 100
          : null;
      const publishedTime = new Date(video.published_at ?? video.uploaded_at ?? video.created_at).getTime() || 0;

      return {
        video,
        snapshot,
        publishedTime,
        playCount,
        followerGain,
        likes,
        comments,
        shares,
        favorites,
        interactionRate,
        bounceRate2s: snapshot?.bounce_rate_2s ?? null,
        completionRate5s: snapshot?.completion_rate_5s ?? null,
        avgPlayDuration: snapshot?.avg_play_duration ?? null,
        completionRate: snapshot?.completion_rate ?? null,
      };
    });

    return rowsWithMetrics.sort((a, b) => {
      let valA: number | null = null;
      let valB: number | null = null;

      switch (sortField) {
        case "published_at":
          valA = a.publishedTime;
          valB = b.publishedTime;
          break;
        case "play_count":
          valA = a.playCount;
          valB = b.playCount;
          break;
        case "follower_gain":
          valA = a.followerGain;
          valB = b.followerGain;
          break;
        case "likes":
          valA = a.likes;
          valB = b.likes;
          break;
        case "comments":
          valA = a.comments;
          valB = b.comments;
          break;
        case "shares":
          valA = a.shares;
          valB = b.shares;
          break;
        case "favorites":
          valA = a.favorites;
          valB = b.favorites;
          break;
        case "interaction_rate":
          valA = a.interactionRate;
          valB = b.interactionRate;
          break;
        case "bounce_rate_2s":
          valA = a.bounceRate2s;
          valB = b.bounceRate2s;
          break;
        case "completion_rate_5s":
          valA = a.completionRate5s;
          valB = b.completionRate5s;
          break;
        case "avg_play_duration":
          valA = a.avgPlayDuration;
          valB = b.avgPlayDuration;
          break;
        case "completion_rate":
          valA = a.completionRate;
          valB = b.completionRate;
          break;
        default:
          valA = a.publishedTime;
          valB = b.publishedTime;
      }

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      return sortDir === "desc" ? valB - valA : valA - valB;
    });
  }, [queueRows, snapshotMap, sortField, sortDir]);

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [currentPage, pageSize, processedRows]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-[10px] text-[#E5E0D6] opacity-0 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return (
      <span className="text-[10.5px] font-semibold text-[#1C1917]">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  // 宽屏 (≥1280px) 全展开；窄屏 (<1280px) 按 viewMode 切换
  const interactiveColClass = viewMode === "interaction" ? "" : "hidden xl:table-cell";
  const completionColClass = viewMode === "completion" ? "" : "hidden xl:table-cell";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 窄屏 (<1280px) 视图分段切换器 */}
      <div className="flex xl:hidden items-center justify-end py-0.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode("interaction")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === "interaction"
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
            }`}
          >
            互动数据
          </button>
          <button
            type="button"
            onClick={() => setViewMode("completion")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === "completion"
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
            }`}
          >
            完播数据
          </button>
        </div>
      </div>

      {/* 对比表格容器 */}
      <div
        ref={tableContainerRef}
        className="flex-1 w-full overflow-x-auto rounded-xl border border-[#ECE7DE]"
      >
        <table className="w-full text-left border-collapse table-fixed min-w-[960px] xl:min-w-full">
          {/* 吸顶表头 */}
          <thead className="sticky top-0 z-10 bg-[#FBF9F5]/85 backdrop-blur-md border-b border-[#ECE7DE]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C] select-none">
            <tr>
              <th className="py-2 px-1 text-center w-7 shrink-0 whitespace-nowrap">状态</th>
              <th className="py-2 px-2.5 text-left w-auto min-w-0">视频标题 / 账号</th>
              <th className="py-2 px-2 text-left w-[86px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("published_at")}
                  className="group inline-flex items-center gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>发布时间</span>
                  {renderSortIndicator("published_at")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[64px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("play_count")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>播放量</span>
                  {renderSortIndicator("play_count")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("follower_gain")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>涨粉</span>
                  {renderSortIndicator("follower_gain")}
                </button>
              </th>

              {/* 互动明细与互动率 */}
              <th className={`py-2 px-1.5 text-right w-[52px] shrink-0 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("likes")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>点赞</span>
                  {renderSortIndicator("likes")}
                </button>
              </th>
              <th className={`py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("comments")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>评论</span>
                  {renderSortIndicator("comments")}
                </button>
              </th>
              <th className={`py-2 px-1.5 text-right w-[46px] shrink-0 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("shares")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>分享</span>
                  {renderSortIndicator("shares")}
                </button>
              </th>
              <th className={`py-2 px-1.5 text-right w-[46px] shrink-0 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("favorites")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>收藏</span>
                  {renderSortIndicator("favorites")}
                </button>
              </th>
              <th className={`py-2 px-2 text-right w-[56px] shrink-0 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("interaction_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>互动率</span>
                  {renderSortIndicator("interaction_rate")}
                </button>
              </th>

              {/* 完播指标 */}
              <th className={`py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("bounce_rate_2s")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>2s跳出</span>
                  {renderSortIndicator("bounce_rate_2s")}
                </button>
              </th>
              <th className={`py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate_5s")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>5s完播</span>
                  {renderSortIndicator("completion_rate_5s")}
                </button>
              </th>
              <th className={`py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("avg_play_duration")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>均播</span>
                  {renderSortIndicator("avg_play_duration")}
                </button>
              </th>
              <th className={`py-2 px-2 text-right w-[56px] shrink-0 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>完播</span>
                  {renderSortIndicator("completion_rate")}
                </button>
              </th>

              {/* 行动 */}
              <th className="py-2 px-2 text-center w-[56px] shrink-0 whitespace-nowrap">复盘</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#ECE7DE] text-[12px] text-[#292524]">
            {visibleRows.length === 0 && !isDeferredDataLoading ? (
              <tr>
                <td
                  colSpan={15}
                  className="py-12 px-4 text-center text-[#292524]"
                >
                  {view === "pending" ? (
                    <EmptyState
                      variant="zen"
                      size={80}
                      title="待盘队列尽数清空 · 创作体征平稳"
                      description="当前没有需要紧急归因的异常波动视频，从容收卷。"
                    />
                  ) : (
                    <EmptyState
                      variant="scroll"
                      size={80}
                      title="全量视频资产静候收卷"
                      description="当前周期尚未记录到符合条件的视频资产。"
                    />
                  )}
                </td>
              </tr>
            ) : (
              visibleRows.map((item) => {
                const { video } = item;
                const dot = getStatusDot(video);

                return (
                  <tr
                    key={video.id}
                    onClick={() => onSelectVideoId(video.id)}
                    className="group hover:bg-[#FBF9F5]/80 transition-colors cursor-pointer"
                  >
                    {/* 状态灯 */}
                    <td className="py-2 px-1 text-center shrink-0">
                      <span
                        className={`inline-block size-2 rounded-full ${dot.color} shadow-2xs`}
                        title={`状态：${dot.label}`}
                      />
                    </td>

                    {/* 标题与账号（优先弹性收缩，空间不足时压缩文字，保护右侧数据列） */}
                    <td className="py-2 px-2.5 min-w-0">
                      <div
                        className="flex items-center gap-1.5 min-w-0"
                        title={`${video.video_title || video.content || "未命名视频"}${video.accounts?.name ? ` (@${video.accounts.name})` : ""}`}
                      >
                        <span className="truncate font-normal text-[#292524] group-hover:text-[#1C1917] transition-colors">
                          {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                        </span>
                        {video.accounts?.name ? (
                          <span className="shrink-0 text-[11px] text-[#78716C] font-normal truncate max-w-[75px] 2xl:max-w-[100px]">
                            · {video.accounts.name}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* 发布时间 */}
                    <td className="py-2 px-2 text-left tabular-nums text-[#292524] text-[11.5px] whitespace-nowrap">
                      {formatCompactTime(video.published_at ?? video.uploaded_at ?? video.created_at)}
                    </td>

                    {/* 播放量 */}
                    <td className="py-2 px-2 text-right tabular-nums font-normal text-[#292524] whitespace-nowrap">
                      {formatCount(item.playCount)}
                    </td>

                    {/* 涨粉 */}
                    <td className="py-2 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap">
                      {formatCount(item.followerGain)}
                    </td>

                    {/* 互动明细与互动率 */}
                    <td className={`py-2 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.likes)}
                    </td>
                    <td className={`py-2 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.comments)}
                    </td>
                    <td className={`py-2 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.shares)}
                    </td>
                    <td className={`py-2 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.favorites)}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums font-normal text-[#292524] whitespace-nowrap ${interactiveColClass}`}>
                      {formatPercent(item.interactionRate)}
                    </td>

                    {/* 完播指标 */}
                    <td className={`py-2 px-2 text-right tabular-nums text-[#292524] whitespace-nowrap ${completionColClass}`}>
                      {formatPercent(item.bounceRate2s)}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums text-[#292524] whitespace-nowrap ${completionColClass}`}>
                      {formatPercent(item.completionRate5s)}
                    </td>
                    <td className={`py-2 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap ${completionColClass}`}>
                      {formatDuration(item.avgPlayDuration)}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums text-[#292524] whitespace-nowrap ${completionColClass}`}>
                      {formatPercent(item.completionRate)}
                    </td>

                    {/* 复盘按钮（唯一行动变橙） */}
                    <td className="py-2 px-2 text-center shrink-0 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideoId(video.id);
                        }}
                        className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[11px] font-medium text-[#292524] hover:text-white hover:bg-[#D97757] transition-all active:scale-[0.985] active:duration-75 shadow-2xs cursor-pointer"
                      >
                        复盘 →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {/* 仅在首屏无数据且加载中时展示骨架屏 */}
            {visibleRows.length === 0 && isDeferredDataLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[#ECE7DE] animate-pulse">
                  <td className="py-2 px-2 text-center">
                    <Skeleton className="size-2 rounded-full mx-auto" />
                  </td>
                  <td className="py-2 px-3">
                    <Skeleton className="h-3.5 w-44 rounded" />
                  </td>
                  <td className="py-2 px-2.5 2xl:px-3">
                    <Skeleton className="h-3 w-16 rounded" />
                  </td>
                  <td className="py-2 px-2.5 2xl:px-3 text-right">
                    <Skeleton className="h-3 w-12 rounded ml-auto" />
                  </td>
                  <td className="py-2 px-2 2xl:px-3 text-right">
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${interactiveColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${interactiveColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${interactiveColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${interactiveColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${interactiveColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${completionColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${completionColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${completionColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className={`py-2 px-2 2xl:px-3 text-right ${completionColClass}`}>
                    <Skeleton className="h-3 w-10 rounded ml-auto" />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <Skeleton className="h-5 w-12 rounded mx-auto" />
                  </td>
                </tr>
              ))
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 极客级专业分页底栏（精准绑定当前队列实际数据量） */}
      {processedRows.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={processedRows.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[20, 30, 50, 100]}
        />
      )}
    </div>
  );
}

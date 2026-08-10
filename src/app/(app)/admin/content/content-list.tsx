"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/ui/table-pagination";
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

const DEFAULT_PAGE_SIZE = 30;

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
      color: "bg-zinc-300",
      label: "未满24h",
    };
  }
  return {
    color: "bg-zinc-300",
    label: status || "未满24h",
  };
}

export function ContentList({
  videos,
  snapshots,
  feedbackCards,
  reviewReadiness,
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
    });
  }, [feedbackCards, reviewReadiness, snapshotMap, thresholds, videos]);

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
      return <span className="text-[10px] text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return (
      <span className="text-[10.5px] font-semibold text-zinc-900">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  // 宽屏 (≥1536px) 全展开；窄屏 (<1536px) 按 viewMode 切换
  const interactiveColClass = viewMode === "interaction" ? "" : "hidden 2xl:table-cell";
  const completionColClass = viewMode === "completion" ? "" : "hidden 2xl:table-cell";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 顶部控制栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-zinc-900">今日待盘队列</p>
          <p className="text-[12px] text-zinc-500">
            共 <span className="tabular-nums font-semibold text-zinc-800">{queueRows.length}</span> 条
            <span className="mx-1.5 text-zinc-300">·</span>
            <Link
              href="/admin/videos"
              className="text-[#D97757] hover:text-[#C46A4D] underline-offset-2 transition-colors"
            >
              前往素材库（全量账本）→
            </Link>
          </p>
        </div>

        {/* 窄屏 (<1536px) 视图分段切换器；宽屏 (≥1536px) 自动隐藏并全展开 */}
        <div className="inline-flex 2xl:hidden items-center rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => setViewMode("interaction")}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              viewMode === "interaction"
                ? "bg-white text-zinc-950 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            互动数据
          </button>
          <button
            type="button"
            onClick={() => setViewMode("completion")}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              viewMode === "completion"
                ? "bg-white text-zinc-950 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            完播数据
          </button>
        </div>
      </div>

      {/* 对比表格容器（吃满宽度，标题列弹性伸缩消除右侧留白） */}
      <div
        ref={tableContainerRef}
        className="flex-1 w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-2xs"
      >
        <table className="w-full text-left border-collapse table-auto min-w-full">
          {/* 吸顶表头 */}
          <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur border-b border-zinc-200 text-[12px] font-medium text-zinc-500 select-none">
            <tr>
              <th className="py-2 px-2 text-center w-10 shrink-0 whitespace-nowrap">状态</th>
              <th className="py-2 px-3 text-left w-[220px] 2xl:w-[280px] min-w-[180px]">视频标题 / 账号</th>
              <th className="py-2 px-2.5 2xl:px-3 text-left w-24 2xl:w-28 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("published_at")}
                  className="group inline-flex items-center gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>发布时间</span>
                  {renderSortIndicator("published_at")}
                </button>
              </th>
              <th className="py-2 px-2.5 2xl:px-3 text-right w-20 2xl:w-26 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("play_count")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>播放量</span>
                  {renderSortIndicator("play_count")}
                </button>
              </th>
              <th className="py-2 px-2 2xl:px-3 text-right w-16 2xl:w-22 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("follower_gain")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>涨粉</span>
                  {renderSortIndicator("follower_gain")}
                </button>
              </th>

              {/* 互动明细与互动率 */}
              <th className={`py-2 px-2 2xl:px-3 text-right w-16 2xl:w-22 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("likes")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>点赞</span>
                  {renderSortIndicator("likes")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-16 2xl:w-22 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("comments")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>评论</span>
                  {renderSortIndicator("comments")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-16 2xl:w-22 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("shares")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>分享</span>
                  {renderSortIndicator("shares")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-16 2xl:w-22 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("favorites")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>收藏</span>
                  {renderSortIndicator("favorites")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-18 2xl:w-24 whitespace-nowrap ${interactiveColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("interaction_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>互动率</span>
                  {renderSortIndicator("interaction_rate")}
                </button>
              </th>

              {/* 完播指标 */}
              <th className={`py-2 px-2 2xl:px-3 text-right w-18 2xl:w-24 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("bounce_rate_2s")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>2s跳出</span>
                  {renderSortIndicator("bounce_rate_2s")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-18 2xl:w-24 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate_5s")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>5s完播</span>
                  {renderSortIndicator("completion_rate_5s")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-16 2xl:w-22 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("avg_play_duration")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>均播</span>
                  {renderSortIndicator("avg_play_duration")}
                </button>
              </th>
              <th className={`py-2 px-2 2xl:px-3 text-right w-18 2xl:w-24 whitespace-nowrap ${completionColClass}`}>
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>完播</span>
                  {renderSortIndicator("completion_rate")}
                </button>
              </th>

              <th className="py-2 px-3 text-center w-20 2xl:w-24 shrink-0 whitespace-nowrap">复盘</th>
            </tr>
          </thead>

          {/* 表格内容 */}
          <tbody className="divide-y divide-zinc-100 text-[12px] text-zinc-700">
            {visibleRows.length === 0 && !isDeferredDataLoading ? (
              <tr>
                <td
                  colSpan={15}
                  className="py-12 text-center text-zinc-500"
                >
                  <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 mb-2">
                    <Check className="size-4 text-[#6FAA7D]" />
                  </div>
                  <p className="text-[13px] font-semibold text-zinc-800">今日待复盘已清完</p>
                  <p className="mt-0.5 text-[11.5px] text-zinc-400">当前没有需要紧急复盘的异常视频</p>
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
                    className="group hover:bg-zinc-50/80 transition-colors cursor-pointer"
                  >
                    {/* 状态灯 */}
                    <td className="py-2 px-2 text-center shrink-0">
                      <span
                        className={`inline-block size-2 rounded-full ${dot.color} shadow-2xs`}
                        title={dot.label}
                      />
                    </td>

                    {/* 标题与账号（单行紧凑呈现，仅保留账号名，消除折行） */}
                    <td className="py-2 px-3 w-[220px] 2xl:w-[280px] min-w-[180px]">
                      <div
                        className="flex items-center gap-1.5 min-w-0"
                        title={`${video.video_title || video.content || "未命名视频"}${video.accounts?.name ? ` (@${video.accounts.name})` : ""}`}
                      >
                        <span className="truncate font-medium text-zinc-900 group-hover:text-zinc-950 transition-colors">
                          {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                        </span>
                        {video.accounts?.name ? (
                          <span className="shrink-0 text-[11px] text-zinc-400 font-normal truncate max-w-[80px] 2xl:max-w-[110px]">
                            · {video.accounts.name}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* 发布时间 */}
                    <td className="py-2 px-2.5 2xl:px-3 text-left tabular-nums text-zinc-500 text-[11.5px] whitespace-nowrap">
                      {formatCompactTime(video.published_at ?? video.uploaded_at ?? video.created_at)}
                    </td>

                    {/* 播放量 */}
                    <td className="py-2 px-2.5 2xl:px-3 text-right tabular-nums font-medium text-zinc-800 whitespace-nowrap">
                      {formatCount(item.playCount)}
                    </td>

                    {/* 涨粉 */}
                    <td className="py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap">
                      {formatCount(item.followerGain)}
                    </td>

                    {/* 互动明细与互动率 */}
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.likes)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.comments)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.shares)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${interactiveColClass}`}>
                      {formatCount(item.favorites)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums font-medium text-zinc-800 whitespace-nowrap ${interactiveColClass}`}>
                      {formatPercent(item.interactionRate)}
                    </td>

                    {/* 完播指标 */}
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${completionColClass}`}>
                      {formatPercent(item.bounceRate2s)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${completionColClass}`}>
                      {formatPercent(item.completionRate5s)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${completionColClass}`}>
                      {formatDuration(item.avgPlayDuration)}
                    </td>
                    <td className={`py-2 px-2 2xl:px-3 text-right tabular-nums text-zinc-600 whitespace-nowrap ${completionColClass}`}>
                      {formatPercent(item.completionRate)}
                    </td>

                    {/* 复盘按钮（唯一行动变橙） */}
                    <td className="py-2 px-3 text-center shrink-0 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideoId(video.id);
                        }}
                        className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:text-white hover:bg-[#D97757] transition-all active:scale-95 shadow-2xs"
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
                <tr key={i} className="border-b border-zinc-100 animate-pulse">
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

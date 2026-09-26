"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams } from "next/navigation";
import type { ContentReviewReadiness, VideoMetricsSnapshot } from "@/types";
import { Check } from "lucide-react";
import { VIDEO_REVIEW_RULE_THRESHOLDS } from "@/lib/video-review-thresholds";
import { isRetiredVideoAnomalyStatus, resolveVideoStatusLabel } from "@/lib/video-anomaly";
import { describeImpossibleRatio, isImpossibleRatio, toSortableRatio } from "@/lib/metric-bounds";

import {
  buildReviewQueue,
  buildSnapshotMap,
  type VideoRow,
} from "@/lib/review-queue";
import {
  DEFAULT_CONTENT_LIST_FILTERS,
  filterContentVideos,
  parseContentListFilters,
  writeContentListFilters,
  type ContentListFilterValue,
} from "./content-list-filters";

interface ContentListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: Array<{ id: string; name: string }>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  view?: "all" | "trash";
  canReviewContent?: boolean;
  onSelectVideoId: (id: string | null) => void;
}

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

/** 各列「第一次点表头」应该先看到什么，按指标语义定死，不再一律降序：
 *  - 越高越好的比率/时长（5s 完播、完播、互动率、均播时长）：默认升序 → 最差在前，正是复盘要找的
 *  - 越高越差的比率（2s 跳出）：默认降序 → 最差在前
 *  - 体量类计数与时间（播放量、点赞…、发布时间）：默认降序 → 最大/最新在前（通用预期）
 *  这样同一套 UI 里「降序」不再有时代表最差、有时代表最好。 */
const DEFAULT_SORT_DIR: Record<SortField, "asc" | "desc"> = {
  published_at: "desc",
  play_count: "desc",
  follower_gain: "desc",
  likes: "desc",
  comments: "desc",
  shares: "desc",
  favorites: "desc",
  interaction_rate: "asc",
  bounce_rate_2s: "desc",
  completion_rate_5s: "asc",
  avg_play_duration: "asc",
  completion_rate: "asc",
};

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

/** 比率类指标（完播率 / 2s 跳出 / 互动率）物理上限 100%，下限 0%。
 *  越界说明上游采集或入库有脏数据：显示时照原值打出并打脏值标记（不掩盖问题），
 *  但排序时必须按无效值处理，否则「点表头找最差」会被一条不可能的 4773% 顶到榜首。 */

/**
 * 比率单元格：脏值（越界）标红 + 虚线下划线 + tooltip 说明；
 * 样本不足（播放量低于复盘达标线）时整格降灰，提示该比率是噪音而非信号。
 */
function RatioCell({
  value,
  lowSample = false,
  className = "",
}: {
  value: number | null | undefined;
  lowSample?: boolean;
  className?: string;
}) {
  const dirty = isImpossibleRatio(value);
  const text = formatPercent(value);
  const sampleTitle = lowSample ? "播放量低于复盘达标线，样本不足，该比率仅供参考" : undefined;
  if (dirty) {
    return (
      <span
        className={`text-[#C0685C] font-medium underline decoration-[#C0685C]/60 decoration-dotted underline-offset-2 cursor-help ${className}`}
        title={describeImpossibleRatio()}
      >
        {text}
      </span>
    );
  }
  return (
    <span className={lowSample ? `text-[#A8A29E] ${className}` : className} title={sampleTitle}>
      {text}
    </span>
  );
}

function formatDuration(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}s`;
}

/** 发布时间固定按北京时间（Asia/Shanghai）格式化。
 *  此前用本机时区取值：服务端在 UTC 渲染、浏览器在 +8 重算，同一格文本不一致会触发
 *  React hydration #418；按北京时间渲染同时让全团队看到同一个时间。 */
function formatCompactTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
}

function getStatusDot(video: VideoRow) {
  const status = video.anomaly_status as string;
  const isHalve = video.play_change_signal === "halve";
  // 标签唯一来源：提醒条 tooltip 与本列徽标共用同一映射，避免同一视频两处两个名字
  const label = resolveVideoStatusLabel({
    anomalyStatus: video.anomaly_status,
    playChangeSignal: video.play_change_signal,
  });
  if (status === "deleted" || status === "limited" || status === "删稿" || status === "限流") {
    return {
      color: "bg-[#C9604D]",
      badgeClass: "bg-[#C0685C]/10 text-[#C0685C] border border-[#C0685C]/20",
      label,
    };
  }
  if (isHalve || status === "abnormal" || status === "异常" || isRetiredVideoAnomalyStatus(status)) {
    return {
      color: "bg-[#B98A54]",
      badgeClass: "bg-[#B98A54]/10 text-[#B98A54] border border-[#B98A54]/20",
      label,
    };
  }
  if (status === "normal" || status === "正常") {
    return {
      color: "bg-[#6FAA7D]",
      badgeClass: "bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20",
      label,
    };
  }
  if (status === "pending" || status === "未满24h") {
    return {
      color: "bg-[#A8A29E]",
      badgeClass: "bg-[#F1F1F0] text-[#78716C] border border-[#E2E2DF]",
      label,
    };
  }
  return {
    color: "bg-[#A8A29E]",
    badgeClass: "bg-[#F1F1F0] text-[#78716C] border border-[#E2E2DF]",
    label,
  };
}

export function ContentList({
  videos,
  snapshots,
  profiles,
  reviewReadiness,
  view = "all",
  canReviewContent = true,
  onSelectVideoId,
}: ContentListProps) {
  const searchParams = useSearchParams();
  const [topicStatusFilter, setTopicStatusFilter] = useState<"all" | "in_library" | "removed">("all");
  const [filters, setFilters] = useState<ContentListFilterValue>(() =>
    parseContentListFilters(searchParams),
  );
  const [sortField, setSortField] = useState<SortField>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFiltersFromUrl = () => {
      setFilters(parseContentListFilters(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", syncFiltersFromUrl);
    return () => window.removeEventListener("popstate", syncFiltersFromUrl);
  }, []);

  const accountOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const video of videos) {
      if (video.account_id && video.accounts?.name) byId.set(video.account_id, video.accounts.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [videos]);

  const updateFilter = useCallback((
    key: keyof ContentListFilterValue,
    value: string,
  ) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    setCurrentPage(1);
    const nextParams = writeContentListFilters(new URLSearchParams(window.location.search), nextFilters);
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [filters]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_CONTENT_LIST_FILTERS);
    setCurrentPage(1);
    const nextParams = writeContentListFilters(new URLSearchParams(window.location.search), DEFAULT_CONTENT_LIST_FILTERS);
    window.history.replaceState(null, "", `${window.location.pathname}${nextParams.toString() ? `?${nextParams}` : ""}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const snapshotMap = useMemo(() => buildSnapshotMap(snapshots), [snapshots]);

  const queueRows = useMemo(() => {
    return buildReviewQueue({
      videos,
      snapshots: snapshotMap,
      reviewReadiness,
      thresholds: VIDEO_REVIEW_RULE_THRESHOLDS,
      sortMode: "priority",
    });
  }, [reviewReadiness, snapshotMap, videos]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_SORT_DIR[field]);
    }
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [sortField]);

  const processedRows = useMemo(() => {
    const rowsWithMetrics = filterContentVideos(queueRows, filters).map((video) => {
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
      // 样本不足：播放量低于复盘达标线（与异常判定规则的 play_count 同源）时，比率类指标是噪音
      const lowSample = playCount != null && playCount < VIDEO_REVIEW_RULE_THRESHOLDS.play_count;

      return {
        video,
        snapshot,
        publishedTime,
        lowSample,
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

    const filteredByTopic = rowsWithMetrics.filter((item) => {
      if (topicStatusFilter === "all") return true;
      const status = (item.video as { topic_library_status?: string })
        .topic_library_status;
      if (topicStatusFilter === "in_library") {
        return status === "in_library";
      }
      if (topicStatusFilter === "removed") {
        return status === "removed";
      }
      return true;
    });

    return filteredByTopic.sort((a, b) => {
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
          valA = toSortableRatio(a.interactionRate);
          valB = toSortableRatio(b.interactionRate);
          break;
        case "bounce_rate_2s":
          valA = toSortableRatio(a.bounceRate2s);
          valB = toSortableRatio(b.bounceRate2s);
          break;
        case "completion_rate_5s":
          valA = toSortableRatio(a.completionRate5s);
          valB = toSortableRatio(b.completionRate5s);
          break;
        case "avg_play_duration":
          valA = a.avgPlayDuration;
          valB = b.avgPlayDuration;
          break;
        case "completion_rate":
          valA = toSortableRatio(a.completionRate);
          valB = toSortableRatio(b.completionRate);
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
  }, [filters, queueRows, snapshotMap, topicStatusFilter, sortField, sortDir]);

  const hasActiveFilters = Object.values(filters).some(Boolean) || topicStatusFilter !== "all";
  const emptyTitle = hasActiveFilters
    ? "当前筛选条件下没有视频"
    : view === "trash"
      ? "回收站暂无视频"
      : "暂无视频";
  const emptyDescription = hasActiveFilters
    ? "请调整筛选条件，或点击“重置”查看全部视频"
    : view === "trash"
      ? "移入回收站的视频会显示在这里"
      : "当前范围内还没有可查看的视频";

  const profileLabel = filters.userId
    ? profiles.find((profile) => profile.id === filters.userId)?.name ?? "全部负责人"
    : "全部负责人";
  const accountLabel = filters.accountId
    ? accountOptions.find((account) => account.id === filters.accountId)?.name ?? "全部账号"
    : "全部账号";

  // 数据范围变化后 currentPage 可能越界：分页控件内部会把页码夹到最后一页，
  // 但切片若仍用原始页码就会「分页器显示第 1 页、表格却是空」；统一按有效页码切片与传值
  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const visibleRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [safeCurrentPage, pageSize, processedRows]);

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
      return <span className="text-[10px] text-[#E2E2DF] opacity-0 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return (
      <span className="text-[12px] font-medium text-[#1C1917]">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 顶部工具栏：入库状态筛选器 */}
      <div className="flex flex-wrap items-center gap-2 py-0.5">
        {canReviewContent && (
        <div className="flex items-center gap-1 bg-[#F1F1F0]/70 p-0.5 rounded-lg text-xs">
          <span className="text-[12px] text-[#78716C] px-2 font-normal">选题库状态:</span>
          <button
            type="button"
            onClick={() => {
              setTopicStatusFilter("all");
              setCurrentPage(1);
            }}
            className={`px-2.5 h-7 rounded-md text-xs font-medium transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
              topicStatusFilter === "all"
                ? "bg-white text-[#1C1917] font-semibold shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            全部作品
          </button>
          <button
            type="button"
            onClick={() => {
              setTopicStatusFilter("in_library");
              setCurrentPage(1);
            }}
            className={`px-2.5 h-7 rounded-md text-xs font-medium transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
              topicStatusFilter === "in_library"
                ? "bg-white text-[#6FAA7D] font-semibold shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            已入选题库
          </button>
          <button
            type="button"
            onClick={() => {
              setTopicStatusFilter("removed");
              setCurrentPage(1);
            }}
            className={`px-2.5 h-7 rounded-md text-xs font-medium transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
              topicStatusFilter === "removed"
                ? "bg-white text-[#C9604D] font-semibold shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            已移出
          </button>
        </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={filters.userId || "all"} onValueChange={(value) => updateFilter("userId", value === "all" ? "" : value ?? "")}>
            <SelectTrigger className="h-7 w-28 rounded-lg border border-[#E2E2DF] bg-white text-[12px] text-[#292524] shadow-2xs">
              <SelectValue>{profileLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部负责人</SelectItem>
              {profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.accountId || "all"} onValueChange={(value) => updateFilter("accountId", value === "all" ? "" : value ?? "")}>
            <SelectTrigger className="h-7 w-28 rounded-lg border border-[#E2E2DF] bg-white text-[12px] text-[#292524] shadow-2xs">
              <SelectValue>{accountLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {accountOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} aria-label="开始日期" className="h-7 w-32 rounded-lg border-[#E2E2DF] bg-white px-2 text-[12px] shadow-2xs" />
          <Input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} aria-label="结束日期" className="h-7 w-32 rounded-lg border-[#E2E2DF] bg-white px-2 text-[12px] shadow-2xs" />
          <Input value={filters.keyword} onChange={(event) => updateFilter("keyword", event.target.value)} placeholder="搜索标题/文案" aria-label="搜索标题或文案" className="h-7 w-36 rounded-lg border-[#E2E2DF] bg-white px-2.5 text-[12px] shadow-2xs" />
          <button type="button" onClick={handleResetFilters} className="h-7 rounded-lg px-2.5 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#292524] cursor-pointer">
            重置
          </button>
        </div>

      </div>

      {/* 对比表格容器 */}
      <div
        ref={tableContainerRef}
        className="flex-1 w-full overflow-x-auto rounded-xl bg-white shadow-card-ring"
      >
        <table className="w-full text-left border-collapse table-fixed min-w-[960px] xl:min-w-full">
          {/* 吸顶表头 */}
          <thead className="sticky top-0 z-10 bg-[#FCFCFB]/85 backdrop-blur-md border-b border-[#E2E2DF]/60 text-[12px] font-medium uppercase tracking-wider text-[#78716C] select-none">
            <tr>
              <th className="py-2 px-1 text-center w-[68px] shrink-0 whitespace-nowrap">状态</th>
              <th className="py-2 px-2.5 text-left w-auto min-w-0">视频标题 / 账号</th>
              <th className="py-2 px-2 text-left w-[86px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("published_at")}
                  className="group inline-flex items-center gap-1 font-medium text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>发布时间</span>
                  {renderSortIndicator("published_at")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[64px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("play_count")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-medium text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>播放量</span>
                  {renderSortIndicator("play_count")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("follower_gain")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-medium text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>涨粉</span>
                  {renderSortIndicator("follower_gain")}
                </button>
              </th>

              {/* 互动明细与互动率 */}
              <th className="py-2 px-1.5 text-right w-[52px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("likes")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>点赞</span>
                  {renderSortIndicator("likes")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("comments")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>评论</span>
                  {renderSortIndicator("comments")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[46px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("shares")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>分享</span>
                  {renderSortIndicator("shares")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[46px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("favorites")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>收藏</span>
                  {renderSortIndicator("favorites")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap pl-3">
                <button
                  type="button"
                  onClick={() => handleSort("interaction_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>互动率</span>
                  {renderSortIndicator("interaction_rate")}
                </button>
              </th>

              {/* 完播指标 - 留出气口拉开组间间距 */}
              <th className="py-2 px-2 text-right w-[60px] shrink-0 whitespace-nowrap pl-3">
                <button
                  type="button"
                  onClick={() => handleSort("bounce_rate_2s")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>2s跳出</span>
                  {renderSortIndicator("bounce_rate_2s")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate_5s")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>5s完播</span>
                  {renderSortIndicator("completion_rate_5s")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("avg_play_duration")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>均播</span>
                  {renderSortIndicator("avg_play_duration")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[56px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
                >
                  <span>完播</span>
                  {renderSortIndicator("completion_rate")}
                </button>
              </th>

              {/* 行动 */}
              <th className="py-2 px-2 text-center w-[56px] shrink-0 whitespace-nowrap">查看</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E2E2DF] text-[13px] text-[#292524]">
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={15}
                  className="py-12 text-center text-[#292524]"
                >
                  <>
                    <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-[#F1F1F0] text-[#292524] mb-2">
                      <Check className="size-4 text-[#6FAA7D]" />
                    </div>
                    <p className="text-[14px] font-medium text-[#292524]">{emptyTitle}</p>
                    <p className="mt-0.5 text-[13px] text-[#78716C]">{emptyDescription}</p>
                  </>
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
                    className="group hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer"
                  >
                    {/* 状态徽标（降饱和微标签，消灭悬停猜谜） */}
                    <td className="py-2 px-1 text-center shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] font-medium ${dot.badgeClass}`}
                        title={`状态：${dot.label}`}
                      >
                        <span className={`size-1.5 rounded-full ${dot.color} shrink-0`} />
                        <span>{dot.label}</span>
                      </span>
                    </td>

                    {/* 标题与账号（优先弹性收缩，空间不足时压缩文字，保护右侧数据列） */}
                    <td className="py-2.5 px-2.5 min-w-0">
                      <div
                        className="flex items-center gap-1.5 min-w-0"
                        title={`${video.video_title || video.content || "未命名视频"}${video.accounts?.name ? ` (@${video.accounts.name})` : ""}`}
                      >
                        <span className="truncate font-normal text-[#292524] group-hover:text-[#1C1917] transition-colors">
                          {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                        </span>
                        {video.accounts?.name ? (
                          <span className="shrink-0 text-[12px] text-[#78716C] font-normal truncate max-w-[75px] 2xl:max-w-[100px]">
                            · {video.accounts.name}
                          </span>
                        ) : null}

                        {/* 选题库入库状态徽章（由后端明确字段提供） */}
                        {canReviewContent && (() => {
                          const status = (
                            video as { topic_library_status?: string }
                          ).topic_library_status;
                          if (status === "removed") {
                            return (
                              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#F1F1F0] text-[#78716C] border border-[#E2E2DF]">
                                已移出
                              </span>
                            );
                          }
                          if (status === "in_library") {
                            return (
                              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#6FAA7D]/10 text-[#6FAA7D] border border-[#6FAA7D]/20">
                                已入选题库
                              </span>
                            );
                          }
                          return null;
                        })()}

                      </div>
                    </td>

                    {/* 发布时间 */}
                    <td className="py-2.5 px-2 text-left tabular-nums text-[#292524] text-[12px] whitespace-nowrap">
                      {formatCompactTime(video.published_at ?? video.uploaded_at ?? video.created_at)}
                    </td>

                    {/* 播放量 */}
                    <td className="py-2.5 px-2 text-right tabular-nums font-normal text-[#292524] whitespace-nowrap">
                      {formatCount(item.playCount)}
                    </td>

                    {/* 涨粉 */}
                    <td className="py-2.5 px-1.5 text-right tabular-nums text-[#292524] whitespace-nowrap">
                      {formatCount(item.followerGain)}
                    </td>

                    {/* 互动明细与互动率 */}
                    <td className="py-2.5 px-1.5 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                      {formatCount(item.likes)}
                    </td>
                    <td className="py-2.5 px-1.5 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                      {formatCount(item.comments)}
                    </td>
                    <td className="py-2.5 px-1.5 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                      {formatCount(item.shares)}
                    </td>
                    <td className="py-2.5 px-1.5 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                      {formatCount(item.favorites)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-normal text-[#78716C] whitespace-nowrap pl-3">
                      <RatioCell value={item.interactionRate} lowSample={item.lowSample} />
                    </td>

                    {/* 完播指标 - 留出气口 */}
                    <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap pl-3">
                      <RatioCell value={item.bounceRate2s} lowSample={item.lowSample} />
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                      <RatioCell value={item.completionRate5s} lowSample={item.lowSample} />
                    </td>
                    <td className="py-2 px-1.5 text-right tabular-nums text-[#78716C] whitespace-nowrap" title={item.lowSample ? "播放量低于复盘达标线，均播时长样本不足" : undefined}>
                      <span className={item.lowSample ? "text-[#A8A29E]" : undefined}>
                        {formatDuration(item.avgPlayDuration)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                      <RatioCell value={item.completionRate} lowSample={item.lowSample} />
                    </td>

                    {/* 查看按钮（唯一行动变橙） */}
                    <td className="py-2 px-2 text-center shrink-0 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideoId(video.id);
                        }}
                        className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[12px] font-medium text-[#292524] hover:text-white hover:bg-[#D97757] transition-all active:scale-[0.99] active:duration-120 shadow-2xs cursor-pointer"
                      >
                        查看 →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

          </tbody>
        </table>
      </div>

      {/* 极客级专业分页底栏（精准绑定当前队列实际数据量） */}
      {processedRows.length > 0 && (
        <TablePagination
          currentPage={safeCurrentPage}
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

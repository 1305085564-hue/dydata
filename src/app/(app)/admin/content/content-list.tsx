"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterBar } from "@/components/ui/filter-bar";
import { useSearchParams } from "next/navigation";
import type { ContentReviewReadiness, VideoMetricsSnapshot } from "@/types";
import { EmptyState } from "@/components/ui/empty-state";
import { VIDEO_REVIEW_RULE_THRESHOLDS } from "@/lib/video-review-thresholds";
import { isRetiredVideoAnomalyStatus, resolveVideoStatusLabel } from "@/lib/video-anomaly";
import { describeImpossibleRatio, isImpossibleRatio, toSortableRatio } from "@/lib/metric-bounds";
import {
  getContentQualityStatusText,
  getContentQualityStatusShortText,
  type ContentQualityGradeFilter,
  type WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";
import {
  BREAKOUT_GRADE_TEXT_CLASS,
  type BreakoutGrade,
} from "@/lib/breakout-rating";

import {
  buildReviewQueue,
  buildSnapshotMap,
  type VideoRow,
} from "@/lib/review-queue";
import {
  CUSTOM_PLAY_BUCKET_KEY,
  DEFAULT_CONTENT_LIST_FILTERS,
  PLAY_BUCKETS,
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
  contentQualityByVideoId?: Record<string, WorkContentQuality>;
  view?: "all" | "trash";
  canReviewContent?: boolean;
  onSelectVideoId: (id: string | null) => void;
}

type SortField =
  | "published_at"
  | "overall_grade"
  | "core_metric"
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
 *  - 越高越好的比率/时长（5s 完播、完播、互动率、均播时长、核心指标）：默认升序 → 最差在前，正是复盘要找的
 *  - 越高越差的比率（2s 跳出）：默认降序 → 最差在前
 *  - 体量类计数与时间（播放量、点赞…、发布时间、综合评级）：默认降序 → 最大/最新/最优秀在前（通用预期）
 *  这样同一套 UI 里「降序」不再有时代表最差、有时代表最好。 */
const DEFAULT_SORT_DIR: Record<SortField, "asc" | "desc"> = {
  published_at: "desc",
  overall_grade: "desc",
  core_metric: "asc",
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
        className={`text-status-danger font-normal underline decoration-status-danger/60 decoration-dotted underline-offset-2 cursor-help ${className}`}
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
      variant: "danger" as const,
      label,
    };
  }
  if (isHalve || status === "abnormal" || status === "异常" || isRetiredVideoAnomalyStatus(status)) {
    return {
      variant: "warning" as const,
      label,
    };
  }
  if (status === "normal" || status === "正常") {
    return {
      variant: "success" as const,
      label,
    };
  }
  if (status === "pending" || status === "未满24h") {
    return {
      variant: "neutral" as const,
      label,
    };
  }
  return {
    variant: "neutral" as const,
    label,
  };
}

export function ContentList({
  videos,
  snapshots,
  profiles,
  reviewReadiness,
  contentQualityByVideoId,
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

  /** 流量档位需要一次改多个字段（选档时清掉自定义区间、填区间时锁到 custom），
   *  单键 updateFilter 不够用；沿用同一份 URL 同步与滚动复位，避免两个入口行为漂移。 */
  const applyFilterPatch = useCallback((patch: Partial<ContentListFilterValue>) => {
    const nextFilters = { ...filters, ...patch };
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

  /** 流量筛选按 video.id 查 24h 播放量；一次性投影出纯数字表，
   *  避免把 VideoMetricsSnapshot 结构泄漏进 filterContentVideos 这个纯函数。 */
  const playCountById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const [id, snapshot] of snapshotMap) map.set(id, snapshot?.play_count ?? null);
    return map;
  }, [snapshotMap]);

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
    const rowsWithMetrics = filterContentVideos(queueRows, filters, playCountById, contentQualityByVideoId).map((video) => {
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

      const quality = contentQualityByVideoId?.[video.id] ?? null;
      const isDryGoods = quality?.topicKind === "dry_goods" || quality?.coreMetric === "favoriteRate";
      const coreMetricRate = isDryGoods
        ? (playCount && playCount > 0 && favorites != null ? (favorites / playCount) * 100 : null)
        : (playCount && playCount > 0 && likes != null ? (likes / playCount) * 100 : null);
      const coreMetricTopicText = isDryGoods
        ? "干货·收藏"
        : quality?.topicKind === "review"
          ? "复盘·点赞"
          : null;

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
        quality,
        coreMetricRate,
        coreMetricTopicText,
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
        case "overall_grade": {
          const rank = (g: BreakoutGrade | null | undefined) => {
            if (g === "优") return 4;
            if (g === "良") return 3;
            if (g === "普") return 2;
            if (g === "劣") return 1;
            return 0;
          };
          valA = rank(a.quality?.overallGrade);
          valB = rank(b.quality?.overallGrade);
          break;
        }
        case "core_metric":
          valA = toSortableRatio(a.coreMetricRate);
          valB = toSortableRatio(b.coreMetricRate);
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
  }, [filters, queueRows, snapshotMap, playCountById, contentQualityByVideoId, topicStatusFilter, sortField, sortDir]);

  const hasActiveFilters =
    Object.entries(filters).some(([k, v]) =>
      k === "qualityGrade" ? v !== "all" : Boolean(v),
    ) || topicStatusFilter !== "all";
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

  const playLabel = (() => {
    if (!filters.playBucket) return "全部流量";
    if (filters.playBucket === CUSTOM_PLAY_BUCKET_KEY) {
      const { playMin, playMax } = filters;
      if (playMin && playMax) return `${playMin}-${playMax}`;
      if (playMin) return `≥${playMin}`;
      if (playMax) return `<${playMax}`;
      return "自定义区间";
    }
    return PLAY_BUCKETS.find((bucket) => bucket.key === filters.playBucket)?.label ?? "全部流量";
  })();

  const gradeLabel = (() => {
    switch (filters.qualityGrade) {
      case "excellent":
        return "综合优";
      case "good":
        return "综合良";
      case "fair":
        return "综合普";
      case "poor":
        return "综合劣";
      case "unrated":
        return "未评级";
      default:
        return "全部评级";
    }
  })();

  // 选「全部流量」清 min/max；选预设档位也清 min/max（预设与自定义互斥）；
  // 选「自定义」保留用户已经填过的边界，避免来回切换丢数据。
  // 新 Next.js Select 的 onValueChange value 可能为 null（清空/取消选择），走「全部」分支。
  const handlePlayBucketChange = useCallback((value: string | null) => {
    if (!value || value === "all") applyFilterPatch({ playBucket: "", playMin: "", playMax: "" });
    else if (value === CUSTOM_PLAY_BUCKET_KEY) applyFilterPatch({ playBucket: CUSTOM_PLAY_BUCKET_KEY });
    else applyFilterPatch({ playBucket: value, playMin: "", playMax: "" });
  }, [applyFilterPatch]);

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
      return <span className="text-[12px] text-[#E2E2DF] opacity-0 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return (
      <span className="text-[12px] font-normal text-[#141413]">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 顶部工具栏：入库状态筛选器 */}
      <FilterBar className="py-0.5">
        {canReviewContent && (
        <div className="flex items-center gap-1 bg-[#F1F1F0]/70 p-0.5 rounded-xl text-[12px]">
          <span className="text-[12px] text-[#78716C] px-2 font-normal">选题库状态:</span>
          <button
            type="button"
            onClick={() => {
              setTopicStatusFilter("all");
              setCurrentPage(1);
            }}
            className={`px-2.5 h-7 rounded-md text-[12px] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
              topicStatusFilter === "all"
                ? "bg-white text-[#141413] font-medium shadow-input"
                : "text-[#78716C] hover:text-[#141413]"
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
            className={`px-2.5 h-7 rounded-md text-[12px] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
              topicStatusFilter === "in_library"
                ? "bg-white text-status-success font-medium shadow-input"
                : "text-[#78716C] hover:text-[#141413]"
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
            className={`px-2.5 h-7 rounded-md text-[12px] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
              topicStatusFilter === "removed"
                ? "bg-white text-status-danger font-medium shadow-input"
                : "text-[#78716C] hover:text-[#141413]"
            }`}
          >
            已移出
          </button>
        </div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <Select value={filters.userId || "all"} onValueChange={(value) => updateFilter("userId", value === "all" ? "" : value ?? "")}>
            <SelectTrigger className="h-7 w-28 rounded-md border border-[#E2E2DF] bg-white text-[12px] text-[#1F1E1D] shadow-input">
              <SelectValue>{profileLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部负责人</SelectItem>
              {profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.accountId || "all"} onValueChange={(value) => updateFilter("accountId", value === "all" ? "" : value ?? "")}>
            <SelectTrigger className="h-7 w-28 rounded-md border border-[#E2E2DF] bg-white text-[12px] text-[#1F1E1D] shadow-input">
              <SelectValue>{accountLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {accountOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.playBucket || "all"} onValueChange={handlePlayBucketChange}>
            <SelectTrigger className="h-7 w-28 rounded-md border border-[#E2E2DF] bg-white text-[12px] text-[#1F1E1D] shadow-input" aria-label="流量筛选">
              <SelectValue>{playLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部流量</SelectItem>
              {PLAY_BUCKETS.map((bucket) => (
                <SelectItem key={bucket.key} value={bucket.key}>{bucket.label}</SelectItem>
              ))}
              <SelectItem value={CUSTOM_PLAY_BUCKET_KEY}>自定义区间…</SelectItem>
            </SelectContent>
          </Select>
          {filters.playBucket === CUSTOM_PLAY_BUCKET_KEY && (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.playMin}
                onChange={(event) => updateFilter("playMin", event.target.value)}
                placeholder="最小"
                aria-label="播放量最小值"
                className="h-7 w-20 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
              />
              <span className="text-[12px] text-[#A8A29E]">-</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.playMax}
                onChange={(event) => updateFilter("playMax", event.target.value)}
                placeholder="最大"
                aria-label="播放量最大值"
                className="h-7 w-20 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
              />
            </div>
          )}

          <Select
            value={filters.qualityGrade || "all"}
            onValueChange={(value) => updateFilter("qualityGrade", value === "all" ? "all" : (value as ContentQualityGradeFilter) ?? "all")}
          >
            <SelectTrigger className="h-7 w-28 rounded-md border border-[#E2E2DF] bg-white text-[12px] text-[#1F1E1D] shadow-input" aria-label="评级筛选">
              <SelectValue>{gradeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部评级</SelectItem>
              <SelectItem value="excellent">综合优</SelectItem>
              <SelectItem value="good">综合良</SelectItem>
              <SelectItem value="fair">综合普</SelectItem>
              <SelectItem value="poor">综合劣</SelectItem>
              <SelectItem value="unrated">未评级</SelectItem>
            </SelectContent>
          </Select>

          <Input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} aria-label="开始日期" className="h-7 w-32 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input" />
          <Input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} aria-label="结束日期" className="h-7 w-32 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input" />
          <Input value={filters.keyword} onChange={(event) => updateFilter("keyword", event.target.value)} placeholder="搜索标题/文案" aria-label="搜索标题或文案" className="h-7 w-36 rounded-md border-[#E2E2DF] bg-white px-2.5 text-[12px] shadow-input" />
          <button type="button" onClick={handleResetFilters} className="h-7 rounded-md px-2.5 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D] cursor-pointer">
            重置
          </button>
        </div>

      </FilterBar>

      {/* 对比表格容器 */}
      <Card
        ref={tableContainerRef}
        className="flex-1 w-full overflow-x-auto p-0 gap-0"
      >
        <table className="w-full text-left border-collapse table-fixed min-w-[960px] xl:min-w-full">
          {/* 吸顶表头 */}
          <thead className="sticky top-0 z-10 bg-[#FCFCFB]/85 backdrop-blur-md border-b border-[#E2E2DF]/60 text-[12px] font-normal uppercase tracking-wider text-[#78716C] select-none">
            <tr>
              <th className="py-2 px-1 text-center w-[68px] shrink-0 whitespace-nowrap">状态</th>
              <th className="py-2 px-2.5 text-left w-auto min-w-0">视频标题 / 账号</th>
              <th className="py-2 px-2 text-center w-[76px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("overall_grade")}
                  className="group inline-flex items-center justify-center w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
                >
                  <span>综合评级</span>
                  {renderSortIndicator("overall_grade")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[86px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("core_metric")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>核心指标</span>
                  {renderSortIndicator("core_metric")}
                </button>
              </th>
              <th className="py-2 px-2 text-left w-[86px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("published_at")}
                  className="group inline-flex items-center gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
                >
                  <span>发布时间</span>
                  {renderSortIndicator("published_at")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[64px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("play_count")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
                >
                  <span>播放量</span>
                  {renderSortIndicator("play_count")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("follower_gain")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#141413] transition-colors cursor-pointer"
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
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>点赞</span>
                  {renderSortIndicator("likes")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("comments")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>评论</span>
                  {renderSortIndicator("comments")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[46px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("shares")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>分享</span>
                  {renderSortIndicator("shares")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[46px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("favorites")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>收藏</span>
                  {renderSortIndicator("favorites")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap pl-3">
                <button
                  type="button"
                  onClick={() => handleSort("interaction_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
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
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>2s跳出</span>
                  {renderSortIndicator("bounce_rate_2s")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[58px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate_5s")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>5s完播</span>
                  {renderSortIndicator("completion_rate_5s")}
                </button>
              </th>
              <th className="py-2 px-1.5 text-right w-[48px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("avg_play_duration")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>均播</span>
                  {renderSortIndicator("avg_play_duration")}
                </button>
              </th>
              <th className="py-2 px-2 text-right w-[56px] shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("completion_rate")}
                  className="group inline-flex items-center justify-end w-full gap-1 font-normal text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
                >
                  <span>完播</span>
                  {renderSortIndicator("completion_rate")}
                </button>
              </th>

              {/* 行动 */}
              <th className="py-2 px-2 text-center w-[56px] shrink-0 whitespace-nowrap">查看</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E2E2DF] text-[13px] text-[#1F1E1D]">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={17} className="py-8 text-[#1F1E1D]">
                  <EmptyState
                    variant="compact"
                    title={emptyTitle}
                    description={emptyDescription}
                  />
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
                      <Badge variant={dot.variant} title={`状态：${dot.label}`}>
                        {dot.label}
                      </Badge>
                    </td>

                    {/* 标题与账号（优先弹性收缩，空间不足时压缩文字，保护右侧数据列） */}
                    <td className="py-2.5 px-2.5 min-w-0">
                      <div
                        className="flex items-center gap-1 min-w-0"
                        title={`${video.video_title || video.content || "未命名视频"}${video.accounts?.name ? ` (@${video.accounts.name})` : ""}`}
                      >
                        <span className="truncate text-[13px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors">
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
                              <Badge variant="outline" className="shrink-0">
                                已移出
                              </Badge>
                            );
                          }
                          if (status === "in_library") {
                            return (
                              <Badge variant="success" className="shrink-0">
                                已入选题库
                              </Badge>
                            );
                          }
                          return null;
                        })()}

                      </div>
                    </td>

                    {/* 综合评级 */}
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      {item.quality?.overallGrade ? (
                        <span
                          className={`tabular-nums font-normal ${BREAKOUT_GRADE_TEXT_CLASS[item.quality.overallGrade]}`}
                          title={item.quality.contentAchievement != null ? `内容达成率 ${Math.round(item.quality.contentAchievement)}%` : undefined}
                        >
                          综合{item.quality.overallGrade}
                        </span>
                      ) : (
                        <span
                          className="text-[12px] text-[#A8A29E]"
                          title={getContentQualityStatusText(item.quality?.status ?? "pending_snapshot")}
                        >
                          {getContentQualityStatusShortText(item.quality?.status ?? "pending_snapshot")}
                        </span>
                      )}
                    </td>

                    {/* 核心指标 */}
                    <td className="py-2.5 px-2 text-right whitespace-nowrap tabular-nums">
                      {item.quality?.status === "rated" && item.coreMetricTopicText ? (
                        <div>
                          <span className="text-[13px] font-normal text-[#1F1E1D]">
                            {formatPercent(item.coreMetricRate)}
                          </span>
                          <span className="block text-[12px] text-[#78716C] font-normal">
                            {item.coreMetricTopicText}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#A8A29E]">—</span>
                      )}
                    </td>

                    {/* 发布时间 */}
                    <td className="py-2.5 px-2 text-left tabular-nums text-[#1F1E1D] text-[12px] whitespace-nowrap">
                      {formatCompactTime(video.published_at ?? video.uploaded_at ?? video.created_at)}
                    </td>

                    {/* 播放量 */}
                    <td className="py-2.5 px-2 text-right tabular-nums font-normal text-[#1F1E1D] whitespace-nowrap">
                      {formatCount(item.playCount)}
                    </td>

                    {/* 涨粉 */}
                    <td className="py-2.5 px-1.5 text-right tabular-nums text-[#1F1E1D] whitespace-nowrap">
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
                        className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[12px] font-normal text-[#1F1E1D] hover:text-[#D97757] hover:bg-[#D97757]/10 transition-all active:scale-[0.99] active:duration-120 shadow-input cursor-pointer"
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
      </Card>

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

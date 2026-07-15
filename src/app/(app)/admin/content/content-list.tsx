"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getShanghaiDateString } from "@/lib/remind-submission";
import { ContentFilters, type ContentFilterValue } from "./content-filters";
import { ContentDetailDialog } from "./content-detail-dialog";
import type { ContentFeedbackCardDetail, ContentFeedbackCardView, ContentReviewReadiness, Profile, Video, VideoMetricsSnapshot } from "@/types";
import { ChevronDown, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

interface ContentListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  feedbackCards: Record<string, ContentFeedbackCardView>;
  reviewReadiness: Record<string, ContentReviewReadiness>;
  totalCount?: number;
  hasDeferredData?: boolean;
  isDeferredDataLoading?: boolean;
  onLoadDeferredData?: () => Promise<void>;
  onFeedbackCardChanged?: (videoId: string, card: ContentFeedbackCardView) => void;
  onFeedbackCardsChanged?: (cards: Record<string, ContentFeedbackCardView>) => void;
  selectedVideoId: string | null;
  onSelectVideoId: (id: string | null) => void;
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  normal: "border-[#6FAA7D]/15 bg-[#6FAA7D]/0.04 text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/15 bg-[#C9604D]/0.04 text-[#C9604D]",
  正常: "border-[#6FAA7D]/15 bg-[#6FAA7D]/0.04 text-[#6FAA7D]",
  删稿: "border-[#C9604D]/15 bg-[#C9604D]/0.04 text-[#C9604D]",
  限流: "border-[#C9604D]/15 bg-[#C9604D]/0.04 text-[#C9604D]",
  投流: "border-[#D99E55]/15 bg-[#D99E55]/0.04 text-[#D99E55]",
  活动干预: "border-[#D99E55]/15 bg-[#D99E55]/0.04 text-[#D99E55]",
  "未满24h": "border-stone-200 bg-stone-100/50 text-stone-500",
};

const PAGE_SIZE = 30;

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatRate(value: number | string | null | undefined) {
  if (value == null) return "-";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "-";
  return n.toFixed(1) + "%";
}

// 配色：surge 暴涨 = 琥珀棕 / halve 腰斩 = 绿色（股市惯例：红涨绿跌）
function PlayCountWithSignal({ video, playCount }: { video: VideoRow; playCount: number | null | undefined }) {
  const hasSignal = video.play_change_signal && video.play_count_change_pct != null;
  if (!hasSignal) {
    return <span>{playCount != null ? formatNumber(playCount) : "-"}</span>;
  }
  const isUp = video.play_change_signal === "surge";
  const color = isUp ? "#B42318" : "#166534";
  const pct = isUp ? video.play_count_change_pct! : Math.abs(video.play_count_change_pct!);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="cursor-default">
          <span className="font-medium" style={{ color }}>
            {playCount != null ? formatNumber(playCount) : "-"}
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-[13px] font-medium">
          <span style={{ color }}>{isUp ? "较上条暴涨" : "较上条腰斩"} {formatRate(pct)}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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

function toShanghaiDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return getShanghaiDateString(date);
}

function getVideoUploadDateKey(video: VideoRow) {
  return toShanghaiDateKey(video.uploaded_at ?? video.created_at);
}

function getVideoUploadMonthKey(video: VideoRow) {
  return getVideoUploadDateKey(video).slice(0, 7);
}

function getSnapshotPlay(snapshot: VideoMetricsSnapshot | undefined) {
  return snapshot?.play_count ?? 0;
}

function getVideoUploadTimestamp(video: VideoRow) {
  const raw = video.uploaded_at ?? video.created_at;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function isVideoUploadedToday(video: VideoRow) {
  return getVideoUploadDateKey(video) === getShanghaiDateString();
}

/* ------------------------------------------------------------------ */
/*  Timeline helpers                                                   */
/* ------------------------------------------------------------------ */

interface MonthGroup {
  label: string;
  count: number;
  firstIndex: number;
}

function buildTimeline(rows: VideoRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let current: MonthGroup | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const month = getVideoUploadMonthKey(row);
    const label = month.replace("-", "年") + "月";

    if (!current || current.label !== label) {
      current = { label, count: 0, firstIndex: i };
      groups.push(current);
    }
    current.count++;
  }

  return groups;
}

/* ------------------------------------------------------------------ */
/*  MiniTimeline component                                             */
/* ------------------------------------------------------------------ */

function MiniTimeline({
  groups,
  total,
  currentIndex,
  onSeek,
}: {
  groups: MonthGroup[];
  total: number;
  currentIndex: number;
  onSeek: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);

  const progress = total > 0 ? (currentIndex / (total - 1)) * 100 : 0;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientY - rect.top) / rect.height;
    const targetIndex = Math.min(total - 1, Math.max(0, Math.floor(ratio * total)));
    onSeek(targetIndex);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientY - rect.top) / rect.height;
    const idx = Math.min(total - 1, Math.max(0, Math.floor(ratio * total)));
    const group = groups.find((g) => idx >= g.firstIndex && idx < g.firstIndex + g.count);
    setTooltip({
      label: group?.label ?? "",
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setTooltip(null);
      }}
    >
      {/* Track */}
      <div
        ref={trackRef}
        className="relative w-[3px] rounded-full bg-stone-200 cursor-pointer"
        style={{ height: 320 }}
        onClick={handleTrackClick}
        onMouseMove={handleMouseMove}
      >
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 w-full rounded-full bg-[#D97757]/40"
          style={{ height: `${Math.min(100, Math.max(0, progress))}%` }}
        />

        {/* Thumb */}
        <div
          className="absolute left-1/2 -translate-x-1/2 size-2.5 rounded-full bg-[#D97757] ring-2 ring-white shadow-sm transition-[top] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ top: `${Math.min(100, Math.max(0, progress))}%`, transform: "translate(-50%, -50%)" }}
        />

        {/* Month ticks */}
        {groups.map((g) => {
          const tickTop = total > 0 ? (g.firstIndex / total) * 100 : 0;
          return (
            <div
              key={g.label}
              className="absolute left-1/2 -translate-x-1/2 size-1 rounded-full bg-stone-300"
              style={{ top: `${tickTop}%`, transform: "translate(-50%, -50%)" }}
            />
          );
        })}
      </div>

      {/* Tooltip */}
      {hovered && tooltip && (
        <div
          className="absolute right-full mr-2 whitespace-nowrap rounded-lg border border-stone-700 bg-stone-700 px-2.5 py-1 text-[12px] text-white shadow-md"
          style={{ top: tooltip.y - 12 }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

const workflowStatusClass: Record<string, string> = {
  not_started: "border-stone-200 bg-stone-100/50 text-stone-500",
  draft: "border-[#D99E55]/15 bg-[#D99E55]/0.04 text-[#D99E55]",
  confirmed: "border-[#D99E55]/15 bg-[#D99E55]/0.04 text-[#D99E55]",
  sent: "border-[#6FAA7D]/15 bg-[#6FAA7D]/0.04 text-[#6FAA7D]",
  viewed: "border-[#6FAA7D]/15 bg-[#6FAA7D]/0.04 text-[#6FAA7D]",
};

const readinessClass: Record<string, string> = {
  missing_snapshot: "border-stone-200 bg-stone-100/50 text-stone-500",
  missing_content: "border-[#C9604D]/15 bg-[#C9604D]/0.04 text-[#C9604D]",
  missing_segments: "border-[#D99E55]/15 bg-[#D99E55]/0.04 text-[#D99E55]",
  ready: "border-[#6FAA7D]/15 bg-[#6FAA7D]/0.04 text-[#6FAA7D]",
};

export function ContentList({
  videos,
  snapshots,
  profiles,
  accounts,
  feedbackCards,
  reviewReadiness,
  totalCount,
  hasDeferredData = false,
  isDeferredDataLoading = false,
  onLoadDeferredData,
  onFeedbackCardChanged,
  onFeedbackCardsChanged,
  selectedVideoId,
  onSelectVideoId,
}: ContentListProps) {
  const [filters, setFilters] = useState<ContentFilterValue>({
    profileId: "all",
    accountId: "all",
    startDate: "",
    endDate: "",
    status: "all",
    hasSnapshot: "all",
    reviewed: "all",
    feedbackStatus: "all",
    rankScope: "all",
    sortMode: "latest",
  });
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [newBatchIds, setNewBatchIds] = useState<Set<string>>(new Set());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasUserScrolledList, setHasUserScrolledList] = useState(false);

  const snapshotMap = useMemo(() => {
    const map = new Map<string, VideoMetricsSnapshot>();
    for (const s of snapshots) {
      if (s.snapshot_type !== "24h") continue;
      const existing = map.get(s.video_id);
      const nextTs = new Date(s.captured_at).getTime();
      const currentTs = existing ? new Date(existing.captured_at).getTime() : -Infinity;
      if (!existing || nextTs > currentTs) {
        map.set(s.video_id, s);
      }
    }
    return map;
  }, [snapshots]);

  const priorityScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    const now = Date.now();
    for (const v of videos) {
      let score = 0;
      if (v.anomaly_status === "删稿" || v.anomaly_status === "限流") score += 1000;
      if (v.play_change_signal === "halve") score += 800;
      if (v.play_change_signal === "surge") score += 400;
      if (v.anomaly_status === "投流" || v.anomaly_status === "活动干预") score += 200;
      const cardStatus = feedbackCards[v.id]?.workflow_status ?? "not_started";
      if (cardStatus === "not_started") score += 100;
      const playCount = snapshotMap.get(v.id)?.play_count ?? 0;
      score += Math.min(playCount / 10000, 50);
      const ts = getVideoUploadTimestamp(v);
      if (ts > 0) {
        const days = Math.floor((now - ts) / 86400000);
        score += Math.min(Math.max(days, 0), 30) * 5;
      }
      if (cardStatus === "sent" || cardStatus === "viewed") score -= 2000;
      map.set(v.id, score);
    }
    return map;
  }, [videos, snapshotMap, feedbackCards]);

  const PRIORITY_HIGHLIGHT_THRESHOLD = 200;

  const handleFilter = useCallback((value: ContentFilterValue) => {
    setFilters(value);
    setLoadedCount(PAGE_SIZE);
    setNewBatchIds(new Set());
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const filtered = useMemo(() => {
    const rows = videos.filter((video) => {
      if (filters.profileId !== "all" && video.user_id !== filters.profileId) return false;
      if (filters.accountId !== "all" && video.account_id !== filters.accountId) return false;
      if (filters.status !== "all" && video.anomaly_status !== filters.status) return false;
      const uploadedDate = getVideoUploadDateKey(video);
      if (filters.startDate && uploadedDate < filters.startDate) return false;
      if (filters.endDate && uploadedDate > filters.endDate) return false;
      const hasSnap = snapshotMap.has(video.id);
      if (filters.hasSnapshot === "yes" && !hasSnap) return false;
      if (filters.hasSnapshot === "no" && hasSnap) return false;
      const card = feedbackCards[video.id];
      const cardStatus = card?.workflow_status ?? "not_started";
      const hasDraft = cardStatus !== "not_started";
      if (filters.reviewed === "yes" && !hasDraft) return false;
      if (filters.reviewed === "no" && hasDraft) return false;
      if (filters.feedbackStatus !== "all") {
        if (filters.feedbackStatus === "no_feedback" && cardStatus !== "not_started" && cardStatus !== "draft") return false;
        if (filters.feedbackStatus === "confirmed" && cardStatus !== "confirmed") return false;
        if (filters.feedbackStatus === "sent" && cardStatus !== "sent") return false;
        if (filters.feedbackStatus === "viewed" && cardStatus !== "viewed") return false;
      }
      return true;
    });

    let scopedRows = rows;
    if (filters.rankScope === "day") {
      const targetDay =
        filters.startDate ||
        filters.endDate ||
        rows.map(getVideoUploadDateKey).filter(Boolean).sort((left, right) => right.localeCompare(left))[0] ||
        "";
      scopedRows = targetDay ? rows.filter((video) => getVideoUploadDateKey(video) === targetDay) : rows;
    }

    if (filters.rankScope === "month") {
      const targetMonth =
        (filters.startDate || filters.endDate)?.slice(0, 7) ||
        rows.map(getVideoUploadMonthKey).filter(Boolean).sort((left, right) => right.localeCompare(left))[0] ||
        "";
      scopedRows = targetMonth ? rows.filter((video) => getVideoUploadMonthKey(video) === targetMonth) : rows;
    }

    return [...scopedRows].sort((left, right) => {
      if (filters.sortMode === "priority") {
        const scoreDiff = (priorityScoreMap.get(right.id) ?? 0) - (priorityScoreMap.get(left.id) ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
      }
      if (filters.sortMode === "play") {
        const playDiff = getSnapshotPlay(snapshotMap.get(right.id)) - getSnapshotPlay(snapshotMap.get(left.id));
        if (playDiff !== 0) return playDiff;
      }
      return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
    });
  }, [videos, filters, snapshotMap, feedbackCards, priorityScoreMap]);

  const visible = useMemo(() => filtered.slice(0, loadedCount), [filtered, loadedCount]);
  const hasMoreLocal = loadedCount < filtered.length;
  const hasMore = hasMoreLocal || hasDeferredData;
  const timelineGroups = useMemo(() => buildTimeline(filtered), [filtered]);

  /* Intersection Observer for auto-load */
  const currentPageStart = useCallback((visibleRows: VideoRow[]) => {
    const firstId = visibleRows[0]?.id;
    return filtered.findIndex((v) => v.id === firstId);
  }, [filtered]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          if (hasDeferredData) {
            return;
          }
          setIsLoadingMore(true);
          setTimeout(() => {
            const nextIds = new Set<string>();
            filtered.slice(loadedCount, loadedCount + PAGE_SIZE).forEach((v) => nextIds.add(v.id));
            setNewBatchIds(nextIds);
            setLoadedCount((c) => c + PAGE_SIZE);
            setIsLoadingMore(false);
            setTimeout(() => setNewBatchIds(new Set()), 600);
          }, 300);
        }
      },
      { root: tableContainerRef.current, rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered, hasDeferredData, hasMore, hasUserScrolledList, isLoadingMore, loadedCount, onLoadDeferredData]);

  /* Current scroll index for timeline */
  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (container.scrollTop > 24) setHasUserScrolledList(true);
      const rows = container.querySelectorAll("tbody tr[data-video-id]");
      if (!rows.length) return;
      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;

      let closest = 0;
      let minDist = Infinity;
      rows.forEach((row, i) => {
        const rect = row.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - centerY);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      setCurrentIndex(closest + (currentPageStart(visible)));

    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [currentPageStart, visible]);

  const handleTimelineSeek = useCallback(
    (index: number) => {
      const targetId = filtered[index]?.id;
      if (!targetId) return;
      const row = tableContainerRef.current?.querySelector(`tr[data-video-id="${targetId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        // Target not in DOM yet, load up to that point
        const needCount = Math.min(filtered.length, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
        setLoadedCount(needCount);
        setTimeout(() => {
          const r = tableContainerRef.current?.querySelector(`tr[data-video-id="${targetId}"]`);
          r?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    },
    [filtered]
  );

  const handleNavigateToNext = useCallback(() => {
    if (!selectedVideoId) return;
    const currentIndex = filtered.findIndex((v) => v.id === selectedVideoId);
    if (currentIndex !== -1 && currentIndex + 1 < filtered.length) {
      const nextVideo = filtered[currentIndex + 1];
      onSelectVideoId(nextVideo.id);
    } else {
      onSelectVideoId(null);
    }
  }, [selectedVideoId, filtered, onSelectVideoId]);

  const selectedVideo = selectedVideoId ? (videos.find((v) => v.id === selectedVideoId) ?? null) : null;
  const selectedSnapshot = selectedVideoId ? (snapshotMap.get(selectedVideoId) ?? null) : null;
  const batchCandidates = useMemo(
    () => filtered.filter((video) => reviewReadiness[video.id]?.can_generate).slice(0, 20),
    [filtered, reviewReadiness],
  );

  const handleBatchGenerate = useCallback(async () => {
    if (!batchCandidates.length) return;
    setIsBatchGenerating(true);
    try {
      const res = await fetch("/api/admin/next-day-review/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: batchCandidates.map((video) => video.id) }),
      });
      const data = (await res.json()) as {
        success_count?: number;
        failed_count?: number;
        results?: Array<{ ok: boolean; video_id: string; feedback_card?: ContentFeedbackCardDetail; error?: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "批量生成失败");

      const changedCards = Object.fromEntries(
        (data.results ?? [])
          .filter((item): item is { ok: true; video_id: string; feedback_card: ContentFeedbackCardDetail } => item.ok && Boolean(item.feedback_card))
          .map((item) => [item.video_id, item.feedback_card]),
      );
      if (Object.keys(changedCards).length) {
        onFeedbackCardsChanged?.(changedCards);
      }

      const failedText = data.failed_count ? `，失败 ${data.failed_count} 条` : "";
      feedbackToast.success(`已生成 ${data.success_count ?? 0} 条草稿${failedText}`);
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "批量生成失败");
    } finally {
      setIsBatchGenerating(false);
    }
  }, [batchCandidates, onFeedbackCardsChanged]);

  return (
    <div className="flex flex-1 flex-col min-h-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <ContentFilters profiles={profiles} accounts={accounts} onFilter={handleFilter} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 gap-1.5 rounded-xl text-[12px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
          onClick={handleBatchGenerate}
          disabled={isBatchGenerating || batchCandidates.length === 0}
        >
          <Sparkles className="size-3.5" />
          {isBatchGenerating ? "生成中..." : `批量生成反馈草稿${batchCandidates.length > 0 ? ` · ${batchCandidates.length}` : ""}`}
        </Button>
      </div>

      <div className="flex gap-4">
        {/* Table area */}
        <div className="flex-1 min-w-0">
          <div
            ref={tableContainerRef}
            className="overflow-x-auto overflow-y-auto rounded-2xl border border-stone-200 bg-white"
            style={{ maxHeight: "calc(100vh - 280px)" }}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="border-b border-stone-200 bg-stone-100/50 hover:bg-stone-100/50">
                  <TableHead className="h-9 w-16 text-[12px] font-medium text-stone-500">排名</TableHead>
                  <TableHead className="h-9 min-w-[200px] text-[12px] font-medium text-stone-500">标题</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500"></TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">人员</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">账号</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">发布时间</TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-stone-500">播放</TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-stone-500">2s跳出</TableHead>
                  <TableHead className="h-9 text-right text-[12px] font-medium text-stone-500">5s完播</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">异常状态</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">复盘状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-[13px] text-stone-500">
                      暂无内容
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((video, index) => {
                    const snap = snapshotMap.get(video.id);
                    const card = feedbackCards[video.id];
                    const cardStatus = card?.workflow_status ?? "not_started";
                    const readiness = reviewReadiness[video.id];
                    const isNewBatch = newBatchIds.has(video.id);
                    const isUploadedToday = isVideoUploadedToday(video);
                    const previousVideo = index > 0 ? visible[index - 1] : null;
                    const showTodayDivider =
                      previousVideo !== null &&
                      isVideoUploadedToday(previousVideo) &&
                      !isUploadedToday;
                    return (
                      <Fragment key={video.id}>
                        {showTodayDivider ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={11} className="px-4 py-2">
                              <div className="flex items-center gap-3 text-[12px] text-stone-500">
                                <span className="shrink-0 tracking-[0.18em]">历史</span>
                                <span className="h-px flex-1 bg-stone-200" />
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                        <TableRow
                          data-video-id={video.id}
                          className={[
                            "group border-b border-stone-100 hover:bg-stone-100",
                            isNewBatch && "animate-fade-in-up",
                          ].filter(Boolean).join(" ")}
                          style={
                            isNewBatch
                              ? {
                                  animation: "fadeInUp 0.5s cubic-bezier(0.4,0,0.2,1) forwards",
                                }
                              : undefined
                          }
                        >
                          <TableCell className="py-2 text-[13px] tabular-nums text-stone-500">
                            <span className="inline-flex items-center gap-1.5">
                              {filters.sortMode === "priority" &&
                              (priorityScoreMap.get(video.id) ?? 0) >= PRIORITY_HIGHLIGHT_THRESHOLD ? (
                                <span
                                  aria-hidden
                                  className="size-2 shrink-0 rounded-full bg-[#D97757]"
                                  title="该先复盘"
                                />
                              ) : null}
                              <span>{index + 1}</span>
                            </span>
                          </TableCell>
                          <TableCell className="max-w-md py-2">
                            <div className="line-clamp-2 text-[13px] font-medium text-stone-900" title={video.video_title || video.content?.slice(0, 60) || "（无标题）"}>
                              {video.video_title || video.content?.slice(0, 30) || "（无标题）"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const hasSignal = Boolean(video.play_change_signal);
                              const sent = cardStatus === "sent" || cardStatus === "viewed";
                              // 三档：异常未复盘 → 暖橙实色推到眼前；已下发 → outline 灰；其他 → ghost 极淡
                              if (hasSignal && !sent) {
                                return (
                                  <Button
                                    size="sm"
                                    className="h-7 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#C96442] active:scale-[0.98] opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                                    onClick={() => onSelectVideoId(video.id)}
                                  >
                                    复盘
                                  </Button>
                                );
                              }
                              if (sent) {
                                return (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-lg border-stone-200 bg-white px-3 text-[12px] text-stone-500 hover:text-stone-700 active:scale-[0.98] transition-all duration-150 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                                    onClick={() => onSelectVideoId(video.id)}
                                  >
                                    查看
                                  </Button>
                                );
                              }
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 rounded-lg px-3 text-[12px] text-stone-500 hover:bg-stone-100 hover:text-stone-700 active:scale-[0.98] transition-all duration-150 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                                  onClick={() => onSelectVideoId(video.id)}
                                >
                                  复盘
                                </Button>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-[13px] text-stone-500">
                            {video.profiles.name}
                          </TableCell>
                          <TableCell className="text-[13px] text-stone-500">
                            {video.accounts.name}
                          </TableCell>
                          <TableCell className="text-[13px] text-stone-500">
                            {formatDateTime(video.published_at ?? video.uploaded_at ?? video.created_at)}
                          </TableCell>
                          <TableCell className="text-right text-[13px] tabular-nums text-stone-700">
                            {snap ? (
                              <PlayCountWithSignal video={video} playCount={snap.play_count} />
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-[13px] tabular-nums text-stone-700">
                            {snap ? formatRate(snap.bounce_rate_2s) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-[13px] tabular-nums text-stone-700">
                            {snap ? formatRate(snap.completion_rate_5s) : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[12px] ${statusClassName[video.anomaly_status]}`}
                            >
                              {video.anomaly_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {cardStatus !== "not_started" && card ? (
                              <div className="flex flex-col gap-1 items-start">
                                <Badge
                                  variant="outline"
                                  className={`text-[12px] ${workflowStatusClass[cardStatus] ?? "border-stone-200 bg-stone-50 text-stone-500"}`}
                                >
                                  {card.workflow_label}
                                </Badge>
                                {card.employee_reply_status && card.employee_reply_status !== "pending" && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[12px] -translate-x-1 ${
                                      card.employee_reply_status === "acknowledged"
                                        ? "border-[#6FAA7D]/15 bg-[#6FAA7D]/[0.04] text-[#6FAA7D] font-medium"
                                        : "border-[#D99E55]/15 bg-[#D99E55]/[0.04] text-[#D99E55] font-medium"
                                    }`}
                                  >
                                    {card.employee_reply_status === "acknowledged" ? "已回传：采纳" : "已回传：申诉"}
                                  </Badge>
                                )}
                              </div>
                            ) : readiness ? (
                              <Badge
                                variant="outline"
                                className={`text-[12px] ${readinessClass[readiness.status] ?? "border-stone-200 bg-stone-50 text-stone-500"}`}
                              >
                                {readiness.label}
                              </Badge>
                            ) : (
                              <span className="text-[12px] text-stone-500">未生成</span>
                            )}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })
                )}

                {/* Sentinel for auto-load */}
                {hasMore && (
                  <TableRow>
                    <TableCell colSpan={11} className="p-0">
                      <div ref={sentinelRef} className="h-4" />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Load more button (manual fallback + visual anchor) */}
          {hasMore && !isLoadingMore && (
            <div className="mt-2 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (hasDeferredData && onLoadDeferredData) {
                    void onLoadDeferredData();
                    return;
                  }
                  setIsLoadingMore(true);
                  setTimeout(() => {
                    const nextIds = new Set<string>();
                    filtered.slice(loadedCount, loadedCount + PAGE_SIZE).forEach((v) => nextIds.add(v.id));
                    setNewBatchIds(nextIds);
                    setLoadedCount((c) => c + PAGE_SIZE);
                    setIsLoadingMore(false);
                    setTimeout(() => setNewBatchIds(new Set()), 600);
                  }, 200);
                }}
                disabled={isLoadingMore || isDeferredDataLoading}
              >
                {isLoadingMore || isDeferredDataLoading ? (
                  <>加载中…</>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" />
                    加载更多
                    <span className="ml-1 text-[12px] text-stone-500">
                      (已加载 {Math.min(loadedCount, filtered.length)} / 共 {hasDeferredData ? totalCount ?? filtered.length : filtered.length} 条)
                    </span>
                  </>
                )}
              </Button>
            </div>
          )}

          {/* End state */}
          {!hasMore && filtered.length > 0 && (
            <div className="mt-4 text-center text-[12px] text-stone-500">
              已加载全部 {filtered.length} 条内容
            </div>
          )}
        </div>

        {/* Right sidebar: mini timeline */}
        {filtered.length > PAGE_SIZE && (
          <div className="hidden flex-col items-center gap-4 py-4 lg:flex">
            <span className="text-[12px] text-stone-500" style={{ writingMode: "vertical-rl" }}>
              时间轴
            </span>
            <MiniTimeline
              groups={timelineGroups}
              total={filtered.length}
              currentIndex={Math.min(currentIndex, filtered.length - 1)}
              onSeek={handleTimelineSeek}
            />
            <span className="text-[12px] text-stone-500" style={{ writingMode: "vertical-rl" }}>
              {filtered.length} 条
            </span>
          </div>
        )}
      </div>

      <ContentDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) onSelectVideoId(null);
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        feedbackCard={selectedVideoId ? feedbackCards[selectedVideoId] ?? null : null}
        onFeedbackCardChanged={(videoId, card) => {
          onFeedbackCardChanged?.(videoId, card);
        }}
        onNavigateToNext={handleNavigateToNext}
      />

      {/* Keyframe animation for new batch */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

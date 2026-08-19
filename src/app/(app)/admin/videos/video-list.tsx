"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { TablePagination } from "@/components/ui/table-pagination";
import { VideoDetailDialog } from "./video-detail-dialog";
import { Patch24hDialog } from "./patch-24h-dialog";
import { interactionRate } from "@/lib/video-metrics";
import { shouldShowPatch24hButton } from "@/lib/video-admin";
import type {
  AnomalyStatus,
  Profile,
  Video,
  VideoAssetLibraryRecord,
  VideoMetricsSnapshot,
  VideoTag,
} from "@/types";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { AdminDataPerspective } from "@/lib/admin-data-perspective";
import type { TeamOption } from "@/lib/teams";
import type { AdminVideosPageData } from "@/lib/loaders/admin-videos-page";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
  trashed_by_name?: string | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };
type VideoView = "pending" | "all" | "trash";

export interface VideoFilterValue {
  profileId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  status: AnomalyStatus | "all";
}

interface VideoListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  videoTags: VideoTag[];
  assetLibrary: Record<string, VideoAssetLibraryRecord>;
  totalCount?: number;
  summary: AdminVideosPageData["summary"];
  assetSummary: AdminVideosPageData["assetSummary"];
  hasDeferredData?: boolean;
  isDeferredDataLoading?: boolean;
  onLoadDeferredData?: () => Promise<void>;
  permissionInfo: UserPermissionInfo;
  view: VideoView;
  perspective: AdminDataPerspective;
  teamId: string | null;
  teams: TeamOption[];
  canSwitchPerspective: boolean;
  canAccessTrash: boolean;
  isLoading?: boolean;
  onSwitchView: (view: VideoView) => void;
  onSwitchPerspective: (perspective: AdminDataPerspective) => void;
  onSwitchTeam: (teamId: string | null) => void;
  onRefresh: () => void;
}

type SortField =
  "published_at" | "play_count" | "interaction_rate" | "follower_gain";

const DEFAULT_PAGE_SIZE = 30;

const INITIAL_FILTERS: VideoFilterValue = {
  profileId: "all",
  accountId: "all",
  startDate: "",
  endDate: "",
  status: "all",
};

const STATUS_OPTIONS: Array<AnomalyStatus | "all"> = [
  "all",
  "正常",
  "删稿",
  "限流",
  "投流",
  "活动干预",
  "未满24h",
];

function statusLabel(value: AnomalyStatus | "all") {
  return value === "all" ? "全部状态" : value;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

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
  return `${(val * 100).toFixed(1)}%`;
}

function getVideoStatusInfo(
  status: string | null | undefined,
  playChangeSignal?: string | null,
) {
  const isHalve = playChangeSignal === "halve";
  if (status === "deleted" || status === "删稿") {
    return {
      dotColor: "bg-[#DC2626]",
      textColor: "text-[#DC2626]",
      bgColor: "bg-zinc-100",
      label: "删稿",
    };
  }
  if (
    status === "limited" ||
    status === "abnormal" ||
    status === "限流" ||
    status === "异常"
  ) {
    return {
      dotColor: "bg-[#DC2626]",
      textColor: "text-[#DC2626]",
      bgColor: "bg-zinc-100",
      label: status === "limited" || status === "限流" ? "限流" : "异常",
    };
  }
  if (isHalve || status === "halve" || status === "腰斩") {
    return {
      dotColor: "bg-[#F59E0B]",
      textColor: "text-[#F59E0B]",
      bgColor: "bg-zinc-100",
      label: "腰斩",
    };
  }
  if (status === "traffic_boost" || status === "投流") {
    return {
      dotColor: "bg-[#F59E0B]",
      textColor: "text-[#F59E0B]",
      bgColor: "bg-zinc-100",
      label: "投流",
    };
  }
  if (status === "activity_boost" || status === "活动干预") {
    return {
      dotColor: "bg-[#F59E0B]",
      textColor: "text-[#F59E0B]",
      bgColor: "bg-zinc-100",
      label: "活动干预",
    };
  }
  if (status === "normal" || status === "正常") {
    return {
      dotColor: "bg-[#16A34A]/100",
      textColor: "text-zinc-600",
      bgColor: "bg-[#16A34A]/10",
      label: "正常",
    };
  }
  if (status === "pending" || status === "未满24h") {
    return {
      dotColor: "bg-zinc-400",
      textColor: "text-zinc-600",
      bgColor: "bg-zinc-100",
      label: "未满24h",
    };
  }
  return {
    dotColor: "bg-zinc-300",
    textColor: "text-zinc-500",
    bgColor: "bg-zinc-100",
    label: status || "未满24h",
  };
}

export function VideoList({
  videos,
  snapshots,
  profiles,
  accounts,
  videoTags,
  assetLibrary,
  summary,
  assetSummary,
  hasDeferredData = false,
  isDeferredDataLoading = false,
  onLoadDeferredData,
  permissionInfo,
  view,
  perspective,
  teamId,
  teams,
  canSwitchPerspective,
  canAccessTrash,
  onSwitchView,
  onSwitchPerspective,
  onSwitchTeam,
  onRefresh,
}: VideoListProps) {
  const [filters, setFilters] = useState<VideoFilterValue>(INITIAL_FILTERS);
  const [sortField, setSortField] = useState<SortField>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [patchingVideoId, setPatchingVideoId] = useState<string | null>(null);
  const [videoRows, setVideoRows] = useState<VideoRow[]>(videos);
  const [snapshotRows, setSnapshotRows] = useState(snapshots);
  const [tagRows, setTagRows] = useState(videoTags);
  const [assetLibraryState, setAssetLibraryState] = useState(assetLibrary);
  const [isOperating, setIsOperating] = useState<string | null>(null);
  const [confirmPurgeVideoId, setConfirmPurgeVideoId] = useState<string | null>(
    null,
  );

  /* Batch & Quick Recycle Bin state */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [trashSingleVideo, setTrashSingleVideo] = useState<VideoRow | null>(
    null,
  );
  const [showBatchTrashConfirm, setShowBatchTrashConfirm] = useState(false);
  const [showBatchRestoreConfirm, setShowBatchRestoreConfirm] = useState(false);
  const [isBatchOperating, setIsBatchOperating] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const hasTriggeredDeferredRef = useRef(false);
  const canManageLifecycle = permissionInfo.permissions.manage_videos === true;
  const canPurge = permissionInfo.companyRole === "company_owner" || permissionInfo.groupMode === true;
  const safeTeams = teams ?? [];
  const selectedTeamName = safeTeams.find((t) => t.id === teamId)?.name;

  const handleRestore = async (videoId: string) => {
    setIsOperating(videoId);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "恢复失败");
      feedbackToast.success("作品已成功恢复");
      onRefresh();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setIsOperating(null);
    }
  };

  const handlePurge = async (videoId: string) => {
    setIsOperating(videoId);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "永久删除失败");
      feedbackToast.success("作品已永久删除");
      setConfirmPurgeVideoId(null);
      onRefresh();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "永久删除失败");
    } finally {
      setIsOperating(null);
    }
  };

  const isPurgeEligible = (trashedAt: string | null | undefined) => {
    if (!trashedAt) return false;
    const diff = Date.now() - new Date(trashedAt).getTime();
    return diff >= 30 * 24 * 60 * 60 * 1000;
  };

  const getPurgeTooltip = (trashedAt: string | null | undefined) => {
    if (!trashedAt) return "";
    const targetDate = new Date(
      new Date(trashedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return "";
    const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return `未满 30 天（剩余约 ${daysLeft} 天，可于 ${targetDate.toLocaleString("zh-CN")} 后删除）`;
  };

  useEffect(() => {
    setVideoRows(videos);
  }, [videos]);

  useEffect(() => {
    setSnapshotRows(snapshots);
  }, [snapshots]);

  useEffect(() => {
    setTagRows(videoTags);
  }, [videoTags]);

  useEffect(() => {
    setAssetLibraryState(assetLibrary);
  }, [assetLibrary]);

  // 仅在首次需要时安全触发一次背景全量加载，杜绝循环重刷
  useEffect(() => {
    if (
      hasDeferredData &&
      onLoadDeferredData &&
      !isDeferredDataLoading &&
      !hasTriggeredDeferredRef.current
    ) {
      hasTriggeredDeferredRef.current = true;
      void onLoadDeferredData();
    }
  }, [hasDeferredData, onLoadDeferredData, isDeferredDataLoading]);

  const snapshots24h = useMemo(
    () => snapshotRows.filter((snapshot) => snapshot.snapshot_type === "24h"),
    [snapshotRows],
  );

  const snapshotMap = useMemo(() => {
    const sorted = [...snapshots24h].sort((a, b) => {
      const aTime = a.captured_at ? new Date(a.captured_at).getTime() : 0;
      const bTime = b.captured_at ? new Date(b.captured_at).getTime() : 0;
      return bTime - aTime;
    });
    const map = new Map();
    for (const snapshot of sorted) {
      if (!map.has(snapshot.video_id)) {
        map.set(snapshot.video_id, snapshot);
      }
    }
    return map;
  }, [snapshots24h]);

  const tagMap = useMemo(() => {
    const map = new Map<string, VideoTag[]>();
    for (const tag of tagRows) {
      const current = map.get(tag.video_id) ?? [];
      current.push(tag);
      map.set(tag.video_id, current);
    }
    return map;
  }, [tagRows]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
      setCurrentPage(1);
      tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [sortField],
  );

  const sortedAndFilteredVideos = useMemo(() => {
    const filtered = videoRows.filter((video) => {
      // 本地实现 pending 视图过滤（支持无感瞬切）
      if (view === "pending") {
        const isNormal =
          video.anomaly_status === "normal" || video.anomaly_status === "正常";
        const hasTag = tagMap.has(video.id);
        if (hasTag && isNormal) return false;
      }

      if (filters.profileId !== "all" && video.user_id !== filters.profileId) {
        return false;
      }

      if (
        filters.accountId !== "all" &&
        video.account_id !== filters.accountId
      ) {
        return false;
      }

      if (filters.status !== "all") {
        const s = video.anomaly_status as string;
        if (filters.status === "正常" && s !== "normal" && s !== "正常")
          return false;
        if (filters.status === "删稿" && s !== "deleted" && s !== "删稿")
          return false;
        if (
          filters.status === "限流" &&
          s !== "limited" &&
          s !== "abnormal" &&
          s !== "限流" &&
          s !== "异常"
        )
          return false;
        if (filters.status === "投流" && s !== "traffic_boost" && s !== "投流")
          return false;
        if (
          filters.status === "活动干预" &&
          s !== "activity_boost" &&
          s !== "活动干预"
        )
          return false;
        if (
          filters.status === "未满24h" &&
          s !== "未满24h" &&
          s !== "pending" &&
          s
        )
          return false;
      }

      const publishedDate = video.published_at
        ? video.published_at.slice(0, 10)
        : "";

      if (
        filters.startDate &&
        (!publishedDate || publishedDate < filters.startDate)
      ) {
        return false;
      }

      if (
        filters.endDate &&
        (!publishedDate || publishedDate > filters.endDate)
      ) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const snapA = snapshotMap.get(a.id);
      const snapB = snapshotMap.get(b.id);
      let valA: number | null = null;
      let valB: number | null = null;

      switch (sortField) {
        case "published_at":
          valA = (view === "trash" ? a.trashed_at : a.published_at)
            ? new Date(
                view === "trash" ? a.trashed_at! : a.published_at!,
              ).getTime()
            : 0;
          valB = (view === "trash" ? b.trashed_at : b.published_at)
            ? new Date(
                view === "trash" ? b.trashed_at! : b.published_at!,
              ).getTime()
            : 0;
          break;
        case "play_count":
          valA = snapA?.play_count ?? null;
          valB = snapB?.play_count ?? null;
          break;
        case "interaction_rate":
          valA = snapA ? interactionRate(snapA) : null;
          valB = snapB ? interactionRate(snapB) : null;
          break;
        case "follower_gain":
          valA = snapA?.follower_gain ?? null;
          valB = snapB?.follower_gain ?? null;
          break;
      }

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      return sortDir === "desc" ? valB - valA : valA - valB;
    });
  }, [filters, snapshotMap, sortDir, sortField, videoRows, view]);

  const pagedVideos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAndFilteredVideos.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedAndFilteredVideos]);

  const isAllSelected = useMemo(
    () =>
      pagedVideos.length > 0 && pagedVideos.every((v) => selectedIds.has(v.id)),
    [pagedVideos, selectedIds],
  );

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedVideos.map((v) => v.id)));
    }
  }, [isAllSelected, pagedVideos]);

  const handleTrashSingle = useCallback(async () => {
    if (!trashSingleVideo) return;
    try {
      const res = await fetch(
        `/api/admin/videos/${trashSingleVideo.id}/lifecycle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trash" }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "移入回收站失败");
      feedbackToast.success(
        `已将作品“${trashSingleVideo.video_title?.trim() || "未命名"}”移入回收站`,
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(trashSingleVideo.id);
        return next;
      });
      setTrashSingleVideo(null);
      onRefresh();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "移入回收站失败");
    }
  }, [trashSingleVideo, onRefresh]);

  const handleBatchLifecycle = useCallback(
    async (action: "trash" | "restore") => {
      if (selectedIds.size === 0) return;
      setIsBatchOperating(true);
      try {
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
          ids.map((id) =>
            fetch(`/api/admin/videos/${id}/lifecycle`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            }).then(async (res) => {
              const data = await res.json();
              if (!res.ok || !data.ok)
                throw new Error(data.error ?? "操作失败");
              return id;
            }),
          ),
        );
        const successCount = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failCount = results.filter((r) => r.status === "rejected").length;
        const actionName = action === "trash" ? "移入回收站" : "恢复";
        if (successCount > 0) {
          feedbackToast.success(
            `已成功${actionName} ${successCount} 项视频${failCount > 0 ? `（${failCount} 项处理失败）` : ""}`,
          );
        } else {
          feedbackToast.error(`批量${actionName}失败`);
        }
        setSelectedIds(new Set());
        setShowBatchTrashConfirm(false);
        setShowBatchRestoreConfirm(false);
        onRefresh();
      } catch (e) {
        feedbackToast.error(e instanceof Error ? e.message : "批量操作失败");
      } finally {
        setIsBatchOperating(false);
      }
    },
    [selectedIds, onRefresh],
  );

  function updateFilter<Key extends keyof VideoFilterValue>(
    key: Key,
    value: VideoFilterValue[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleReset() {
    setFilters(INITIAL_FILTERS);
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

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
      return (
        <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
          ↕
        </span>
      );
    }
    return (
      <span className="text-[10.5px] font-medium text-zinc-950">
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    );
  };

  const profileLabel =
    filters.profileId === "all"
      ? "全部负责人"
      : (profiles.find((item) => item.id === filters.profileId)?.name ??
        "全部负责人");
  const accountLabel =
    filters.accountId === "all"
      ? "全部账号"
      : (accounts.find((item) => item.id === filters.accountId)?.name ??
        "全部账号");

  const selectedVideo = useMemo(
    () =>
      sortedAndFilteredVideos.find((video) => video.id === selectedVideoId) ??
      null,
    [sortedAndFilteredVideos, selectedVideoId],
  );

  const selectedSnapshot = selectedVideo
    ? (snapshotMap.get(selectedVideo.id) ?? null)
    : null;
  const patchingVideo = useMemo(
    () => videoRows.find((video) => video.id === patchingVideoId) ?? null,
    [patchingVideoId, videoRows],
  );
  const patchingSnapshot = patchingVideo
    ? (snapshotMap.get(patchingVideo.id) ?? null)
    : null;

  function handlePatchSaved(result: {
    video: VideoRow;
    snapshot: VideoMetricsSnapshot;
  }) {
    setVideoRows((current) =>
      current.map((video) =>
        video.id === result.video.id ? result.video : video,
      ),
    );

    setSnapshotRows((current) => {
      const matchIndex = current.findIndex(
        (snapshot) =>
          snapshot.id === result.snapshot.id ||
          (snapshot.video_id === result.snapshot.video_id &&
            snapshot.snapshot_type === "24h"),
      );

      if (matchIndex === -1) {
        return [result.snapshot, ...current];
      }

      return current.map((snapshot, index) =>
        index === matchIndex ? result.snapshot : snapshot,
      );
    });
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 space-y-4">
      {/* 🚀 控制舱（去盒子化：通过留白、微岛屿与微竖线清晰分区，不堆叠实体硬框） */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-1">
        {/* 左侧：视图切换群 + 范围与条件筛选群 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 1. 待处理 / 全部 / 回收站 视角切片（独立微底气垫，消除硬边框） */}
          <div className="inline-flex items-center gap-1 bg-zinc-100/70 p-1 rounded-xl select-none">
            <button
              type="button"
              onClick={() => onSwitchView("pending")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                view === "pending"
                  ? "bg-white text-zinc-950 shadow-2xs font-medium"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
              }`}
            >
              <span>待处理</span>
              <span className={`text-[11px] tabular-nums ${view === "pending" ? "font-medium text-[#D97757]" : "text-zinc-400"}`}>
                {summary?.pendingCount ?? 0}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchView("all")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                view === "all"
                  ? "bg-white text-zinc-950 shadow-2xs font-medium"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
              }`}
            >
              <span>全部</span>
              <span className={`text-[11px] tabular-nums ${view === "all" ? "font-medium text-[#D97757]" : "text-zinc-400"}`}>
                {summary?.totalVideos ?? videoRows.length}
              </span>
            </button>
            {canAccessTrash && (
              <button
                type="button"
                onClick={() => onSwitchView("trash")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  view === "trash"
                    ? "bg-white text-zinc-950 shadow-2xs font-medium"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
                }`}
              >
                回收站
              </button>
            )}
          </div>

          {/* 结构呼吸微竖线 */}
          <div className="h-4 w-px bg-zinc-200 hidden sm:block mx-1" />

          {/* 2. 筛选器群（通透平铺，靠微留白与微背景形成秩序） */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 公司 / 团队范围选择下拉框 */}
            {(safeTeams.length > 0 || canSwitchPerspective) && (
              <Select
                value={
                  perspective === "company"
                    ? "all_company"
                    : (teamId ?? safeTeams[0]?.id ?? "all_company")
                }
                onValueChange={(val) => {
                  if (val === "all_company") {
                    onSwitchPerspective("company");
                  } else {
                    onSwitchTeam(val);
                  }
                }}
              >
              <SelectTrigger className="h-8 min-w-32 rounded-lg border-0 bg-transparent hover:bg-zinc-100/80 text-[12px] font-medium text-zinc-700 hover:text-zinc-950 focus:ring-0 shadow-none px-2.5">
                <SelectValue placeholder="选择范围">
                  {perspective === "company"
                    ? "全公司 (全部团队)"
                    : (selectedTeamName ?? "选择团队")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {canSwitchPerspective && (
                  <SelectItem
                    value="all_company"
                    className="text-[12px] font-medium text-zinc-900"
                  >
                    全公司 (全部团队)
                  </SelectItem>
                )}
                {safeTeams.map((team) => (
                  <SelectItem
                    key={team.id}
                    value={team.id}
                    className="text-[12px]"
                  >
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* 细分割线 */}
          <div className="h-4 w-px bg-zinc-200 hidden md:block" />

          {/* 负责人筛选 (平铺无框) */}
          <Select
            value={filters.profileId}
            onValueChange={(value) => updateFilter("profileId", value || "all")}
          >
            <SelectTrigger className="h-8 w-28 rounded-lg border-0 bg-transparent hover:bg-zinc-100/80 text-[12px] font-medium text-zinc-700 hover:text-zinc-950 focus:ring-0 shadow-none px-2">
              <SelectValue>{profileLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部负责人</SelectItem>
              {(profiles ?? []).map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 账号筛选 (平铺无框) */}
          <Select
            value={filters.accountId}
            onValueChange={(value) => updateFilter("accountId", value || "all")}
          >
            <SelectTrigger className="h-8 w-28 rounded-lg border-0 bg-transparent hover:bg-zinc-100/80 text-[12px] font-medium text-zinc-700 hover:text-zinc-950 focus:ring-0 shadow-none px-2">
              <SelectValue>{accountLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {(accounts ?? []).map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 日期范围 (轻量微胶囊) */}
          <div className="flex items-center gap-1 col-span-2 sm:col-span-1 lg:col-span-auto">
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilter("startDate", e.target.value)}
              className="h-8 w-28 rounded-lg border-0 bg-zinc-100/70 hover:bg-zinc-100 text-[11.5px] text-zinc-700 px-2 focus:bg-white focus:ring-1 focus:ring-zinc-300"
            />
            <span className="text-zinc-400 text-[11px]">—</span>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter("endDate", e.target.value)}
              className="h-8 w-28 rounded-lg border-0 bg-zinc-100/70 hover:bg-zinc-100 text-[11.5px] text-zinc-700 px-2 focus:bg-white focus:ring-1 focus:ring-zinc-300"
            />
          </div>

          {/* 状态筛选 (平铺无框) */}
          <Select
            value={filters.status}
            onValueChange={(value) =>
              updateFilter(
                "status",
                (value || "all") as VideoFilterValue["status"],
              )
            }
          >
            <SelectTrigger className="h-8 w-24 rounded-lg border-0 bg-transparent hover:bg-zinc-100/80 text-[12px] font-medium text-zinc-700 hover:text-zinc-950 focus:ring-0 shadow-none px-2">
              <SelectValue>{statusLabel(filters.status)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 重置按钮 */}
          <Button
            variant="ghost"
            size="xs"
            className="h-8 rounded-lg text-[12px] text-zinc-600 hover:text-zinc-950"
            onClick={handleReset}
          >
            重置
          </Button>
        </div>
      </div>

        {/* 右侧：资产统计 */}
        <div className="ml-auto hidden xl:flex items-center gap-3 text-[11.5px] text-zinc-600 shrink-0">
          <span>
            已入库{" "}
            <span className="tabular-nums font-medium text-[#6FAA7D]">
              {assetSummary?.readyCount ?? 0}
            </span>
          </span>
          <span className="text-zinc-300">·</span>
          <span>
            待整理{" "}
            <span className="tabular-nums font-medium text-[#D99E55]">
              {assetSummary?.pendingLibraryCount ?? 0}
            </span>
          </span>
          <span className="text-zinc-300">·</span>
          <span>
            已评级{" "}
            <span className="tabular-nums font-medium text-zinc-800">
              {assetSummary?.gradedCount ?? 0}
            </span>
          </span>
        </div>
      </div>

      {/* 表格容器（平铺极简微边框，消除额外卡片阴影） */}
      <div
        ref={tableContainerRef}
        className="flex-1 w-full overflow-x-auto rounded-xl border border-zinc-100"
        style={{ maxHeight: "calc(100vh - 260px)" }}
      >
        <table className="w-full text-left border-collapse table-auto min-w-full">
          <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur border-b border-zinc-200 text-[12px] font-medium text-zinc-600 select-none">
            <tr>
              {canManageLifecycle && (
                <th className="py-2 pl-3.5 pr-0 text-center w-10 shrink-0">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="全选"
                  />
                </th>
              )}
              <th className="py-2 px-2 text-center w-20 shrink-0 whitespace-nowrap">
                {view === "trash" ? "状态/操作者" : "状态"}
              </th>
              {/* 标题列宽收敛至与视频复盘完全一致的 w-[185px] 2xl:w-[225px] min-w-[160px] */}
              <th className="py-2 px-3 text-left w-[185px] 2xl:w-[225px] min-w-[160px]">
                视频标题 / 账号
              </th>
              <th className="py-2 px-2.5 text-left w-20 2xl:w-24 whitespace-nowrap">
                负责人
              </th>
              <th className="py-2 px-2.5 text-left w-24 2xl:w-28 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("published_at")}
                  className="group inline-flex items-center gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                >
                  <span>{view === "trash" ? "回收时间" : "发布时间"}</span>
                  {renderSortIndicator("published_at")}
                </button>
              </th>
              {view !== "trash" && (
                <>
                  <th className="py-2 px-2.5 text-right w-20 2xl:w-26 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("play_count")}
                      className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                    >
                      <span>24h播放</span>
                      {renderSortIndicator("play_count")}
                    </button>
                  </th>
                  <th className="py-2 px-2.5 text-right w-18 2xl:w-24 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("interaction_rate")}
                      className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                    >
                      <span>互动率</span>
                      {renderSortIndicator("interaction_rate")}
                    </button>
                  </th>
                  <th className="py-2 px-2.5 text-right w-16 2xl:w-22 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("follower_gain")}
                      className="group inline-flex items-center justify-end w-full gap-1 hover:text-zinc-950 transition-colors cursor-pointer"
                    >
                      <span>涨粉</span>
                      {renderSortIndicator("follower_gain")}
                    </button>
                  </th>
                </>
              )}
              <th className="py-2 pr-4 pl-2 text-right w-24 2xl:w-28 whitespace-nowrap">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-[12px] text-zinc-700">
            {pagedVideos.length ? (
              pagedVideos.map((video) => {
                const snapshot = snapshotMap.get(video.id) ?? null;
                const showPatchButton = shouldShowPatch24hButton(
                  video,
                  snapshot,
                );
                const statusInfo = getVideoStatusInfo(
                  video.anomaly_status,
                  video.play_change_signal,
                );

                return (
                  <tr
                    key={video.id}
                    data-video-id={video.id}
                    className="group hover:bg-zinc-50/80 transition-colors border-b border-zinc-100"
                  >
                    {/* 复选框 */}
                    {canManageLifecycle && (
                      <td
                        className="py-2 pl-3.5 pr-0 text-center w-10 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(video.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(video.id);
                              else next.delete(video.id);
                              return next;
                            });
                          }}
                          aria-label={`选择 ${video.video_title || "视频"}`}
                        />
                      </td>
                    )}

                    {/* 状态徽章（中文语义 + 状态微圆点） */}
                    <td className="py-2 px-2 text-center w-20 shrink-0">
                      {view === "trash" ? (
                        <span className="text-[11.5px] text-zinc-600 truncate block max-w-[80px]">
                          {video.trashed_by_name || "—"}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${statusInfo.bgColor} ${statusInfo.textColor}`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${statusInfo.dotColor}`}
                          />
                          {statusInfo.label}
                        </span>
                      )}
                    </td>

                    {/* 视频标题与账号（单行紧凑排版，带 Tooltip） */}
                    <td className="py-2 px-3 w-[185px] 2xl:w-[225px] min-w-[160px]">
                      <div
                        className="flex items-center gap-1.5 min-w-0"
                        title={`${video.video_title || video.content || "未命名视频"}${video.accounts?.name ? ` (@${video.accounts.name})` : ""}`}
                      >
                        <span className="truncate font-normal text-zinc-800 group-hover:text-zinc-950 transition-colors">
                          {video.video_title?.trim() ||
                            video.content?.slice(0, 50) ||
                            "未命名视频"}
                        </span>
                        {video.accounts?.name && (
                          <span className="shrink-0 text-[11px] text-zinc-400 font-normal truncate max-w-[80px] 2xl:max-w-[110px]">
                            · {video.accounts.name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 负责人 */}
                    <td className="py-2 px-2.5 text-[12px] text-zinc-600 truncate w-20 2xl:w-24">
                      {video.profiles?.name || "—"}
                    </td>

                    {/* 发布时间 / 回收时间 */}
                    <td className="py-2 px-2.5 text-[11.5px] text-zinc-600 tabular-nums whitespace-nowrap w-24 2xl:w-28">
                      {view === "trash"
                        ? formatDateTime(video.trashed_at ?? null)
                        : formatDateTime(video.published_at ?? null)}
                    </td>

                    {/* 24h播放量 */}
                    {view !== "trash" && (
                      <>
                        <td className="py-2 px-2.5 text-right text-[12px] text-zinc-700 tabular-nums font-normal whitespace-nowrap w-20 2xl:w-26">
                          {formatCount(snapshot?.play_count)}
                        </td>
                        <td className="py-2 px-2.5 text-right text-[12px] text-zinc-700 tabular-nums font-normal whitespace-nowrap w-18 2xl:w-24">
                          {formatPercent(
                            snapshot ? interactionRate(snapshot) : null,
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right text-[12px] text-zinc-700 tabular-nums font-normal whitespace-nowrap w-16 2xl:w-22">
                          {formatCount(snapshot?.follower_gain)}
                        </td>
                      </>
                    )}

                    {/* 操作列 */}
                    <td className="py-2 pr-4 pl-2 text-right whitespace-nowrap w-24 2xl:w-28">
                      {view === "trash" ? (
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                          <button
                            type="button"
                            onClick={() => handleRestore(video.id)}
                            disabled={isOperating !== null}
                            className="text-[12px] text-[#6FAA7D] underline-offset-4 hover:underline disabled:opacity-50 cursor-pointer"
                          >
                            恢复
                          </button>
                          {canPurge &&
                            (() => {
                              const eligible = isPurgeEligible(
                                video.trashed_at ?? null,
                              );
                              const tooltip = getPurgeTooltip(
                                video.trashed_at ?? null,
                              );
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmPurgeVideoId(video.id)
                                  }
                                  disabled={!eligible || isOperating !== null}
                                  title={tooltip || undefined}
                                  className="text-[12px] text-[#C9604D] underline-offset-4 hover:underline disabled:text-zinc-400 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                                >
                                  永久删除
                                </button>
                              );
                            })()}
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {showPatchButton ? (
                            <button
                              type="button"
                              onClick={() => setPatchingVideoId(video.id)}
                              className="text-[11.5px] font-medium text-[#D97757] hover:text-[#C46A4D] underline-offset-4 hover:underline cursor-pointer"
                            >
                              补录24h
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setSelectedVideoId(video.id)}
                            className="text-[11.5px] text-[#D97757] hover:text-[#C46A4D] underline-offset-2 hover:underline cursor-pointer"
                          >
                            查看详情
                          </button>
                          {canManageLifecycle && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="flex size-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                                title="更多操作"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-36 text-[12px]"
                              >
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 cursor-pointer text-[12px]"
                                  onClick={() => setTrashSingleVideo(video)}
                                >
                                  <Trash2 className="size-3.5" />
                                  移入回收站
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={
                    view === "trash"
                      ? canManageLifecycle
                        ? 6
                        : 5
                      : canManageLifecycle
                        ? 9
                        : 8
                  }
                  className="px-4 py-16 text-center text-[13px] text-zinc-500"
                >
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <span>当前筛选条件下暂无视频数据。</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                      className="h-7 text-[12px] text-zinc-700 hover:text-zinc-900 border-zinc-200"
                    >
                      重置所有筛选
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 极客级专业分页底栏（对齐筛选后的真实总数） */}
      {sortedAndFilteredVideos.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={sortedAndFilteredVideos.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[20, 30, 50, 100]}
        />
      )}

      {/* 详情弹窗 */}
      <VideoDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVideoId(null);
          }
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        tags={selectedVideo ? (tagMap.get(selectedVideo.id) ?? []) : []}
        assetRecord={
          selectedVideo ? (assetLibraryState[selectedVideo.id] ?? null) : null
        }
        onTagsSaved={(tags) => {
          setTagRows((current) => {
            const rest = current.filter(
              (tag) =>
                tag.video_id !== selectedVideo?.id ||
                !tags.some(
                  (saved) => saved.tag_dimension === tag.tag_dimension,
                ),
            );
            return [...rest, ...tags];
          });
        }}
        onAssetSaved={(videoId, record) => {
          setAssetLibraryState((current) => ({
            ...current,
            [videoId]: record,
          }));
        }}
        permissionInfo={permissionInfo}
        onLifecycleChanged={() => {
          setSelectedVideoId(null);
          onRefresh();
        }}
      />

      {/* 补录24h弹窗 */}
      <Patch24hDialog
        open={patchingVideo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPatchingVideoId(null);
          }
        }}
        video={patchingVideo}
        snapshot={patchingSnapshot}
        onSaved={handlePatchSaved}
      />

      {/* 永久删除确认弹窗 */}
      {confirmPurgeVideoId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-semibold text-zinc-900">
              永久删除确认
            </h3>
            <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
              将永久隐藏该作品，并清理可确认归属的存储截图；指标、复盘结论和操作历史仍会保留。此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="h-9 rounded-xl border border-zinc-200 px-4 text-zinc-700 hover:bg-zinc-50 text-[12px] font-medium transition-colors cursor-pointer"
                onClick={() => setConfirmPurgeVideoId(null)}
                disabled={isOperating !== null}
              >
                取消
              </button>
              <button
                type="button"
                className="h-9 rounded-xl bg-[#C9604D] hover:bg-[#B34F3C] text-white px-4 text-[12px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                onClick={() => handlePurge(confirmPurgeVideoId)}
                disabled={isOperating !== null}
              >
                {isOperating ? "正在删除..." : "确定永久删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮批量操作工具栏 */}
      {canManageLifecycle && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3.5 px-4 py-2 rounded-2xl border border-zinc-200 bg-white/95 backdrop-blur-md shadow-xl transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
          <span className="text-[12.5px] font-medium text-zinc-700">
            已选择{" "}
            <span className="font-semibold text-[#D97757]">
              {selectedIds.size}
            </span>{" "}
            项视频
          </span>
          <div className="h-4 w-px bg-zinc-200" />
          <Button
            size="xs"
            variant="ghost"
            className="rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 text-[12px]"
            onClick={() => setSelectedIds(new Set())}
          >
            取消选择
          </Button>
          {view === "trash" ? (
            <Button
              size="xs"
              className="rounded-lg bg-[#6FAA7D] hover:bg-[#5F996C] text-white text-[12px] gap-1 px-3 shadow-2xs"
              onClick={() => setShowBatchRestoreConfirm(true)}
            >
              <RotateCcw className="size-3.5" />
              批量恢复作品
            </Button>
          ) : (
            <Button
              size="xs"
              variant="destructive"
              className="rounded-lg bg-[#C9604D] hover:bg-[#B85340] text-white text-[12px] gap-1 px-3 shadow-2xs"
              onClick={() => setShowBatchTrashConfirm(true)}
            >
              <Trash2 className="size-3.5" />
              批量移入回收站
            </Button>
          )}
        </div>
      )}

      {/* 单条移入回收站确认弹窗 */}
      <ConfirmDialog
        open={trashSingleVideo !== null}
        onOpenChange={(open) => {
          if (!open) setTrashSingleVideo(null);
        }}
        title="移入回收站确认"
        description={`确定将作品“${trashSingleVideo?.video_title?.trim() || "未命名"}”移入回收站吗？移入后该作品将在列表中隐藏，可在“回收站”Tab 中随时恢复。`}
        confirmText="确认移入"
        destructive
        onConfirm={handleTrashSingle}
      />

      {/* 批量移入回收站确认弹窗 */}
      <ConfirmDialog
        open={showBatchTrashConfirm}
        onOpenChange={setShowBatchTrashConfirm}
        title="批量移入回收站确认"
        description={`确定将选中的 ${selectedIds.size} 个作品移入回收站吗？移入后这些作品将在列表中隐藏，可在“回收站”Tab 中随时恢复。`}
        confirmText={isBatchOperating ? "移入中..." : "确认批量移入"}
        loading={isBatchOperating}
        destructive
        onConfirm={() => handleBatchLifecycle("trash")}
      />

      {/* 批量恢复确认弹窗 */}
      <ConfirmDialog
        open={showBatchRestoreConfirm}
        onOpenChange={setShowBatchRestoreConfirm}
        title="批量恢复作品确认"
        description={`确定将选中的 ${selectedIds.size} 个作品从回收站恢复吗？`}
        confirmText={isBatchOperating ? "恢复中..." : "确认批量恢复"}
        loading={isBatchOperating}
        onConfirm={() => handleBatchLifecycle("restore")}
      />
    </div>
  );
}

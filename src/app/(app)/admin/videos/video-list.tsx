"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VideoFilters, type VideoFilterValue } from "./video-filters";
import { VideoDetailDialog } from "./video-detail-dialog";
import { Patch24hDialog } from "./patch-24h-dialog";
import { interactionRate } from "@/lib/video-metrics";
import { shouldShowPatch24hButton } from "@/lib/video-admin";
import type { Profile, Video, VideoAssetLibraryRecord, VideoMetricsSnapshot, VideoTag } from "@/types";

import type { UserPermissionInfo } from "@/lib/permissions";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
  trashed_by_name?: string | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

interface VideoListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  videoTags: VideoTag[];
  assetLibrary: Record<string, VideoAssetLibraryRecord>;
  totalCount?: number;
  hasDeferredData?: boolean;
  isDeferredDataLoading?: boolean;
  onLoadDeferredData?: () => Promise<void>;
  permissionInfo: UserPermissionInfo;
  view: "pending" | "all" | "trash";
  onRefresh: () => void;
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  normal: "border-stone-200 bg-stone-50 text-[#6FAA7D]",
  abnormal: "border-stone-200 bg-stone-50 text-[#C9604D]",
  正常: "border-stone-200 bg-stone-50 text-[#6FAA7D]",
  删稿: "border-stone-200 bg-stone-50 text-[#C9604D]",
  限流: "border-stone-200 bg-stone-50 text-[#C9604D]",
  投流: "border-stone-200 bg-stone-50 text-[#D99E55]",
  活动干预: "border-stone-200 bg-stone-50 text-[#D99E55]",
  "未满24h": "border-stone-200 bg-stone-50 text-stone-500",
};

const PAGE_SIZE = 30;

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

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

export function VideoList({
  videos,
  snapshots,
  profiles,
  accounts,
  videoTags,
  assetLibrary,
  totalCount,
  hasDeferredData = false,
  isDeferredDataLoading = false,
  onLoadDeferredData,
  permissionInfo,
  view,
  onRefresh,
}: VideoListProps) {
  const [filters, setFilters] = useState<VideoFilterValue>({
    profileId: "all",
    accountId: "all",
    startDate: "",
    endDate: "",
    status: "all",
  });
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [patchingVideoId, setPatchingVideoId] = useState<string | null>(null);
  const [videoRows, setVideoRows] = useState<VideoRow[]>(videos);
  const [snapshotRows, setSnapshotRows] = useState(snapshots);
  const [tagRows, setTagRows] = useState(videoTags);
  const [assetLibraryState, setAssetLibraryState] = useState(assetLibrary);
  const [isOperating, setIsOperating] = useState<string | null>(null);
  const [confirmPurgeVideoId, setConfirmPurgeVideoId] = useState<string | null>(null);

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
    const targetDate = new Date(new Date(trashedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
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

  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasUserScrolledList, setHasUserScrolledList] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const snapshots24h = useMemo(
    () => snapshotRows.filter((snapshot) => snapshot.snapshot_type === "24h"),
    [snapshotRows]
  );

  const snapshotMap = useMemo(
    () => new Map(snapshots24h.map((snapshot) => [snapshot.video_id, snapshot])),
    [snapshots24h]
  );

  const sortedVideos = useMemo(
    () => [...videoRows].sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    }),
    [videoRows]
  );

  const tagMap = useMemo(() => {
    const map = new Map<string, VideoTag[]>();
    for (const tag of tagRows) {
      const current = map.get(tag.video_id) ?? [];
      current.push(tag);
      map.set(tag.video_id, current);
    }
    return map;
  }, [tagRows]);

  const filteredVideos = useMemo(() => {
    return sortedVideos.filter((video) => {
      if (filters.profileId !== "all" && video.user_id !== filters.profileId) {
        return false;
      }

      if (filters.accountId !== "all" && video.account_id !== filters.accountId) {
        return false;
      }

      if (filters.status !== "all" && video.anomaly_status !== filters.status) {
        return false;
      }

      const publishedDate = video.published_at ? video.published_at.slice(0, 10) : "";

      if (filters.startDate && (!publishedDate || publishedDate < filters.startDate)) {
        return false;
      }

      if (filters.endDate && (!publishedDate || publishedDate > filters.endDate)) {
        return false;
      }

      return true;
    });
  }, [filters, sortedVideos]);

  const visibleVideos = useMemo(() => filteredVideos.slice(0, loadedCount), [filteredVideos, loadedCount]);
  const hasMoreLocal = loadedCount < filteredVideos.length;
  const hasMore = hasMoreLocal || hasDeferredData;

  const handleFilter = useCallback((value: VideoFilterValue) => {
    setFilters(value);
    setLoadedCount(PAGE_SIZE);
    setHasUserScrolledList(false);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (container.scrollTop > 24) setHasUserScrolledList(true);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  /* Intersection Observer for auto-load */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          if (hasDeferredData && onLoadDeferredData) {
            if (!hasUserScrolledList) return;
            void onLoadDeferredData();
            return;
          }
          setIsLoadingMore(true);
          setTimeout(() => {
            setLoadedCount((c) => c + PAGE_SIZE);
            setIsLoadingMore(false);
          }, 300);
        }
      },
      { root: tableContainerRef.current, rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredVideos.length, hasDeferredData, hasMore, hasUserScrolledList, isLoadingMore, onLoadDeferredData]);

  const selectedVideo = useMemo(
    () => filteredVideos.find((video) => video.id === selectedVideoId) ?? null,
    [filteredVideos, selectedVideoId]
  );

  const selectedSnapshot = selectedVideo ? snapshotMap.get(selectedVideo.id) ?? null : null;
  const patchingVideo = useMemo(
    () => videoRows.find((video) => video.id === patchingVideoId) ?? null,
    [patchingVideoId, videoRows]
  );
  const patchingSnapshot = patchingVideo ? snapshotMap.get(patchingVideo.id) ?? null : null;

  function handlePatchSaved(result: { video: VideoRow; snapshot: VideoMetricsSnapshot }) {
    setVideoRows((current) =>
      current.map((video) => (video.id === result.video.id ? result.video : video))
    );

    setSnapshotRows((current) => {
      const matchIndex = current.findIndex(
        (snapshot) =>
          snapshot.id === result.snapshot.id ||
          (snapshot.video_id === result.snapshot.video_id && snapshot.snapshot_type === "24h")
      );

      if (matchIndex === -1) {
        return [result.snapshot, ...current];
      }

      return current.map((snapshot, index) => (index === matchIndex ? result.snapshot : snapshot));
    });
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 space-y-4">
      <VideoFilters profiles={profiles} accounts={accounts} onFilter={handleFilter} />

      <div
        ref={tableContainerRef}
        className="overflow-x-auto overflow-y-auto rounded-2xl border border-stone-200 bg-white"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        <Table freezeFirst>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-b border-stone-200 bg-stone-50 hover:bg-stone-50">
              <TableHead className="h-9 px-4 text-[12px] font-medium text-stone-500">视频标题</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">账号</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">负责人</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">
                {view === "trash" ? "回收时间" : "发布时间"}
              </TableHead>
              {view !== "trash" && (
                <>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">24h播放量</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">互动率(%)</TableHead>
                  <TableHead className="h-9 text-[12px] font-medium text-stone-500">涨粉</TableHead>
                </>
              )}
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">
                {view === "trash" ? "操作者" : "状态"}
              </TableHead>
              <TableHead className="h-9 px-4 text-right text-[12px] font-medium text-stone-500">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleVideos.length ? (
              visibleVideos.map((video) => {
                const snapshot = snapshotMap.get(video.id) ?? null;
                const showPatchButton = shouldShowPatch24hButton(video, snapshot);

                return (
                  <TableRow key={video.id} data-video-id={video.id} className="group hover:bg-stone-50">
                    <TableCell className="max-w-[280px] whitespace-normal px-4 align-top">
                      <div className="line-clamp-2 text-[13px] font-medium text-stone-900">
                        {video.video_title?.trim() || "未命名视频"}
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] text-stone-500">{video.accounts.name}</TableCell>
                    <TableCell className="text-[12px] text-stone-500">{video.profiles.name}</TableCell>
                    <TableCell className="text-[12px] text-stone-500">
                      {view === "trash" ? formatDateTime(video.trashed_at ?? null) : formatDateTime(video.published_at ?? null)}
                    </TableCell>
                    {view !== "trash" && (
                      <>
                        <TableCell className="text-[12px] text-stone-700 tabular-nums">{formatNumber(snapshot?.play_count)}</TableCell>
                        <TableCell className="text-[12px] text-stone-700 tabular-nums">{formatPercent(snapshot ? interactionRate(snapshot) : null)}</TableCell>
                        <TableCell className="text-[12px] text-stone-700 tabular-nums">{formatNumber(snapshot?.follower_gain)}</TableCell>
                      </>
                    )}
                    <TableCell>
                      {view === "trash" ? (
                        <span className="text-[12px] text-stone-700">{video.trashed_by_name || "-"}</span>
                      ) : (
                        <Badge variant="outline" className={`text-[12px] ${statusClassName[video.anomaly_status]}`}>
                          {video.anomaly_status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <div className="flex items-center justify-end gap-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto">
                        {view === "trash" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRestore(video.id)}
                              disabled={isOperating !== null}
                              className="text-[12px] text-[#6FAA7D] underline-offset-4 hover:underline disabled:opacity-50"
                            >
                              恢复
                            </button>
                            {permissionInfo.businessRole === "owner" && (() => {
                              const eligible = isPurgeEligible(video.trashed_at ?? null);
                              const tooltip = getPurgeTooltip(video.trashed_at ?? null);
                              return (
                                <button
                                  type="button"
                                  onClick={() => setConfirmPurgeVideoId(video.id)}
                                  disabled={!eligible || isOperating !== null}
                                  title={tooltip || undefined}
                                  className="text-[12px] text-[#C9604D] underline-offset-4 hover:underline disabled:text-stone-400 disabled:no-underline disabled:cursor-not-allowed"
                                >
                                  永久删除
                                </button>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            {showPatchButton ? (
                              <button
                                type="button"
                                onClick={() => setPatchingVideoId(video.id)}
                                className="text-[12px] text-[#D97757] underline-offset-4 hover:underline"
                              >
                                补录24h
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setSelectedVideoId(video.id)}
                              className="text-[12px] text-stone-700 underline-offset-4 hover:text-stone-900 hover:underline"
                            >
                              查看详情
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={view === "trash" ? 6 : 9} className="px-4 py-16 text-center text-[13px] text-stone-500">
                  当前筛选条件下暂无视频数据。
                </TableCell>
              </TableRow>
            )}

            {/* Sentinel for auto-load */}
            {hasMore && (
              <TableRow>
                <TableCell colSpan={view === "trash" ? 6 : 9} className="p-0">
                  <div ref={sentinelRef} className="h-4" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Load more button (manual fallback + visual anchor) */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 rounded-xl border-stone-200 px-6 text-[13px] text-stone-500 hover:bg-stone-50 hover:text-stone-700"
            onClick={() => {
              if (hasDeferredData && onLoadDeferredData) {
                void onLoadDeferredData();
                return;
              }
              setIsLoadingMore(true);
              setTimeout(() => {
                setLoadedCount((c) => c + PAGE_SIZE);
                setIsLoadingMore(false);
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
                  (已加载 {Math.min(loadedCount, filteredVideos.length)} / 共 {hasDeferredData ? totalCount ?? filteredVideos.length : filteredVideos.length} 条)
                </span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* End state */}
      {!hasMore && filteredVideos.length > 0 && (
        <div className="mt-4 text-center text-[12px] text-stone-500">
          已加载全部 {filteredVideos.length} 条视频
        </div>
      )}

      <VideoDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVideoId(null);
          }
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        tags={selectedVideo ? tagMap.get(selectedVideo.id) ?? [] : []}
        assetRecord={selectedVideo ? assetLibraryState[selectedVideo.id] ?? null : null}
        onTagsSaved={(tags) => {
          setTagRows((current) => {
            const rest = current.filter((tag) => tag.video_id !== selectedVideo?.id || !tags.some((saved) => saved.tag_dimension === tag.tag_dimension));
            return [...rest, ...tags];
          });
        }}
        onAssetSaved={(videoId, record) => {
          setAssetLibraryState((current) => ({ ...current, [videoId]: record }));
        }}
        permissionInfo={permissionInfo}
        onLifecycleChanged={() => {
          setSelectedVideoId(null);
          onRefresh();
        }}
      />

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

      {confirmPurgeVideoId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-semibold text-stone-900">永久删除确认</h3>
            <p className="mt-2 text-sm text-stone-500 leading-relaxed">
              将永久隐藏该作品，并清理可确认归属的存储截图；指标、复盘结论和操作历史仍会保留。此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="active:translate-y-0 h-9 rounded-xl border border-stone-200 px-4 text-stone-700 hover:bg-stone-50 text-[12px] font-medium transition-colors"
                onClick={() => setConfirmPurgeVideoId(null)}
                disabled={isOperating !== null}
              >
                取消
              </button>
              <button
                type="button"
                className="active:translate-y-0 h-9 rounded-xl bg-[#C9604D] hover:bg-[#B34F3C] text-white px-4 text-[12px] font-medium transition-colors disabled:opacity-50"
                onClick={() => handlePurge(confirmPurgeVideoId)}
                disabled={isOperating !== null}
              >
                {isOperating ? "正在删除..." : "确定永久删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

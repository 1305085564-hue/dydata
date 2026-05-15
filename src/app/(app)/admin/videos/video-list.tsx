"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
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
import { getTagReviewStatus, isVideoMatchedByTagFilters } from "@/lib/video-tags";
import type { Profile, Video, VideoMetricsSnapshot, VideoTag } from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

interface VideoListProps {
  videos: VideoRow[];
  snapshots: VideoMetricsSnapshot[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  videoTags: VideoTag[];
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "border-zinc-200 bg-zinc-50 text-[#6FAA7D]",
  删稿: "border-zinc-200 bg-zinc-50 text-[#C9604D]",
  限流: "border-zinc-200 bg-zinc-50 text-[#C9604D]",
  投流: "border-zinc-200 bg-zinc-50 text-[#D99E55]",
  活动干预: "border-zinc-200 bg-zinc-50 text-[#D99E55]",
  "未满24h": "border-zinc-200 bg-zinc-50 text-zinc-500",
};

const PAGE_SIZE = 50;

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

export function VideoList({ videos, snapshots, profiles, accounts, videoTags }: VideoListProps) {
  const [filters, setFilters] = useState<VideoFilterValue>({
    profileId: "all",
    accountId: "all",
    startDate: "",
    endDate: "",
    status: "all",
    topicTags: [],
    formatTags: [],
    ctaTags: [],
  });
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [patchingVideoId, setPatchingVideoId] = useState<string | null>(null);
  const [videoRows, setVideoRows] = useState(videos);
  const [snapshotRows, setSnapshotRows] = useState(snapshots);
  const [tagRows, setTagRows] = useState(videoTags);
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

      return isVideoMatchedByTagFilters(tagMap.get(video.id) ?? [], filters);
    });
  }, [filters, sortedVideos, tagMap]);

  const visibleVideos = useMemo(() => filteredVideos.slice(0, loadedCount), [filteredVideos, loadedCount]);
  const hasMore = loadedCount < filteredVideos.length;

  const handleFilter = useCallback((value: VideoFilterValue) => {
    setFilters(value);
    setLoadedCount(PAGE_SIZE);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* Intersection Observer for auto-load */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
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
  }, [hasMore, isLoadingMore, loadedCount, filteredVideos.length]);

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
    <div className="space-y-4">
      <VideoFilters profiles={profiles} accounts={accounts} onFilter={handleFilter} />

      <div
        ref={tableContainerRef}
        className="overflow-x-auto overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-sm"
        style={{ maxHeight: "70vh" }}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-b border-zinc-200 bg-zinc-50 hover:bg-zinc-50">
              <TableHead className="h-9 px-4 text-[12px] font-medium text-zinc-500">视频标题</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">账号</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">负责人</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">发布时间</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">24h播放量</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">互动率(%)</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">涨粉</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">状态</TableHead>
              <TableHead className="h-9 px-4 text-right text-[12px] font-medium text-zinc-500">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleVideos.length ? (
              visibleVideos.map((video) => {
                const snapshot = snapshotMap.get(video.id) ?? null;
                const tags = tagMap.get(video.id) ?? [];
                const showPatchButton = shouldShowPatch24hButton(video, snapshot);

                return (
                  <TableRow key={video.id} data-video-id={video.id} className="hover:bg-zinc-50">
                    <TableCell className="max-w-[280px] whitespace-normal px-4 align-top">
                      <div className="line-clamp-2 text-[13px] font-medium text-zinc-800">
                        {video.video_title?.trim() || "未命名视频"}
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{video.accounts.name}</TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{video.profiles.name}</TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{formatDateTime(video.published_at)}</TableCell>
                    <TableCell className="text-[12px] text-zinc-700 font-mono tabular-nums">{formatNumber(snapshot?.play_count)}</TableCell>
                    <TableCell className="text-[12px] text-zinc-700 font-mono tabular-nums">{formatPercent(snapshot ? interactionRate(snapshot) : null)}</TableCell>
                    <TableCell className="text-[12px] text-zinc-700 font-mono tabular-nums">{formatNumber(snapshot?.follower_gain)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className={`text-[12px] ${statusClassName[video.anomaly_status]}`}>
                          {video.anomaly_status}
                        </Badge>
                        {tags.some((tag) => getTagReviewStatus(tag.confidence) === "待确认") ? (
                          <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-[12px] text-[#D99E55]">
                            标签待确认
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <div className="flex items-center justify-end gap-4">
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
                          className="text-[12px] text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
                        >
                          查看详情
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="px-4 py-16 text-center text-[13px] text-zinc-500">
                  当前筛选条件下暂无视频数据。
                </TableCell>
              </TableRow>
            )}

            {/* Sentinel for auto-load */}
            {hasMore && (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
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
            className="h-10 gap-1.5 rounded-xl border-zinc-200 px-6 text-[13px] text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
            onClick={() => {
              setIsLoadingMore(true);
              setTimeout(() => {
                setLoadedCount((c) => c + PAGE_SIZE);
                setIsLoadingMore(false);
              }, 200);
            }}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                加载中…
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                加载更多
                <span className="ml-1 text-[11px] text-zinc-400">
                  ({filteredVideos.length - loadedCount} 条剩余)
                </span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* End state */}
      {!hasMore && filteredVideos.length > 0 && (
        <div className="mt-4 text-center text-[12px] text-zinc-400">
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
        onTagsSaved={(tags) => {
          setTagRows((current) => {
            const rest = current.filter((tag) => tag.video_id !== selectedVideo?.id || !tags.some((saved) => saved.tag_dimension === tag.tag_dimension));
            return [...rest, ...tags];
          });
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
    </div>
  );
}

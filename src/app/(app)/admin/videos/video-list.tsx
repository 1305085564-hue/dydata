"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
      <VideoFilters profiles={profiles} accounts={accounts} onFilter={setFilters} />

      <div className="overflow-hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
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
            {filteredVideos.length ? (
              filteredVideos.map((video) => {
                const snapshot = snapshotMap.get(video.id) ?? null;
                const tags = tagMap.get(video.id) ?? [];
                const showPatchButton = shouldShowPatch24hButton(video, snapshot);

                return (
                  <TableRow key={video.id} className="hover:bg-zinc-50">
                    <TableCell className="max-w-[280px] whitespace-normal px-4 align-top">
                      <div className="line-clamp-2 text-[13px] font-medium text-zinc-800">
                        {video.video_title?.trim() || "未命名视频"}
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{video.accounts.name}</TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{video.profiles.name}</TableCell>
                    <TableCell className="text-[12px] text-zinc-500">{formatDateTime(video.published_at)}</TableCell>
                    <TableCell className="text-[12px] text-zinc-700">{formatNumber(snapshot?.play_count)}</TableCell>
                    <TableCell className="text-[12px] text-zinc-700">{formatPercent(snapshot ? interactionRate(snapshot) : null)}</TableCell>
                    <TableCell className="text-[12px] text-zinc-700">{formatNumber(snapshot?.follower_gain)}</TableCell>
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
          </TableBody>
        </Table>
      </div>

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

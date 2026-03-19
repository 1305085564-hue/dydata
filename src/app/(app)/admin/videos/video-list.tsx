"use client";

import { useMemo, useState } from "react";
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
import { VideoFilters, type VideoFilterValue } from "./video-filters";
import { VideoDetailDialog } from "./video-detail-dialog";
import { Patch24hDialog } from "./patch-24h-dialog";
import { interactionRate } from "@/lib/video-metrics";
import { shouldShowPatch24hButton } from "@/lib/video-admin";
import type { Profile, Video, VideoMetricsSnapshot } from "@/types";

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
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "border-emerald-200 bg-emerald-50 text-emerald-700",
  删稿: "border-red-200 bg-red-50 text-red-700",
  限流: "border-red-200 bg-red-50 text-red-700",
  投流: "border-amber-200 bg-amber-50 text-amber-700",
  活动干预: "border-amber-200 bg-amber-50 text-amber-700",
  "未满24h": "border-slate-200 bg-slate-100 text-slate-600",
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

export function VideoList({ videos, snapshots, profiles, accounts }: VideoListProps) {
  const [filters, setFilters] = useState<VideoFilterValue>({
    profileId: "all",
    accountId: "all",
    startDate: "",
    endDate: "",
    status: "all",
  });
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [patchingVideoId, setPatchingVideoId] = useState<string | null>(null);
  const [videoRows, setVideoRows] = useState(videos);
  const [snapshotRows, setSnapshotRows] = useState(snapshots);

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
    <div className="space-y-5">
      <VideoFilters profiles={profiles} accounts={accounts} onFilter={setFilters} />

      <div className="overflow-x-auto rounded-[28px] border border-border/60 bg-background/80 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">视频标题</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead>发布时间</TableHead>
              <TableHead>24h播放量</TableHead>
              <TableHead>互动率(%)</TableHead>
              <TableHead>涨粉</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="px-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVideos.length ? (
              filteredVideos.map((video) => {
                const snapshot = snapshotMap.get(video.id) ?? null;
                const showPatchButton = shouldShowPatch24hButton(video, snapshot);

                return (
                  <TableRow key={video.id}>
                    <TableCell className="max-w-[280px] px-4 align-top whitespace-normal">
                      <div className="space-y-1">
                        <div className="line-clamp-2 font-medium text-foreground">
                          {video.video_title?.trim() || "未命名视频"}
                        </div>
                        <div className="text-xs text-muted-foreground">{video.id.slice(0, 8)}</div>
                      </div>
                    </TableCell>
                    <TableCell>{video.accounts.name}</TableCell>
                    <TableCell>{video.profiles.name}</TableCell>
                    <TableCell>{formatDateTime(video.published_at)}</TableCell>
                    <TableCell>{formatNumber(snapshot?.play_count)}</TableCell>
                    <TableCell>{formatPercent(snapshot ? interactionRate(snapshot) : null)}</TableCell>
                    <TableCell>{formatNumber(snapshot?.follower_gain)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClassName[video.anomaly_status]}>
                        {video.anomaly_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                        {showPatchButton ? (
                          <Button
                            variant="secondary"
                            className="rounded-2xl"
                            onClick={() => setPatchingVideoId(video.id)}
                          >
                            补录24h数据
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          className="rounded-2xl bg-muted/40"
                          onClick={() => setSelectedVideoId(video.id)}
                        >
                          查看详情
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
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

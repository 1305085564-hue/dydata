"use client";

import { useCallback, useMemo, useState } from "react";
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
import { ContentFilters, type ContentFilterValue } from "./content-filters";
import { ContentDetailDialog } from "./content-detail-dialog";
import { getSampleCredibility } from "@/lib/next-day-review";
import type { Profile, Video, VideoMetricsSnapshot } from "@/types";

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
  reviewedVideoIds: string[];
}

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "border-emerald-200 bg-emerald-50 text-emerald-700",
  删稿: "border-red-200 bg-red-50 text-red-700",
  限流: "border-red-200 bg-red-50 text-red-700",
  投流: "border-amber-200 bg-amber-50 text-amber-700",
  活动干预: "border-amber-200 bg-amber-50 text-amber-700",
  "未满24h": "border-slate-200 bg-slate-100 text-slate-600",
};

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

export function ContentList({
  videos,
  snapshots,
  profiles,
  accounts,
  reviewedVideoIds,
}: ContentListProps) {
  const [filters, setFilters] = useState<ContentFilterValue>({
    profileId: "all",
    accountId: "all",
    startDate: "",
    endDate: "",
    status: "all",
    hasSnapshot: "all",
    reviewed: "all",
  });
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [localReviewedIds, setLocalReviewedIds] = useState<Set<string>>(
    () => new Set(reviewedVideoIds)
  );

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

  const handleFilter = useCallback((value: ContentFilterValue) => {
    setFilters(value);
  }, []);

  const filtered = useMemo(() => {
    return videos.filter((video) => {
      if (filters.profileId !== "all" && video.user_id !== filters.profileId) return false;
      if (filters.accountId !== "all" && video.account_id !== filters.accountId) return false;
      if (filters.status !== "all" && video.anomaly_status !== filters.status) return false;
      if (filters.startDate) {
        const pub = video.published_at?.slice(0, 10) ?? "";
        if (pub < filters.startDate) return false;
      }
      if (filters.endDate) {
        const pub = video.published_at?.slice(0, 10) ?? "";
        if (pub > filters.endDate) return false;
      }
      const hasSnap = snapshotMap.has(video.id);
      if (filters.hasSnapshot === "yes" && !hasSnap) return false;
      if (filters.hasSnapshot === "no" && hasSnap) return false;
      const isReviewed = localReviewedIds.has(video.id);
      if (filters.reviewed === "yes" && !isReviewed) return false;
      if (filters.reviewed === "no" && isReviewed) return false;
      return true;
    });
  }, [videos, filters, snapshotMap, localReviewedIds]);

  const selectedVideo = selectedVideoId ? (videos.find((v) => v.id === selectedVideoId) ?? null) : null;
  const selectedSnapshot = selectedVideoId ? (snapshotMap.get(selectedVideoId) ?? null) : null;

  return (
    <div className="space-y-4">
      <ContentFilters profiles={profiles} accounts={accounts} onFilter={handleFilter} />

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/40">
              <TableHead className="min-w-[200px] text-xs">标题</TableHead>
              <TableHead className="text-xs">人员</TableHead>
              <TableHead className="text-xs">账号</TableHead>
              <TableHead className="text-xs">发布时间</TableHead>
              <TableHead className="text-right text-xs">播放</TableHead>
              <TableHead className="text-right text-xs">2s跳出</TableHead>
              <TableHead className="text-right text-xs">5s完播</TableHead>
              <TableHead className="text-xs">样本状态</TableHead>
              <TableHead className="text-xs">异常状态</TableHead>
              <TableHead className="text-xs">复盘状态</TableHead>
              <TableHead className="text-xs"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                  暂无内容
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((video) => {
                const snap = snapshotMap.get(video.id);
                const sample = getSampleCredibility(snap?.play_count ?? null, video.anomaly_status);
                const isReviewed = localReviewedIds.has(video.id);
                return (
                  <TableRow key={video.id} className="border-b border-border/30 hover:bg-muted/20">
                    <TableCell className="max-w-[240px] py-3">
                      <div className="line-clamp-2 text-sm font-medium">
                        {video.video_title || video.content?.slice(0, 30) || "（无标题）"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {video.profiles.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {video.accounts.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(video.published_at ?? video.created_at)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {snap ? formatNumber(snap.play_count) : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {snap ? formatRate(snap.bounce_rate_2s) : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {snap ? formatRate(snap.completion_rate_5s) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {sample.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusClassName[video.anomaly_status]}`}
                      >
                        {video.anomaly_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isReviewed ? (
                        <Badge variant="outline" className="border-violet-200 bg-violet-50 text-xs text-violet-700">
                          已复盘
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">未复盘</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-3 text-xs"
                        onClick={() => setSelectedVideoId(video.id)}
                      >
                        查看复盘
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ContentDetailDialog
        open={selectedVideo !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedVideoId(null);
        }}
        video={selectedVideo}
        snapshot={selectedSnapshot}
        isReviewed={selectedVideoId ? localReviewedIds.has(selectedVideoId) : false}
        onReviewed={(videoId) => {
          setLocalReviewedIds((prev) => new Set([...prev, videoId]));
        }}
      />
    </div>
  );
}

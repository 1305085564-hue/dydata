"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getShanghaiDateString } from "@/lib/remind-submission";
import type { ContentFeedbackCardView, ContentReviewReadiness, Video, VideoMetricsSnapshot } from "@/types";
import { ArrowDown, CalendarClock, Check, ChevronDown, UserRound } from "lucide-react";
import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

type QueueSortMode = "priority" | "user" | "latest";

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

const PAGE_SIZE = 30;

const statusClassName: Record<Video["anomaly_status"], string> = {
  normal: "border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] text-[#6FAA7D]",
  abnormal: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  正常: "border-[#6FAA7D]/20 bg-[#6FAA7D]/[0.04] text-[#6FAA7D]",
  删稿: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  限流: "border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[#C9604D]",
  投流: "border-[#D99E55]/20 bg-[#D99E55]/[0.04] text-[#D99E55]",
  活动干预: "border-[#D99E55]/20 bg-[#D99E55]/[0.04] text-[#D99E55]",
  "未满24h": "border-zinc-200 bg-zinc-100/50 text-zinc-500",
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
  return toShanghaiDateKey(video.uploaded_at ?? video.published_at ?? video.created_at);
}

function getVideoUploadTimestamp(video: VideoRow) {
  const raw = video.uploaded_at ?? video.published_at ?? video.created_at;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function getMetricWarningReasons(snapshot: VideoMetricsSnapshot | undefined, thresholds: VideoReviewThresholds) {
  const reasons: string[] = [];
  if (!snapshot) return ["缺少 24h 快照"];
  if (snapshot.play_count != null && snapshot.play_count < thresholds.play_count) {
    reasons.push(`播放 ${formatNumber(snapshot.play_count)}`);
  }
  if (snapshot.bounce_rate_2s != null && snapshot.bounce_rate_2s > thresholds.bounce_rate_2s) {
    reasons.push(`2s跳出 ${formatRate(snapshot.bounce_rate_2s)}`);
  }
  if (snapshot.completion_rate_5s != null && snapshot.completion_rate_5s < thresholds.completion_rate_5s) {
    reasons.push(`5s完播 ${formatRate(snapshot.completion_rate_5s)}`);
  }
  if (snapshot.avg_play_duration != null && snapshot.avg_play_duration < thresholds.avg_play_duration) {
    reasons.push(`均播 ${snapshot.avg_play_duration.toFixed(1)}s`);
  }
  if (snapshot.completion_rate != null && snapshot.completion_rate < thresholds.completion_rate) {
    reasons.push(`完播 ${formatRate(snapshot.completion_rate)}`);
  }
  return reasons;
}

function getPriorityScore(
  video: VideoRow,
  snapshot: VideoMetricsSnapshot | undefined,
  card: ContentFeedbackCardView | undefined,
  readiness: ContentReviewReadiness | undefined,
  thresholds: VideoReviewThresholds,
) {
  let score = 0;
  if (video.anomaly_status === "删稿" || video.anomaly_status === "限流") score += 1000;
  if (video.play_change_signal === "halve") score += 800;
  if (video.play_change_signal === "surge") score += 400;
  if (video.anomaly_status === "投流" || video.anomaly_status === "活动干预") score += 200;
  if ((card?.workflow_status ?? "not_started") === "not_started") score += 120;
  if (readiness?.status === "ready") score += 60;
  score += getMetricWarningReasons(snapshot, thresholds).length * 80;
  return score;
}

export function ContentList({
  videos,
  snapshots,
  feedbackCards,
  reviewReadiness,
  totalCount,
  hasDeferredData = false,
  isDeferredDataLoading = false,
  onLoadDeferredData,
  onSelectVideoId,
}: ContentListProps) {
  const [sortMode, setSortMode] = useState<QueueSortMode>("priority");
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);
  const [thresholds, setThresholds] = useState<VideoReviewThresholds>(DEFAULT_VIDEO_REVIEW_THRESHOLDS);

  useEffect(() => {
    fetch("/api/admin/settings/thresholds")
      .then((res) => res.json())
      .then((data) => {
        if (data?.thresholds) setThresholds(data.thresholds);
      })
      .catch(() => {});
  }, []);

  const snapshotMap = useMemo(() => {
    const map = new Map<string, VideoMetricsSnapshot>();
    for (const snapshot of snapshots) {
      if (snapshot.snapshot_type !== "24h") continue;
      const existing = map.get(snapshot.video_id);
      const nextTs = new Date(snapshot.captured_at).getTime();
      const currentTs = existing ? new Date(existing.captured_at).getTime() : -Infinity;
      if (!existing || nextTs > currentTs) map.set(snapshot.video_id, snapshot);
    }
    return map;
  }, [snapshots]);

  const queueRows = useMemo(() => {
    const today = getShanghaiDateString();
    const rows = videos.filter((video) => {
      const cardStatus = feedbackCards[video.id]?.workflow_status ?? "not_started";
      const isToday = getVideoUploadDateKey(video) === today;
      const hasStrongSignal =
        video.anomaly_status === "删稿" ||
        video.anomaly_status === "限流" ||
        video.play_change_signal === "halve";
      return isToday || hasStrongSignal || cardStatus === "not_started";
    });

    return [...rows].sort((left, right) => {
      if (sortMode === "user") {
        const nameDiff = (left.profiles?.name || "").localeCompare(right.profiles?.name || "", "zh");
        if (nameDiff !== 0) return nameDiff;
        return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
      }
      if (sortMode === "latest") {
        return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
      }
      const leftScore = getPriorityScore(left, snapshotMap.get(left.id), feedbackCards[left.id], reviewReadiness[left.id], thresholds);
      const rightScore = getPriorityScore(right, snapshotMap.get(right.id), feedbackCards[right.id], reviewReadiness[right.id], thresholds);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return getVideoUploadTimestamp(right) - getVideoUploadTimestamp(left);
    });
  }, [feedbackCards, reviewReadiness, snapshotMap, sortMode, thresholds, videos]);

  const visibleRows = queueRows.slice(0, loadedCount);
  const hasMoreLocal = loadedCount < queueRows.length;
  const hasMore = hasMoreLocal || hasDeferredData;

  const loadMore = useCallback(() => {
    if (hasDeferredData && onLoadDeferredData) {
      void onLoadDeferredData();
      return;
    }
    setLoadedCount((count) => count + PAGE_SIZE);
  }, [hasDeferredData, onLoadDeferredData]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xs">
        <div>
          <p className="text-[13px] font-semibold text-zinc-900">今日待盘队列</p>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            当前 <span className="tabular-nums font-medium text-zinc-700">{queueRows.length}</span> 条，素材总数 <span className="tabular-nums font-medium text-zinc-700">{totalCount ?? videos.length}</span> 条
            <span className="mx-1.5 text-zinc-300">·</span>
            <Link
              href="/admin/videos"
              className="text-zinc-500 hover:text-zinc-900 underline decoration-zinc-300 transition-colors"
            >
              前往素材库（全量账本）→
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100/70 p-0.5">
          {([
            ["priority", "按最差"],
            ["user", "按人"],
            ["latest", "按时间"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setSortMode(mode);
                setLoadedCount(PAGE_SIZE);
              }}
              className={[
                "inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium transition-colors",
                sortMode === mode ? "bg-white text-zinc-950 shadow-2xs" : "text-zinc-500 hover:text-zinc-800",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        {visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center shadow-2xs">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 mb-3">
              <Check className="size-5 text-[#6FAA7D]" />
            </div>
            <p className="text-[14px] font-semibold text-zinc-900">今日待复盘已清完</p>
            <p className="mt-1 text-[12px] text-zinc-500">当前没有需要紧急复盘的异常视频，干得漂亮！</p>
          </div>
        ) : (
          visibleRows.map((video, index) => {
            const snapshot = snapshotMap.get(video.id);
            const card = feedbackCards[video.id];
            const readiness = reviewReadiness[video.id];
            const priorityReasons = getMetricWarningReasons(snapshot, thresholds).slice(0, 3);
            const score = getPriorityScore(video, snapshot, card, readiness, thresholds);
            return (
              <button
                key={video.id}
                type="button"
                onClick={() => onSelectVideoId(video.id)}
                className="group grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-all hover:border-zinc-300 hover:bg-zinc-50/50 hover:shadow-2xs sm:grid-cols-[44px_1fr_auto]"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-100 text-[13px] font-semibold tabular-nums text-zinc-700">
                  {index + 1}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[12px] font-medium ${statusClassName[video.anomaly_status]}`}>
                      {video.anomaly_status}
                    </Badge>
                    {video.play_change_signal === "halve" ? (
                      <Badge variant="outline" className="border-[#C9604D]/20 bg-[#C9604D]/[0.04] text-[12px] font-medium text-[#C9604D]">
                        播放腰斩
                      </Badge>
                    ) : null}
                    {card?.workflow_status === "draft" || card?.workflow_status === "confirmed" ? (
                      <Badge variant="outline" className="border-[#D99E55]/20 bg-[#D99E55]/[0.04] text-[12px] font-medium text-[#D99E55]">
                        已存草稿
                      </Badge>
                    ) : null}
                    {readiness ? (
                      <span className="text-[12px] text-zinc-400 font-normal">{readiness.label}</span>
                    ) : null}
                  </div>
                  <div>
                    <p className="truncate text-[14px] font-medium text-zinc-900">
                      {video.video_title || video.content?.slice(0, 42) || "未命名视频"}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3.5 text-zinc-400" />
                        {video.profiles?.name || "未知"} · {video.accounts?.name || "未知账号"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5 text-zinc-400" />
                        {formatDateTime(video.published_at ?? video.uploaded_at ?? video.created_at)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {priorityReasons.length > 0 ? (
                      priorityReasons.map((reason) => (
                        <span key={reason} className="rounded-md border border-[#C9604D]/20 bg-[#C9604D]/[0.04] px-2 py-0.5 text-[11px] font-medium text-[#C9604D]">
                          {reason}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500">
                        暂无明显指标异常
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 tabular-nums">
                    <ArrowDown className="size-3.5 text-zinc-400" />
                    权重 {score}
                  </span>
                  <span className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors group-hover:bg-[#D97757]">
                    复盘
                  </span>
                </div>
              </button>
            );
          })
        )}

        {isDeferredDataLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : null}
      </div>

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={isDeferredDataLoading}
            className="gap-1.5 text-[12px]"
          >
            <ChevronDown className="size-3.5" />
            {isDeferredDataLoading ? "加载中..." : `加载更多（${Math.min(loadedCount, queueRows.length)} / ${hasDeferredData ? totalCount ?? queueRows.length : queueRows.length}）`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

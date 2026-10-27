"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getContentQualityStatusShortText } from "@/lib/collaboration/content-quality-contract";
import { getStatusDot } from "@/lib/content/domain/content-list";
import type { VideoMetricsSnapshot } from "@/types";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import { cn } from "@/lib/utils";
import {
  buildCapsuleFilters,
  compareWithNullsLast,
  formatCount,
  formatPercent,
  type PulseCap,
  type PulseVideoRow,
  type SortDirection,
} from "./pulse-filters";
import { filterContentVideos } from "../content/content-list-filters";

interface PulseVideoListProps {
  date: string;
  selectedCap: PulseCap;
  onSelectCap: (cap: PulseCap) => void;
  dayVideos: PulseVideoRow[];
  snapshotByVideoId: Map<string, VideoMetricsSnapshot>;
  contentQualityByVideoId: Record<string, WorkContentQuality>;
}

type VideoSortField = "playCount" | "bounceRate2s" | "completionRate5s";

export function PulseVideoList({
  date,
  selectedCap,
  onSelectCap,
  dayVideos,
  snapshotByVideoId,
  contentQualityByVideoId,
}: PulseVideoListProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<VideoSortField>("playCount");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const playCountById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const [id, snap] of snapshotByVideoId.entries()) {
      map.set(id, snap.play_count ?? null);
    }
    return map;
  }, [snapshotByVideoId]);

  // 计算四个胶囊对应的视频列表与计数
  const capsuleVideos = useMemo(() => {
    return {
      all: filterContentVideos(
        dayVideos,
        buildCapsuleFilters(date, "all"),
        playCountById,
        contentQualityByVideoId
      ),
      hot: filterContentVideos(
        dayVideos,
        buildCapsuleFilters(date, "hot"),
        playCountById,
        contentQualityByVideoId
      ),
      anomaly: filterContentVideos(
        dayVideos,
        buildCapsuleFilters(date, "anomaly"),
        playCountById,
        contentQualityByVideoId
      ),
      unrated: filterContentVideos(
        dayVideos,
        buildCapsuleFilters(date, "unrated"),
        playCountById,
        contentQualityByVideoId
      ),
    };
  }, [dayVideos, date, playCountById, contentQualityByVideoId]);

  const currentVideos = capsuleVideos[selectedCap] ?? capsuleVideos.all;

  const handleSort = (field: VideoSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedVideos = useMemo(() => {
    return [...currentVideos].sort((a, b) => {
      const snapA = snapshotByVideoId.get(a.id);
      const snapB = snapshotByVideoId.get(b.id);
      let valA: number | null = null;
      let valB: number | null = null;

      if (sortField === "playCount") {
        valA = snapA?.play_count ?? null;
        valB = snapB?.play_count ?? null;
      } else if (sortField === "bounceRate2s") {
        valA = snapA?.bounce_rate_2s ?? null;
        valB = snapB?.bounce_rate_2s ?? null;
      } else if (sortField === "completionRate5s") {
        valA = snapA?.completion_rate_5s ?? null;
        valB = snapB?.completion_rate_5s ?? null;
      }

      return compareWithNullsLast(valA, valB, sortDir);
    });
  }, [currentVideos, snapshotByVideoId, sortField, sortDir]);

  const capsules: Array<{ key: PulseCap; label: string; count: number }> = [
    { key: "all", label: "全部", count: capsuleVideos.all.length },
    { key: "hot", label: "🔥 昨日爆款", count: capsuleVideos.hot.length },
    { key: "anomaly", label: "⚠️ 昨日异常", count: capsuleVideos.anomaly.length },
    { key: "unrated", label: "未评级", count: capsuleVideos.unrated.length },
  ];

  const renderSortHeader = (field: VideoSortField, label: string) => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={cn(
          "inline-flex items-center gap-1 text-[12px] transition-colors cursor-pointer",
          isActive ? "text-[#141413]" : "text-[#78716C] hover:text-[#141413]"
        )}
      >
        <span>{label}</span>
        {isActive && (
          <span className="text-[#A8A29E] font-normal">
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    );
  };

  const getEmptyTitle = () => {
    if (dayVideos.length === 0) return "该日无发布作品";
    if (selectedCap === "hot") return "该日没有命中「爆款」的作品";
    if (selectedCap === "anomaly") return "该日没有命中「异常」的作品";
    if (selectedCap === "unrated") return "该日没有「未评级」的作品";
    return "该日无发布作品";
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 胶囊栏 */}
      <div className="flex flex-wrap items-center gap-2">
        {capsules.map((cap) => {
          const isSelected = selectedCap === cap.key;
          return (
            <button
              key={cap.key}
              type="button"
              onClick={() => onSelectCap(cap.key)}
              className={cn(
                "rounded-md px-3 py-2 text-[14px] transition-colors duration-150 shadow-input border cursor-pointer select-none",
                isSelected
                  ? "bg-[#EBEBE9] border-[#E2E2DF] text-[#141413]"
                  : "bg-white border-[#E2E2DF] text-[#1F1E1D] font-normal hover:bg-[#F7F7F6]"
              )}
            >
              <span>{cap.label}</span>
              <span className="ml-1 tabular-nums text-[12px] text-[#78716C]">
                {cap.count}
              </span>
            </button>
          );
        })}
      </div>

      {sortedVideos.length === 0 ? (
        <EmptyState
          variant="compact"
          title={getEmptyTitle()}
          description="可切换上方日历查看其他日期。"
        />
      ) : (
        <>
          {/* 移动端卡片列表 (<768px) */}
          <div className="md:hidden w-full bg-white rounded-xl shadow-card-ring border border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60 overflow-hidden">
            {sortedVideos.map((video) => {
              const snap = snapshotByVideoId.get(video.id);
              const quality = contentQualityByVideoId[video.id];
              const grade = quality?.overallGrade;
              const dot = getStatusDot(video);

              return (
                <div
                  key={video.id}
                  onClick={() => router.push(`/admin/content?videoId=${video.id}`)}
                  className="flex flex-col gap-1 p-3 hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors cursor-pointer select-none"
                >
                  {/* 第 1 层：徽标 + 评级 + 日期 */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                      <Badge variant={dot.variant} className="shrink-0 text-[12px] px-1.5 py-0.5">
                        {dot.label}
                      </Badge>
                      {grade ? (
                        <span
                          className={cn(
                            "text-[12px] tabular-nums font-normal shrink-0",
                            BREAKOUT_GRADE_TEXT_CLASS[grade]
                          )}
                        >
                          {grade}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#A8A29E] shrink-0">
                          {getContentQualityStatusShortText(
                            quality?.status ?? "pending_snapshot"
                          )}
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] tabular-nums text-[#78716C] font-normal">
                      {video.published_at?.slice(0, 10) ?? "—"}
                    </span>
                  </div>

                  {/* 第 2 层：标题 button + 账号 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/admin/content?videoId=${video.id}`);
                    }}
                    aria-label={`查看作品详情：${video.video_title || video.content?.slice(0, 50) || "未命名视频"}${video.accounts?.name ? `（${video.accounts.name}）` : ""}`}
                    className="w-full text-left text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-sm outline-none focus-visible:underline focus-visible:decoration-[#141413] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer line-clamp-2 leading-snug py-1"
                  >
                    {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                  </button>
                  {video.accounts?.name && (
                    <div className="text-[12px] text-[#78716C] font-normal truncate">
                      @{video.accounts.name}
                    </div>
                  )}

                  {/* 第 3 层：播放 · 2s留存 · 5s完播 */}
                  <div className="grid grid-cols-3 gap-2 border-t border-[#E2E2DF]/50 pt-2 mt-1 text-center">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">播放</span>
                      <span className="text-[12px] tabular-nums font-normal text-[#1F1E1D] truncate">
                        {snap?.play_count != null ? (
                          formatCount(snap.play_count)
                        ) : (
                          <span className="text-[#A8A29E]">—</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">2s留存</span>
                      <span className="text-[12px] tabular-nums font-normal text-[#1F1E1D] truncate">
                        {snap?.bounce_rate_2s != null ? (
                          formatPercent(snap.bounce_rate_2s)
                        ) : (
                          <span className="text-[#A8A29E]">—</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">5s完播</span>
                      <span className="text-[12px] tabular-nums font-normal text-[#1F1E1D] truncate">
                        {snap?.completion_rate_5s != null ? (
                          formatPercent(snap.completion_rate_5s)
                        ) : (
                          <span className="text-[#A8A29E]">—</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 桌面端表格 (≥768px) */}
          <Card className="hidden md:block rounded-xl shadow-card-ring bg-white overflow-hidden p-0">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-20">状态</TableHead>
                    <TableHead className="w-[35%]">标题与账号</TableHead>
                    <TableHead className="w-20">评级</TableHead>
                    <TableHead className="text-right">
                      {renderSortHeader("playCount", "播放")}
                    </TableHead>
                    <TableHead className="text-right">
                      {renderSortHeader("bounceRate2s", "2s留存")}
                    </TableHead>
                    <TableHead className="text-right">
                      {renderSortHeader("completionRate5s", "5s完播")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVideos.map((video) => {
                    const snap = snapshotByVideoId.get(video.id);
                    const quality = contentQualityByVideoId[video.id];
                    const grade = quality?.overallGrade;
                    const dot = getStatusDot(video);

                    return (
                      <TableRow
                        key={video.id}
                        onClick={() => router.push(`/admin/content?videoId=${video.id}`)}
                        className="cursor-pointer hover:bg-[#F7F7F6] transition-colors group"
                      >
                        {/* 状态徽标 */}
                        <TableCell>
                          <Badge variant={dot.variant} className="shrink-0">
                            {dot.label}
                          </Badge>
                        </TableCell>

                        {/* 标题 + 账号 */}
                        <TableCell>
                          <div className="flex items-center gap-1 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/admin/content?videoId=${video.id}`);
                              }}
                              aria-label={`查看作品详情：${video.video_title || video.content?.slice(0, 50) || "未命名视频"}${video.accounts?.name ? `（${video.accounts.name}）` : ""}`}
                              className="truncate text-left text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-sm outline-none focus-visible:underline focus-visible:decoration-[#141413] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer"
                            >
                              {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                            </button>
                            {video.accounts?.name && (
                              <span className="shrink-0 text-[12px] text-[#78716C] font-normal truncate max-w-[120px]">
                                · {video.accounts.name}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 评级 */}
                        <TableCell>
                          {grade ? (
                            <span
                              className={cn(
                                "text-[14px] font-normal",
                                BREAKOUT_GRADE_TEXT_CLASS[grade]
                              )}
                            >
                              {grade}
                            </span>
                          ) : (
                            <span className="text-[12px] text-[#A8A29E]">
                              {getContentQualityStatusShortText(
                                quality?.status ?? "pending_snapshot"
                              )}
                            </span>
                          )}
                        </TableCell>

                        {/* 播放 */}
                        <TableCell className="text-right text-[14px] tabular-nums text-[#78716C]">
                          {snap?.play_count != null ? (
                            formatCount(snap.play_count)
                          ) : (
                            <span className="text-[#A8A29E]">—</span>
                          )}
                        </TableCell>

                        {/* 2s留存 */}
                        <TableCell className="text-right text-[14px] tabular-nums text-[#78716C]">
                          {snap?.bounce_rate_2s != null ? (
                            formatPercent(snap.bounce_rate_2s)
                          ) : (
                            <span className="text-[#A8A29E]">—</span>
                          )}
                        </TableCell>

                        {/* 5s完播 */}
                        <TableCell className="text-right text-[14px] tabular-nums text-[#78716C]">
                          {snap?.completion_rate_5s != null ? (
                            formatPercent(snap.completion_rate_5s)
                          ) : (
                            <span className="text-[#A8A29E]">—</span>
                          )}
                        </TableCell>

                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

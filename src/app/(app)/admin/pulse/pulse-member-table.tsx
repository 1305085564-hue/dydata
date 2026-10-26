"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getContentQualityStatusShortText } from "@/lib/collaboration/content-quality-contract";
import type { VideoMetricsSnapshot } from "@/types";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import { cn } from "@/lib/utils";
import {
  compareWithNullsLast,
  formatCount,
  formatPercent,
  type PulseMemberRow,
  type PulseMemberSortField,
  type SortDirection,
} from "./pulse-filters";

interface PulseMemberTableProps {
  members: PulseMemberRow[];
  snapshotByVideoId: Map<string, VideoMetricsSnapshot>;
  contentQualityByVideoId: Record<string, WorkContentQuality>;
}

export function PulseMemberTable({
  members,
  snapshotByVideoId,
  contentQualityByVideoId,
}: PulseMemberTableProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<PulseMemberSortField>("totalPlay");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSort = (field: PulseMemberSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      return compareWithNullsLast(a[sortField], b[sortField], sortDir);
    });
  }, [members, sortField, sortDir]);

  const renderSortHeader = (field: PulseMemberSortField, label: string) => {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[20px] text-[#141413] leading-[1.30]">
        人员日战报
      </div>

      {members.length === 0 ? (
        <EmptyState
          variant="compact"
          title="该日无发片成员"
          description="可切换上方日历查看其他日期。"
        />
      ) : (
        <>
          {/* 移动端卡片列表 (<768px) */}
          <div className="md:hidden w-full bg-white rounded-xl shadow-card-ring border border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60 overflow-hidden">
            {sortedMembers.map((member) => {
              const isExpanded = expandedUserIds.has(member.userId);
              return (
                <div
                  key={member.userId}
                  className="p-3 hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors"
                >
                  <div
                    onClick={() => toggleExpand(member.userId)}
                    className="flex items-center justify-between gap-2 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "size-3.5 text-[#A8A29E] transition-transform",
                          isExpanded && "rotate-90 text-[#141413]"
                        )}
                      />
                      <span className="text-[14px] text-[#141413]">
                        {member.userName}
                      </span>
                    </div>
                    <span className="text-[12px] text-[#78716C]">
                      {member.publishedCount} 篇
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 border-t border-[#E2E2DF]/50 pt-2 mt-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C]">发片数</span>
                      <span className="text-[12px] tabular-nums text-[#1F1E1D]">
                        {member.publishedCount}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C]">合计播放</span>
                      <span className="text-[12px] tabular-nums text-[#1F1E1D]">
                        {member.totalPlay != null ? (
                          formatCount(member.totalPlay)
                        ) : (
                          <span className="text-[#A8A29E]">—</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C]">2s留存</span>
                      <span className="text-[12px] tabular-nums text-[#1F1E1D]">
                        {member.avgBounce2s != null ? (
                          formatPercent(member.avgBounce2s)
                        ) : (
                          <span className="text-[#A8A29E]">—</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C]">5s完播</span>
                      <span className="text-[12px] tabular-nums text-[#1F1E1D]">
                        {member.avgCompletion5s != null ? (
                          formatPercent(member.avgCompletion5s)
                        ) : (
                          <span className="text-[#A8A29E]">—</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* 展开子作品 */}
                  {isExpanded && (
                    <div className="divide-y divide-[#E2E2DF]/60 mt-3 pt-2 border-t border-[#E2E2DF]/60">
                      {member.videos.map((video) => {
                        const snap = snapshotByVideoId.get(video.id);
                        const quality = contentQualityByVideoId[video.id];
                        const grade = quality?.overallGrade;
                        return (
                          <div
                            key={video.id}
                            onClick={() => router.push(`/admin/content?videoId=${video.id}`)}
                            className="flex items-center justify-between gap-3 py-2 cursor-pointer hover:bg-[#F7F7F6] rounded px-1 transition-colors"
                          >
                            <span className="text-[14px] text-[#1F1E1D] truncate hover:text-[#141413]">
                              {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
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
                              <span className="text-[12px] tabular-nums text-[#78716C]">
                                {snap?.play_count != null ? (
                                  formatCount(snap.play_count)
                                ) : (
                                  <span className="text-[#A8A29E]">—</span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                    <TableHead className="w-[30%]">成员</TableHead>
                    <TableHead className="text-right pr-4 pl-2">
                      {renderSortHeader("publishedCount", "发片数")}
                    </TableHead>
                    <TableHead className="text-right">
                      {renderSortHeader("totalPlay", "合计播放")}
                    </TableHead>
                    <TableHead className="text-right">
                      {renderSortHeader("avgBounce2s", "平均2s留存")}
                    </TableHead>
                    <TableHead className="text-right">
                      {renderSortHeader("avgCompletion5s", "平均5s完播")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => {
                    const isExpanded = expandedUserIds.has(member.userId);
                    return (
                      <React.Fragment key={member.userId}>
                        <TableRow className="hover:bg-[#F7F7F6] transition-colors">
                          <TableCell className="text-[14px] text-[#1F1E1D]">
                            <button
                              type="button"
                              onClick={() => toggleExpand(member.userId)}
                              className="inline-flex items-center gap-1 text-left text-[14px] text-[#1F1E1D] hover:text-[#141413] cursor-pointer"
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3.5 text-[#78716C] transition-transform",
                                  isExpanded && "rotate-90 text-[#141413]"
                                )}
                              />
                              <span>{member.userName}</span>
                            </button>
                          </TableCell>
                          <TableCell className="text-right pr-4 pl-2 text-[14px] tabular-nums text-[#1F1E1D]">
                            {member.publishedCount}
                          </TableCell>
                          <TableCell className="text-right text-[14px] tabular-nums text-[#1F1E1D]">
                            {member.totalPlay != null ? (
                              formatCount(member.totalPlay)
                            ) : (
                              <span className="text-[#A8A29E]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[14px] tabular-nums text-[#1F1E1D]">
                            {member.avgBounce2s != null ? (
                              formatPercent(member.avgBounce2s)
                            ) : (
                              <span className="text-[#A8A29E]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[14px] tabular-nums text-[#1F1E1D]">
                            {member.avgCompletion5s != null ? (
                              formatPercent(member.avgCompletion5s)
                            ) : (
                              <span className="text-[#A8A29E]">—</span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* 展开子作品行 */}
                        {isExpanded && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="bg-transparent py-2 px-3 sm:px-6">
                              <div className="divide-y divide-[#E2E2DF]/60 pl-4 border-l border-[#E2E2DF]">
                                {member.videos.map((video) => {
                                  const snap = snapshotByVideoId.get(video.id);
                                  const quality = contentQualityByVideoId[video.id];
                                  const grade = quality?.overallGrade;
                                  return (
                                    <div
                                      key={video.id}
                                      onClick={() => router.push(`/admin/content?videoId=${video.id}`)}
                                      className="flex items-center justify-between gap-4 py-2 cursor-pointer hover:bg-[#F7F7F6] rounded px-2 transition-colors"
                                    >
                                      <div className="min-w-0 flex-1 flex items-center gap-2">
                                        <span className="text-[14px] text-[#1F1E1D] truncate hover:text-[#141413]">
                                          {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                                        </span>
                                        {video.accounts?.name && (
                                          <span className="text-[12px] text-[#78716C] shrink-0">
                                            · {video.accounts.name}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-6 shrink-0">
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
                                        <span className="text-[12px] tabular-nums text-[#78716C] w-16 text-right">
                                          {snap?.play_count != null ? (
                                            formatCount(snap.play_count)
                                          ) : (
                                            <span className="text-[#A8A29E]">—</span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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

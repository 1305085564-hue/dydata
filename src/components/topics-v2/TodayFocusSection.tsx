"use client";

import React, { useState } from "react";
import {
  UserCheck,
  Video,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  ActiveTopicsResponse,
  TopicClaimItem,
} from "./types";

interface TodayFocusSectionProps {
  data: ActiveTopicsResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectTopic: (subTopicId: string) => void;
  onClaim?: (subTopicId: string) => Promise<void>;
}

function formatDateCompact(value: string | null) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function TodayFocusSection({
  data,
  loading,
  error,
  onRetry,
  onSelectTopic,
}: TodayFocusSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading) {
    return (
      <section className="my-2 sm:my-3.5">
        <div className="h-10 bg-zinc-100/80 rounded-xl border border-zinc-200/60 animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-2 sm:my-3.5">
        <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-600">
            <AlertCircle className="w-3.5 h-3.5 text-[#DC2626]" />
            <span>团队动态加载失败: {error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 font-medium"
            aria-label="重试加载团队动态"
          >
            <RefreshCw className="w-3 h-3" />
            <span>重试</span>
          </button>
        </div>
      </section>
    );
  }

  const latestClaim = data?.recentlyClaimed?.[0] ?? null;
  const latestWork = data?.recentlyWorked?.[0] ?? null;
  const totalActivityCount =
    (data?.recentlyClaimed.length ?? 0) + (data?.recentlyWorked.length ?? 0);

  if (totalActivityCount === 0) {
    return (
      <section className="my-2 sm:my-3.5">
        <div className="rounded-xl bg-zinc-50/70 px-3.5 py-2 text-xs text-zinc-500">
          暂无团队动态，认领或产出成片后会自动出现。
        </div>
      </section>
    );
  }

  // 展开列表展示第 2 条及往后的历史记录，彻底避免与顶部单行第 1 条重复
  const pastClaims = (data?.recentlyClaimed ?? []).slice(1, 6);
  const pastWorks = (data?.recentlyWorked ?? []).slice(1, 6);

  return (
    <section className="my-2 sm:my-3.5 transition-all">
      {/* 单行极简状态条 (Ticker) */}
      <div className="bg-zinc-100/60 hover:bg-zinc-100/80 border border-zinc-200/60 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
          {/* 最新认领 */}
          {latestClaim ? (
            <div className="flex items-center gap-1.5 truncate max-w-full sm:max-w-[48%]">
              <span className="inline-flex items-center gap-1 text-[#5F82A8] font-medium shrink-0">
                <UserCheck className="w-3.5 h-3.5" />
                <span>最新认领:</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectTopic(latestClaim.subTopicId)}
                className="text-zinc-700 hover:text-[#D97757] transition-colors truncate font-normal text-left"
                title={`查看选题《${latestClaim.subTopic?.title || "选题"}》`}
              >
                <span className="font-semibold text-zinc-900">
                  {latestClaim.displayName || "团队成员"}
                </span>
                <span className="text-zinc-600 ml-1">
                  《{latestClaim.subTopic?.title || "未命名选题"}》
                </span>
              </button>
              <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                ({formatDateCompact(latestClaim.claimedAt)})
              </span>
            </div>
          ) : null}

          {latestClaim && latestWork ? (
            <span className="hidden sm:inline text-zinc-300 select-none">|</span>
          ) : null}

          {/* 最新成片 */}
          {latestWork ? (
            <div className="flex items-center gap-1.5 truncate max-w-full sm:max-w-[48%]">
              <span className="inline-flex items-center gap-1 text-[#D97757] font-medium shrink-0">
                <Video className="w-3.5 h-3.5" />
                <span>最新成片:</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  latestWork.subTopic?.id &&
                  onSelectTopic(latestWork.subTopic.id)
                }
                className="text-zinc-700 hover:text-[#D97757] transition-colors truncate font-normal text-left"
                title={`查看对应选题《${latestWork.subTopic?.title || "未命名选题"}》`}
              >
                <span className="font-semibold text-zinc-900">
                  《{latestWork.videoTitle}》
                </span>
                {latestWork.subTopic?.title && (
                  <span className="text-zinc-400 ml-1 text-[11px]">
                    ({latestWork.subTopic.title})
                  </span>
                )}
              </button>
              <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                ({formatDateCompact(latestWork.uploadedAt)})
              </span>
            </div>
          ) : null}
        </div>

        {/* 右侧：展开往期动态 */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 font-medium px-2 py-0.5 rounded-md hover:bg-zinc-200/60 transition-colors shrink-0"
          aria-expanded={isExpanded}
        >
          <span>动态 ({totalActivityCount})</span>
          {isExpanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </div>

      {/* 展开的往期历史动态面板（从第 2 条开始展示，上下绝不重复） */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2.5 p-4 bg-white border border-zinc-200/90 rounded-2xl shadow-xs animate-in fade-in slide-in-from-top-1 duration-150">
          {/* 往期认领列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100 text-xs">
              <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#5F82A8]" />
                往期认领记录
              </span>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {pastClaims.length} 条
              </span>
            </div>
            {pastClaims.length === 0 ? (
              <div className="text-xs text-zinc-400 py-3 text-center">
                暂无更多往期认领
              </div>
            ) : (
              pastClaims.map((claim: TopicClaimItem) => (
                <button
                  key={claim.id}
                  type="button"
                  onClick={() => onSelectTopic(claim.subTopicId)}
                  className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 hover:bg-zinc-50 rounded-lg transition-colors text-left min-w-0 group"
                >
                  <div className="min-w-0 flex-1 truncate font-normal">
                    <span className="font-medium text-zinc-800 group-hover:text-[#D97757] transition-colors">
                      {claim.displayName || "团队成员"}
                    </span>
                    <span className="text-zinc-500 ml-1.5">
                      认领《{claim.subTopic?.title || "未命名选题"}》
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 shrink-0 font-normal tabular-nums">
                    {formatDateCompact(claim.claimedAt)}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* 往期成片关联列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100 text-xs">
              <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-[#D97757]" />
                往期成片产出
              </span>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {pastWorks.length} 条
              </span>
            </div>
            {pastWorks.length === 0 ? (
              <div className="text-xs text-zinc-400 py-3 text-center">
                暂无更多往期作品
              </div>
            ) : (
              pastWorks.map((work) => (
                <div
                  key={work.id}
                  className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 hover:bg-zinc-50 rounded-lg transition-colors text-left min-w-0 group"
                >
                  <button
                    type="button"
                    onClick={() =>
                      work.subTopic?.id && onSelectTopic(work.subTopic.id)
                    }
                    className="min-w-0 flex-1 truncate font-normal text-left"
                    title={`查看选题《${work.subTopic?.title || "未命名选题"}》的剖析详情`}
                  >
                    <span className="font-medium text-zinc-800 group-hover:text-[#D97757] transition-colors">
                      成片《{work.videoTitle}》
                    </span>
                    {work.subTopic?.title && (
                      <span className="text-zinc-400 ml-1.5 truncate text-[11px]">
                        · {work.subTopic.title}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href="/admin/content"
                      onClick={(e) => e.stopPropagation()}
                      className="p-0.5 text-zinc-300 hover:text-[#D97757] transition-colors rounded hover:bg-zinc-100"
                      title="前往视频复盘查看成片"
                      aria-label="前往视频复盘查看成片"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-[11px] text-zinc-400 font-normal tabular-nums">
                      {formatDateCompact(work.uploadedAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export { TodayFocusSection as TeamActivitySection };

"use client";

import React, { useState } from "react";
import {
  UserCheck,
  Video,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  ActiveTopicsResponse,
  TopicClaimItem,
} from "./types";

interface TeamActivitySectionProps {
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

export function TeamActivitySection({
  data,
  loading,
  error,
  onRetry,
  onSelectTopic,
}: TeamActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading) {
    return (
      <section className="my-2 sm:my-3.5">
        <div className="h-10 bg-[#F1F1F0] rounded-xl animate-pulse-claude" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-2 sm:my-3.5">
        <div className="flex items-center justify-between rounded-r-xl border-l-2 border-l-[#C0685C] bg-[#C0685C]/5 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2 text-[#292524]">
            <AlertCircle className="w-3.5 h-3.5 text-[#C0685C]" />
            <span>团队动态加载失败: {error}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs text-[#292524] hover:text-[#1C1917] font-medium"
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
        <div className="rounded-xl bg-[#FCFCFB]/70 px-3.5 py-2 text-xs text-[#78716C]">
          还没有团队写作动态，开始写题或产出成片后会自动出现在这里。
        </div>
      </section>
    );
  }

  // 展开列表展示第 2 条及往后的历史记录，彻底避免与顶部单行第 1 条重复
  const pastClaims = (data?.recentlyClaimed ?? []).slice(1, 6);
  const pastWorks = (data?.recentlyWorked ?? []).slice(1, 6);

  return (
    <section className="mb-2.5 sm:mb-3 transition-all">
      {/* 采用学者边注微印记：发丝线贴近下方筛选栏，与上方动态拉开舒适留白 */}
      <div className="flex items-center justify-between gap-3 text-[12px] sm:text-[12.5px] leading-relaxed text-[#78716C] pt-0.5 pb-3.5 border-b border-[#E2E2DF]/80">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 min-w-0 flex-1">
            {latestClaim && (
              <div className="flex items-center gap-1.5 truncate max-w-full lg:max-w-[48%]">
                <span className="text-[#292524] font-medium shrink-0">
                  {latestClaim.displayName || "团队成员"}
                </span>
                <span className="shrink-0">最新在写：</span>
                <button
                  type="button"
                  onClick={() => onSelectTopic(latestClaim.subTopicId)}
                  className="inline-flex items-center text-[#292524] hover:text-[#D97757] transition-colors truncate min-h-11 sm:min-h-0"
                  title={`查看选题《${latestClaim.subTopic?.title || "选题"}》`}
                >
                  《{latestClaim.subTopic?.title || "未命名选题"}》
                </button>
                <span className="text-[11px] tabular-nums shrink-0 text-[#78716C]">
                  ({formatDateCompact(latestClaim.claimedAt)})
                </span>
              </div>
            )}

            {latestClaim && latestWork && (
              <span className="text-[#E2E2DF] select-none hidden sm:inline">·</span>
            )}

            {latestWork && (
              <div className="flex items-center gap-1.5 truncate max-w-full lg:max-w-[48%]">
                <span className="shrink-0">最新成品：</span>
                <button
                  type="button"
                  onClick={() =>
                    latestWork.subTopic?.id &&
                    onSelectTopic(latestWork.subTopic.id)
                  }
                  className="inline-flex items-center text-[#292524] hover:text-[#D97757] transition-colors truncate min-h-11 sm:min-h-0"
                  title={`查看对应选题《${latestWork.subTopic?.title || "未命名选题"}》`}
                >
                  《{latestWork.videoTitle}》
                </button>
                {latestWork.subTopic?.title && (
                  <span className="text-[11px] text-[#78716C] truncate hidden md:inline">
                    ({latestWork.subTopic.title})
                  </span>
                )}
                <span className="text-[11px] tabular-nums shrink-0 text-[#78716C]">
                  ({formatDateCompact(latestWork.uploadedAt)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：展开往期动态 */}
        {totalActivityCount > 1 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center justify-center gap-1 text-[11px] text-[#78716C] hover:text-[#1C1917] font-medium px-2 py-0.5 min-h-11 sm:min-h-0 rounded-md hover:bg-[#F1F1F0] transition-colors shrink-0 select-none"
            aria-expanded={isExpanded}
          >
            <span>动态 ({totalActivityCount})</span>
            {isExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        )}
      </div>

      {/* 展开的往期历史动态面板（从第 2 条开始展示，上下绝不重复） */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2.5 p-4 bg-white rounded-2xl shadow-card-ring animate-in fade-in slide-in-from-top-1 duration-150">
          {/* 往期写作列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#E2E2DF] text-xs">
              <span className="font-semibold text-[#292524] flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#43718E]" />
                往期创作轨迹
              </span>
              <span className="text-[11px] text-[#78716C] tabular-nums">
                {pastClaims.length} 篇
              </span>
            </div>
            {pastClaims.length === 0 ? (
              <div className="text-xs text-[#78716C] py-3 text-center">
                已展示全部创作记录
              </div>
            ) : (
              pastClaims.map((claim: TopicClaimItem) => (
                <button
                  key={claim.id}
                  type="button"
                  onClick={() => onSelectTopic(claim.subTopicId)}
                  className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 hover:bg-[#EBEBE9] rounded-lg transition-colors text-left min-w-0 group"
                >
                  <div className="min-w-0 flex-1 truncate font-normal">
                    <span className="font-medium text-[#292524] group-hover:text-[#D97757] transition-colors">
                      {claim.displayName || "团队成员"}
                    </span>
                    <span className="text-[#78716C] ml-1.5">
                      正在写<span>《{claim.subTopic?.title || "未命名选题"}》</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-[#78716C] shrink-0 font-normal tabular-nums">
                    {formatDateCompact(claim.claimedAt)}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* 往期成片关联列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#E2E2DF] text-xs">
              <span className="font-semibold text-[#292524] flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-[#D97757]" />
                往期成片产出
              </span>
              <span className="text-[11px] text-[#78716C] tabular-nums">
                {pastWorks.length} 条
              </span>
            </div>
            {pastWorks.length === 0 ? (
              <div className="text-xs text-[#78716C] py-3 text-center">
                没有更多往期作品了
              </div>
            ) : (
              pastWorks.map((work) => (
                <div
                  key={work.id}
                  className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 hover:bg-[#EBEBE9] rounded-lg transition-colors text-left min-w-0 group"
                >
                  <button
                    type="button"
                    onClick={() =>
                      work.subTopic?.id && onSelectTopic(work.subTopic.id)
                    }
                    className="min-w-0 flex-1 truncate font-normal text-left"
                    title={`查看选题《${work.subTopic?.title || "未命名选题"}》的剖析详情`}
                  >
                    <span className="font-medium text-[#292524] group-hover:text-[#D97757] transition-colors">
                      成片《{work.videoTitle}》
                    </span>
                    {work.subTopic?.title && (
                      <span className="text-[#78716C] ml-1.5 truncate text-[11px]">
                        · {work.subTopic.title}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-[#78716C] font-normal tabular-nums">
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

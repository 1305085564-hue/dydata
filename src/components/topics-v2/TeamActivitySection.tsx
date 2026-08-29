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
        <div className="h-10 bg-[#F5F3EE] rounded-xl animate-pulse-claude" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-2 sm:my-3.5">
        <div className="flex items-center justify-between rounded-r-xl border-l-2 border-l-[#C9604D] bg-red-50/50 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2 text-[#292524]">
            <AlertCircle className="w-3.5 h-3.5 text-[#DC2626]" />
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
        <div className="rounded-xl bg-[#FBF9F5]/70 px-3.5 py-2 text-xs text-[#78716C]">
          还没有团队写作动态，开始写题或产出成片后会自动出现在这里。
        </div>
      </section>
    );
  }

  // 展开列表展示第 2 条及往后的历史记录，彻底避免与顶部单行第 1 条重复
  const pastClaims = (data?.recentlyClaimed ?? []).slice(1, 6);
  const pastWorks = (data?.recentlyWorked ?? []).slice(1, 6);

  return (
    <section className="mt-4 sm:mt-5 mb-5 sm:mb-6 transition-all">
      {/* 单行极简状态条 (Ticker) */}
      <div className="bg-[#F5F3EE]/70 hover:bg-[#F5F3EE] rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
        <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
          {/* 最新写作 */}
          {latestClaim ? (
            <div className="flex items-center gap-1.5 truncate max-w-full sm:max-w-[48%]">
              <span className="inline-flex items-center gap-1 text-[#43718E] font-medium shrink-0">
                <UserCheck className="w-3.5 h-3.5" />
                <span>最新在写:</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectTopic(latestClaim.subTopicId)}
                className="text-[#292524] hover:text-[#D97757] transition-colors truncate font-normal text-left min-h-[44px] sm:min-h-0 inline-flex items-center"
                title={`查看选题《${latestClaim.subTopic?.title || "选题"}》`}
              >
                <span className="font-semibold text-[#1C1917]">
                  {latestClaim.displayName || "团队成员"}
                </span>
                <span className="text-[#292524] ml-1">
                  《{latestClaim.subTopic?.title || "未命名选题"}》
                </span>
              </button>
              <span className="text-[11px] text-[#78716C] tabular-nums shrink-0">
                ({formatDateCompact(latestClaim.claimedAt)})
              </span>
            </div>
          ) : null}

          {latestClaim && latestWork ? (
            <span className="hidden sm:inline text-[#E5E0D6] select-none">|</span>
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
                className="text-[#292524] hover:text-[#D97757] transition-colors truncate font-normal text-left min-h-[44px] sm:min-h-0 inline-flex items-center"
                title={`查看对应选题《${latestWork.subTopic?.title || "未命名选题"}》`}
              >
                  <span className="font-semibold text-[#1C1917]">
                  《{latestWork.videoTitle}》
                </span>
                {latestWork.subTopic?.title && (
                  <span className="text-[#78716C] ml-1 text-[11px]">
                    ({latestWork.subTopic.title})
                  </span>
                )}
              </button>
              <span className="text-[11px] text-[#78716C] tabular-nums shrink-0">
                ({formatDateCompact(latestWork.uploadedAt)})
              </span>
            </div>
          ) : null}
        </div>

        {/* 右侧：展开往期动态 */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center justify-center gap-1 text-[11px] text-[#78716C] hover:text-[#1C1917] font-medium px-2 py-0.5 rounded-md hover:bg-[#E5E0D6]/60 transition-colors shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2.5 p-4 bg-white border border-[#E5E0D6]/90 rounded-2xl shadow-xs animate-in fade-in slide-in-from-top-1 duration-150">
          {/* 往期写作列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#ECE7DE] text-xs">
              <span className="font-semibold text-[#292524] flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#43718E]" />
                往期写作记录
              </span>
              <span className="text-[11px] text-[#78716C] tabular-nums">
                {pastClaims.length} 条
              </span>
            </div>
            {pastClaims.length === 0 ? (
              <div className="text-xs text-[#78716C] py-3 text-center">
                没有更多往期写作记录
              </div>
            ) : (
              pastClaims.map((claim: TopicClaimItem) => (
                <button
                  key={claim.id}
                  type="button"
                  onClick={() => onSelectTopic(claim.subTopicId)}
                  className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 hover:bg-[#FBF9F5] rounded-lg transition-colors text-left min-w-0 group"
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
            <div className="flex items-center justify-between pb-1.5 border-b border-[#ECE7DE] text-xs">
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
                  className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2 hover:bg-[#FBF9F5] rounded-lg transition-colors text-left min-w-0 group"
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

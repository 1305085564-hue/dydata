"use client";

import React from "react";
import { UserCheck, Video, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
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

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "时间未知";
}

function ActivityPanel({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-2xs">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-100">
        <div className="flex items-center gap-1.5">
          {icon}
          <h4 className="text-xs font-normal text-zinc-600 uppercase tracking-wider">
            {title}
          </h4>
        </div>
        <span className="text-xs text-zinc-500 font-normal tabular-nums">
          {count} 条
        </span>
      </div>
      {count === 0 ? (
        <div className="text-xs text-zinc-500 py-3 text-center font-normal">
          {empty}
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

export function TodayFocusSection({
  data,
  loading,
  error,
  onRetry,
  onSelectTopic,
}: TodayFocusSectionProps) {
  if (loading) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="h-44 bg-zinc-100 rounded-xl border border-zinc-200 p-4 animate-pulse" />
        <div className="h-44 bg-zinc-100 rounded-xl border border-zinc-200 p-4 animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mb-6">
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/60 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#DC2626] mb-1">
            <AlertCircle className="w-4 h-4" />
            <span>团队动态加载失败</span>
          </div>
          <p className="text-xs text-zinc-500 font-normal mb-3">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-100 active:scale-[0.97] transition-all"
            aria-label="重试加载团队动态"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <ActivityPanel
        title="团队最新认领"
        icon={<UserCheck className="w-3.5 h-3.5 text-zinc-500" />}
        count={data?.recentlyClaimed.length ?? 0}
        empty="暂无最新认领记录"
      >
        {(data?.recentlyClaimed ?? [])
          .slice(0, 4)
          .map((claim: TopicClaimItem) => (
            <button
              key={claim.id}
              type="button"
              onClick={() => onSelectTopic(claim.subTopicId)}
              className="w-full flex items-center justify-between gap-3 text-xs py-2 px-2.5 hover:bg-zinc-50 rounded-lg transition-colors text-left min-w-0 group"
            >
              <div className="min-w-0 flex-1 truncate font-normal">
                <span className="font-medium text-zinc-800 group-hover:text-[#D97757] transition-colors">
                  {claim.displayName || "团队成员"}
                </span>
                <span className="text-zinc-500 ml-1.5">
                  认领选题《{claim.subTopic?.title || "子题"}》
                </span>
              </div>
              <span className="text-xs text-zinc-500 shrink-0 font-normal tabular-nums">
                {formatDate(claim.claimedAt)}
              </span>
            </button>
          ))}
      </ActivityPanel>

      <ActivityPanel
        title="最新成片关联"
        icon={<Video className="w-3.5 h-3.5 text-zinc-500" />}
        count={data?.recentlyWorked.length ?? 0}
        empty="暂无最新作品产出"
      >
        {(data?.recentlyWorked ?? []).slice(0, 4).map((work) => (
          <div
            key={work.id}
            className="w-full flex items-center justify-between gap-2 text-xs py-2 px-2.5 hover:bg-zinc-50 rounded-lg transition-colors text-left min-w-0 group"
          >
            <button
              type="button"
              onClick={() =>
                work.subTopic?.id && onSelectTopic(work.subTopic.id)
              }
              className="min-w-0 flex-1 truncate font-normal text-left"
              title={`查看选题《${work.subTopic?.title || "未命名选题"}》的剖析剖位`}
            >
              <span className="font-medium text-zinc-800 group-hover:text-[#D97757] transition-colors">
                成片《{work.videoTitle}》
              </span>
              {work.subTopic?.title && (
                <span className="text-zinc-500 ml-1 truncate">
                  (对应选题: {work.subTopic.title})
                </span>
              )}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href="/admin/content"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-zinc-400 hover:text-[#D97757] transition-colors rounded hover:bg-zinc-100"
                title="前往视频复盘查看成片"
                aria-label="前往视频复盘查看成片"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-xs text-zinc-500 font-normal tabular-nums">
                {formatDate(work.uploadedAt)}
              </span>
            </div>
          </div>
        ))}
      </ActivityPanel>
    </section>
  );
}

// 别名导出保持语义清晰
export { TodayFocusSection as TeamActivitySection };

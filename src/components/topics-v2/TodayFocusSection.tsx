"use client";

import React, { useState } from "react";
import { Sparkles, UserCheck, Video, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import type { ActiveTopicsResponse, TopicClaimItem, TopicFocusItem } from "./types";

interface TodayFocusSectionProps {
  data: ActiveTopicsResponse | null;
  loading: boolean;
  error: string | null;
  onClaim: (subTopicId: string) => Promise<void>;
  onRetry: () => void;
  onSelectTopic: (subTopicId: string) => void;
}

function formatPlayCount(value: number | null) {
  if (value === null) return "无合格成片";
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "时间未知";
}

function FocusCard({
  item,
  claimingId,
  onClaim,
  onSelectTopic,
}: {
  item: TopicFocusItem;
  claimingId: string | null;
  onClaim: (event: React.MouseEvent, id: string) => void;
  onSelectTopic: (id: string) => void;
}) {
  const claim = item.myClaim;
  const isScripting = claim?.status === "scripting";
  const isCandidate = claim?.status === "candidate";

  return (
    <div
      onClick={() => onSelectTopic(item.id)}
      className="group relative bg-white border border-zinc-200 rounded-xl p-4.5 shadow-xs hover:shadow-md hover:border-zinc-300 transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* 保持最干净的顶栏：仅母题/分组与情绪标签，不加任何额外新标签 */}
        <div className="flex items-center justify-between gap-2 text-xs mb-2.5 min-w-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-normal bg-zinc-100 text-zinc-600 truncate min-w-0">
            {item.topics?.name || "常规"} {item.topic_groups?.name ? `· ${item.topic_groups.name}` : ""}
          </span>
          {item.emotion_tag && <span className="text-xs text-zinc-400 shrink-0">#{item.emotion_tag}</span>}
        </div>

        <h3 className="text-base font-semibold text-zinc-900 group-hover:text-[#D97757] transition-colors duration-150 line-clamp-2 mb-1.5">
          {item.title}
        </h3>
        <p className="text-xs text-zinc-500 line-clamp-2 mb-4 leading-relaxed font-normal">
          "{item.hook || "暂无 Hook"}"
        </p>

        {/* 仅保留唯一的【数据指标网格】，彻底剔除重复的推荐信号框与额外新标签 */}
        <div className="grid grid-cols-2 gap-2 bg-zinc-50 rounded-lg p-2.5 mb-4 border border-zinc-100 text-xs">
          <div title={item.summary.averagePlayCount === null ? "暂无播放量≥10,000 的合格成片数据" : undefined}>
            <div className="text-zinc-500 text-xs font-normal">合格作品均播</div>
            <div className={`font-semibold tabular-nums text-sm mt-0.5 ${item.summary.averagePlayCount === null ? "text-zinc-400 text-xs font-normal" : "text-zinc-800"}`}>
              {formatPlayCount(item.summary.averagePlayCount)}
            </div>
          </div>
          <div title={item.summary.bestPlayCount === null ? "暂无播放量≥10,000 的合格成片数据" : undefined}>
            <div className="text-zinc-500 text-xs font-normal">最高播放</div>
            <div className={`font-semibold tabular-nums text-sm mt-0.5 ${item.summary.bestPlayCount === null ? "text-zinc-400 text-xs font-normal" : "text-zinc-900"}`}>
              {formatPlayCount(item.summary.bestPlayCount)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 min-w-0">
        <span className="text-xs text-zinc-500 truncate min-w-0 font-normal">
          {item.summary.qualifiedWorkCount} 条成片 · {formatDate(item.latestWorkedAt)}
        </span>
        {isScripting ? (
          <span className="px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200/80 text-xs font-medium shrink-0">脚本中</span>
        ) : (
          <button
            type="button"
            disabled={claimingId === item.id || isCandidate}
            onClick={(event) => onClaim(event, item.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-medium transition-all shadow-2xs disabled:opacity-50 shrink-0"
            aria-label={claimingId === item.id ? "认领中" : isCandidate ? "已在候选" : "认领写此题"}
          >
            {claimingId === item.id ? "认领中..." : isCandidate ? "已在候选" : "认领写此题"}
          </button>
        )}
      </div>
    </div>
  );
}

export function TodayFocusSection({ data, loading, error, onClaim, onRetry, onSelectTopic }: TodayFocusSectionProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const handleClaim = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    try {
      setClaimingId(id);
      await onClaim(id);
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-48 bg-zinc-200 rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-56 bg-zinc-100 rounded-xl border border-zinc-200 p-5 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D97757]/10 text-[#D97757]">
          <Sparkles className="w-3 h-3" />
        </span>
        <h2 className="text-base font-semibold text-zinc-900 tracking-tight">今日聚焦</h2>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-8 text-center">
          <AlertCircle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-rose-800">今日聚焦加载失败</p>
          <p className="text-xs text-rose-600 mt-1 font-normal">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-100 active:scale-[0.97] transition-all"
            aria-label="重试加载今日聚焦"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试</span>
          </button>
        </div>
      ) : data?.focusTopics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center shadow-xs">
          <div className="w-10 h-10 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800 mb-1">暂无推荐数据</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto font-normal leading-relaxed">
            还没有推荐数据，先去下方选题池看看
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.focusTopics ?? []).map((item) => (
            <FocusCard key={item.id} item={item} claimingId={claimingId} onClaim={handleClaim} onSelectTopic={onSelectTopic} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <ActivityPanel
          title="团队最新认领"
          icon={<UserCheck className="w-3.5 h-3.5 text-zinc-500" />}
          count={data?.recentlyClaimed.length ?? 0}
          empty="暂无最新认领记录"
        >
          {(data?.recentlyClaimed ?? []).slice(0, 4).map((claim: TopicClaimItem) => (
            <button
              key={claim.id}
              type="button"
              onClick={() => onSelectTopic(claim.subTopicId)}
              className="w-full flex items-center justify-between gap-3 text-xs py-2 px-2.5 hover:bg-zinc-50 rounded-lg transition-colors text-left min-w-0 group"
            >
              <div className="min-w-0 flex-1 truncate font-normal">
                <span className="font-medium text-zinc-800 group-hover:text-[#D97757] transition-colors">{claim.displayName || "团队成员"}</span>
                <span className="text-zinc-500 ml-1.5">认领选题《{claim.subTopic?.title || "子题"}》</span>
              </div>
              <span className="text-xs text-zinc-500 shrink-0 font-normal tabular-nums">{formatDate(claim.claimedAt)}</span>
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
                onClick={() => work.subTopic?.id && onSelectTopic(work.subTopic.id)}
                className="min-w-0 flex-1 truncate font-normal text-left"
                title={`查看选题《${work.subTopic?.title || "未命名选题"}》的剖析剖位`}
              >
                <span className="font-medium text-zinc-800 group-hover:text-[#D97757] transition-colors">成片《{work.videoTitle}》</span>
                {work.subTopic?.title && <span className="text-zinc-500 ml-1 truncate">(对应选题: {work.subTopic.title})</span>}
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
                <span className="text-xs text-zinc-500 font-normal tabular-nums">{formatDate(work.uploadedAt)}</span>
              </div>
            </div>
          ))}
        </ActivityPanel>
      </div>
    </section>
  );
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
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-100">
        <div className="flex items-center gap-1.5">
          {icon}
          <h4 className="text-xs font-normal text-zinc-600 uppercase tracking-wider">{title}</h4>
        </div>
        <span className="text-xs text-zinc-500 font-normal tabular-nums">{count} 条</span>
      </div>
      {count === 0 ? <div className="text-xs text-zinc-500 py-3 text-center font-normal">{empty}</div> : <div className="space-y-1">{children}</div>}
    </div>
  );
}

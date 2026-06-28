"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

export function StatsBar({ stats }: StatsBarProps) {
  const hasPending = stats.pendingToday > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 核心焦点卡片 - 今日待处理 (深色反差特权 / 一页一魂) */}
      <div className="relative overflow-hidden rounded-xl bg-zinc-950 p-5 text-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-white/10 transition-all duration-300">
        {/* 背景微网格渐变 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-850/20 via-zinc-950 to-zinc-950 opacity-40 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between h-full min-h-[80px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium tracking-wider text-zinc-400 uppercase">今日待处理</span>
            {hasPending ? (
              <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55]" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
            )}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-[36px] font-semibold tabular-nums tracking-tight leading-none text-white">
              {stats.pendingToday}
            </span>
            <span className="text-[12px] font-medium text-zinc-400">人未处理</span>
          </div>
        </div>
      </div>

      {/* 连续未发警示卡片 */}
      <div className="rounded-xl border border-zinc-200/60 bg-white p-5 shadow-sm transition-all duration-200 hover:border-zinc-300">
        <div className="flex flex-col justify-between h-full min-h-[80px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium tracking-wider text-zinc-500 uppercase">连续未发人数</span>
            {stats.consecutiveMissingMembers > 0 ? (
              <span className="inline-flex items-center gap-1 rounded border border-[#D99E55]/15 bg-[#D99E55]/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[#D99E55]">
                需要关注
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`font-mono text-[36px] font-semibold tabular-nums tracking-tight leading-none ${
              stats.consecutiveMissingMembers > 0 ? "text-[#D99E55]" : "text-zinc-800"
            }`}>
              {stats.consecutiveMissingMembers}
            </span>
            <span className="text-[12px] font-medium text-zinc-400">人连续未发视频</span>
          </div>
        </div>
      </div>

      {/* 基础大盘统计卡片 - 高密精细排版 */}
      <div className="rounded-xl border border-zinc-200/60 bg-white p-5 shadow-sm lg:col-span-1 transition-all duration-200 hover:border-zinc-300">
        <div className="flex flex-col justify-between h-full min-h-[80px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium tracking-wider text-zinc-500 uppercase">履约周期大盘</span>
            <span className={`text-[12px] font-semibold font-mono ${
              stats.periodFulfillmentRate >= 80
                ? "text-[#6FAA7D]"
                : stats.periodFulfillmentRate >= 60
                  ? "text-[#D99E55]"
                  : "text-[#C9604D]"
            }`}>
              发布率 {stats.periodFulfillmentRate}%
            </span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-zinc-100 pt-3">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-zinc-400 font-medium">总成员</span>
              <span className="mt-1 font-mono text-[14px] font-semibold text-zinc-750">{stats.totalMembers}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-0.5">
                <span className="size-1 rounded-full bg-[#6FAA7D]" />
                已发
              </span>
              <span className="mt-1 font-mono text-[14px] font-semibold text-zinc-850">{stats.publishedToday}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-0.5">
                <span className="size-1 rounded-full bg-[#8AA8C7]" />
                豁免
              </span>
              <span className="mt-1 font-mono text-[14px] font-semibold text-zinc-850">
                {stats.leaveToday + stats.waivedToday}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-0.5">
                <span className="size-1 rounded-full bg-[#C9604D]" />
                缺勤
              </span>
              <span className="mt-1 font-mono text-[14px] font-semibold text-zinc-850">{stats.absentToday}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

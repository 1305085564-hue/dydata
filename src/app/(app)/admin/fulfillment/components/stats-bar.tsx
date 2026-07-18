"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

export function StatsBar({ stats }: StatsBarProps) {
  const hasPending = stats.pendingToday > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 核心焦点卡片 */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 transition-colors duration-150 hover:border-stone-300">
        <div className="flex h-full min-h-[80px] flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal tracking-wider text-stone-500 uppercase">今日待处理</span>
            {hasPending ? (
              <span className="relative flex h-2 w-2">
                <span 
                  className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D99E55] opacity-75"
                  style={{ animationDuration: "3s" }}
                />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D99E55]" />
              </span>
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
            )}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[24px] font-semibold tabular-nums tracking-tight leading-none text-stone-900">
              {stats.pendingToday}
            </span>
            <span className="text-[12px] font-normal text-stone-500">人未处理</span>
          </div>
        </div>
      </div>

      {/* 连续未发警示卡片 */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 transition-all duration-200 hover:border-stone-300">
        <div className="flex flex-col justify-between h-full min-h-[80px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal tracking-wider text-stone-500 uppercase">连续未发人数</span>
            {stats.consecutiveMissingMembers > 0 ? (
              <span className="inline-flex items-center gap-1 rounded border border-[#D99E55]/15 bg-[#D99E55]/[0.04] px-1.5 py-0.5 text-[12px] font-normal text-[#8F641B]">
                需要关注
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`text-[18px] font-medium tabular-nums tracking-tight leading-none ${
              stats.consecutiveMissingMembers > 0 ? "text-[#8F641B]" : "text-stone-900"
            }`}>
              {stats.consecutiveMissingMembers}
            </span>
            <span className="text-[12px] font-normal text-stone-500">人连续未发视频</span>
          </div>
        </div>
      </div>

      {/* 基础大盘统计卡片 - 高密精细排版 */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 lg:col-span-1 transition-all duration-200 hover:border-stone-300">
        <div className="flex flex-col justify-between h-full min-h-[80px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal tracking-wider text-stone-500 uppercase">履约周期大盘</span>
            <span className={`text-[12px] font-medium tabular-nums ${
              stats.periodFulfillmentRate >= 80
                ? "text-[#3F7A4E]"
                : stats.periodFulfillmentRate >= 60
                  ? "text-[#8F641B]"
                  : "text-[#B24E3E]"
            }`}>
              发布率 {stats.periodFulfillmentRate}%
            </span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-stone-100 pt-3">
            <div className="flex flex-col items-center">
              <span className="text-[12px] text-stone-500 font-normal">总成员</span>
              <span className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">{stats.totalMembers}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[12px] text-stone-500 font-normal flex items-center gap-0.5">
                <span className="size-1 rounded-full bg-[#6FAA7D]" />
                已发
              </span>
              <span className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">{stats.publishedToday}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[12px] text-stone-500 font-normal flex items-center gap-0.5">
                <span className="size-1 rounded-full bg-[#8AA8C7]" />
                豁免
              </span>
              <span className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">
                {stats.leaveToday + stats.waivedToday}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[12px] text-stone-500 font-normal flex items-center gap-0.5">
                <span className="size-1 rounded-full bg-[#C9604D]" />
                缺勤
              </span>
              <span className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">{stats.absentToday}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

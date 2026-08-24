"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

export function StatsBar({ stats }: StatsBarProps) {
  const hasPending = stats.pendingToday > 0;
  const confirmedCount =
    stats.publishedToday +
    stats.leaveToday +
    stats.waivedToday +
    stats.absentToday;

  return (
    <div className="border-y border-[#ECE7DE] py-5 sm:py-6 transition-all duration-200">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* 1. 今日待处理焦点 */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#78716C]">今日待处理</span>
            {hasPending ? (
              <span className="relative flex size-2">
                <span
                  className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D97757] opacity-75"
                  style={{ animationDuration: "3s" }}
                />
                <span className="relative inline-flex size-2 rounded-full bg-[#D97757]" />
              </span>
            ) : (
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.pendingToday}
              </span>
              <span className="text-[12px] font-normal text-[#78716C]">人未处理</span>
            </div>
            <div className="text-right text-[12px] text-[#78716C] font-normal">
              已确认 <span className="tabular-nums font-medium text-[#292524]">{confirmedCount}</span> / {stats.totalMembers} 人
            </div>
          </div>
        </div>

        {/* 2. 连续未发警示 */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#78716C]">连续未发人数</span>
            {stats.consecutiveMissingMembers > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#D97757]/10 px-2 py-0.5 text-[11px] font-medium text-[#D97757]">
                需跟进
              </span>
            ) : (
              <span className="text-[11px] text-[#78716C] font-normal">状态良好</span>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.consecutiveMissingMembers}
              </span>
              <span className="text-[12px] font-normal text-[#78716C]">人连续未发</span>
            </div>
            <span className="text-[12px] text-[#78716C] font-normal">
              {stats.consecutiveMissingMembers > 0 ? "需重点沟通" : "全员保持活跃"}
            </span>
          </div>
        </div>

        {/* 3. 周期大盘 */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#78716C]">发布周期大盘</span>
            <span
              className={`text-[12px] font-medium tabular-nums ${
                stats.periodFulfillmentRate >= 80
                  ? "text-[#6FAA7D]"
                  : stats.periodFulfillmentRate >= 60
                    ? "text-[#D97757]"
                    : "text-[#C0685C]"
              }`}
            >
              发布率 {stats.periodFulfillmentRate}%
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 pt-1 border-t border-[#ECE7DE]">
            <div className="flex flex-col">
              <span className="text-[11px] text-[#78716C] font-normal">总成员</span>
              <span className="mt-0.5 text-[13px] font-medium tabular-nums text-[#1C1917]">
                {stats.totalMembers}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-[#78716C] font-normal">
                <span className="inline-block size-1.5 rounded-full bg-[#6FAA7D] mr-1 align-middle" />
                已发
              </span>
              <span className="mt-0.5 text-[13px] font-medium tabular-nums text-[#1C1917]">
                {stats.publishedToday}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-[#78716C] font-normal">
                <span className="inline-block size-1.5 rounded-full bg-[#43718E] mr-1 align-middle" />
                豁免
              </span>
              <span className="mt-0.5 text-[13px] font-medium tabular-nums text-[#1C1917]">
                {stats.waivedToday + stats.leaveToday}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-[#78716C] font-normal">
                <span className="inline-block size-1.5 rounded-full bg-[#C0685C] mr-1 align-middle" />
                缺勤
              </span>
              <span className="mt-0.5 text-[13px] font-medium tabular-nums text-[#1C1917]">
                {stats.absentToday}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

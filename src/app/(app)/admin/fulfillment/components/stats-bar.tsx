"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

export function StatsBar({ stats }: StatsBarProps) {
  const hasPending = stats.pendingExemptionRequests > 0;
  const remainingCount = Math.max(0, stats.requiredCount - stats.publishedCount);

  return (
    <div className="border-y border-[#ECE7DE]/80 py-5 sm:py-6 transition-all duration-200">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* 1. 全月履约大盘（实发 vs 考核进度） */}
        <div className="flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#78716C]">全月作品进度</span>
            <span
              className={`text-[12px] font-medium tabular-nums px-2 py-0.5 rounded-md ${
                stats.periodFulfillmentRate >= 80
                  ? "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                  : stats.periodFulfillmentRate >= 60
                    ? "bg-[#B98A54]/10 text-[#B98A54]"
                    : "bg-[#C0685C]/10 text-[#C0685C]"
              }`}
            >
              达成率 {stats.periodFulfillmentRate}%
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-[580] tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.publishedCount}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">
                / {stats.requiredCount} 条应发
              </span>
            </div>
            <span className="text-[12px] text-[#78716C] font-normal tabular-nums">
              {remainingCount > 0 ? `还差 ${remainingCount} 条` : "全队已达标"}
            </span>
          </div>
        </div>

        {/* 2. 覆盖成员与全队达成率 */}
        <div className="flex flex-col justify-between space-y-2 border-t border-[#ECE7DE]/40 pt-4 lg:border-t-0 lg:border-l lg:border-[#ECE7DE]/60 lg:pl-8 lg:pt-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#78716C]">本月覆盖成员</span>
            <span className="text-[12px] text-[#78716C] font-normal">
              按作品条数对账
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-[580] tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.totalMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">位伙伴</span>
            </div>
            <div className="text-right text-[12px] text-[#78716C] font-normal tabular-nums">
              今日已发 <span className="text-[#1C1917] font-medium">{stats.publishedToday}</span> 人
            </div>
          </div>
        </div>

        {/* 3. 连续未发与待办警示 */}
        <div className="flex flex-col justify-between space-y-2 border-t border-[#ECE7DE]/40 pt-4 lg:border-t-0 lg:border-l lg:border-[#ECE7DE]/60 lg:pl-8 lg:pt-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#78716C]">待审批与断发</span>
            {hasPending ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#B98A54]/10 px-2 py-0.5 text-[11px] font-medium text-[#B98A54]">
                有待处理
              </span>
            ) : stats.consecutiveMissingMembers > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#B98A54]/10 px-2 py-0.5 text-[11px] font-medium text-[#B98A54]">
                需沟通
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#6FAA7D]/10 px-2 py-0.5 text-[11px] font-normal text-[#6FAA7D]">
                节奏平稳
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-[580] tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.consecutiveMissingMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">人连续未发</span>
            </div>
            <span className="text-[12px] text-[#78716C] font-normal tabular-nums">
              {hasPending ? `${stats.pendingExemptionRequests} 项请假待审` : "没有待审请假"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

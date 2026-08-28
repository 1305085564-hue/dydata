"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

export function StatsBar({ stats }: StatsBarProps) {
  const hasPending = stats.pendingExemptionRequests > 0;
  const remainingCount = Math.max(0, stats.requiredCount - stats.publishedCount);

  return (
    <div className="border-y border-[#ECE7DE] py-5 sm:py-6 transition-all duration-200">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* 1. 全月履约大盘（实发 vs 考核进度） */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#78716C]">全月作品进度</span>
            <span
              className={`text-[12px] font-medium tabular-nums ${
                stats.periodFulfillmentRate >= 80
                  ? "text-[#6FAA7D]"
                  : stats.periodFulfillmentRate >= 60
                    ? "text-[#D97757]"
                    : "text-[#C9604D]"
              }`}
            >
              达成率 {stats.periodFulfillmentRate}%
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.publishedCount}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">
                / {stats.requiredCount} 条应发
              </span>
            </div>
            <span className="text-[13px] text-[#78716C] font-normal tabular-nums">
              {remainingCount > 0 ? `还差 ${remainingCount} 条` : "全队已达目标"}
            </span>
          </div>
        </div>

        {/* 2. 覆盖成员与全队达成率 */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#78716C]">本月覆盖成员</span>
            <span className="text-[12px] text-[#78716C] font-normal">
              按作品条数对账
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.totalMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">位成员</span>
            </div>
            <div className="text-right text-[13px] text-[#78716C] font-normal tabular-nums">
              全队达成 {stats.periodFulfillmentRate}%
            </div>
          </div>
        </div>

        {/* 3. 连续未发与待办警示 */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#78716C]">待审批与断发</span>
            {hasPending ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#D97757]/10 px-2 py-0.5 text-[11px] font-medium text-[#D97757]">
                有待处理
              </span>
            ) : stats.consecutiveMissingMembers > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#D99E55]/10 px-2 py-0.5 text-[11px] font-medium text-[#8A6A2F]">
                需沟通
              </span>
            ) : (
              <span className="text-[11px] text-[#6FAA7D] font-normal">节奏平稳</span>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight leading-none text-[#1C1917]">
                {stats.consecutiveMissingMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">人连续未发</span>
            </div>
            <span className="text-[13px] text-[#78716C] font-normal tabular-nums">
              {hasPending ? `${stats.pendingExemptionRequests} 项请假待审` : "没有待审请假"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

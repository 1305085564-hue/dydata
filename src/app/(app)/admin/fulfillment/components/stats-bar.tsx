"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

export type StatsFilterMode = "all" | "missing" | "pending";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
  activeFilter?: StatsFilterMode;
  onFilterChange?: (mode: StatsFilterMode) => void;
  /** 与 pending 筛选结果同口径的待审人数（待审申诉 ∪ 今日待审请假） */
  pendingCount?: number;
}

export function StatsBar({
  stats,
  activeFilter = "all",
  onFilterChange,
  pendingCount,
}: StatsBarProps) {
  const pendingActionable = pendingCount ?? stats.pendingExemptionRequests;
  const hasPending = pendingActionable > 0;
  const remainingCount = Math.max(0, stats.requiredCount - stats.publishedCount);
  const hasMissing = stats.consecutiveMissingMembers > 0;

  const handleMissingClick = () => {
    if (!onFilterChange || !hasMissing) return;
    onFilterChange(activeFilter === "missing" ? "all" : "missing");
  };

  const handlePendingClick = () => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === "pending" ? "all" : "pending");
  };

  return (
    <div className="border-y border-[#ECE7DE]/80 py-5 sm:py-6 transition-all duration-200">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* 1. 全月履约大盘（实发 vs 考核进度） */}
        <div className="flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#78716C]">
              全月作品进度
            </span>
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
            <span className="text-[12px] font-medium uppercase tracking-wider text-[#78716C]">
              本月覆盖成员
            </span>
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

        {/* 3. 连续未发与待办警示（可交互脉搏卡片） */}
        <div
          onClick={handleMissingClick}
          className={`group/pulse flex flex-col justify-between space-y-2 border-t border-[#ECE7DE]/40 pt-4 lg:border-t-0 lg:border-l lg:border-[#ECE7DE]/60 lg:pl-8 lg:pt-0 rounded-xl p-2 -m-2 transition-all duration-150 ${
            hasMissing ? "cursor-pointer" : ""
          } ${
            activeFilter === "missing"
              ? "bg-[#D97757]/10 ring-1 ring-[#D97757]/30 shadow-2xs"
              : "hover:bg-[#F5F3EE]/60"
          }`}
          title={hasMissing ? "点击只筛选连续未发成员" : undefined}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium uppercase tracking-wider text-[#78716C] group-hover/pulse:text-[#1C1917] transition-colors">
                待审批与断发
              </span>
              {activeFilter === "missing" && (
                <span className="text-[10.5px] font-medium text-[#D97757] bg-[#D97757]/15 px-1.5 py-0.2 rounded">
                  已筛选
                </span>
              )}
            </div>
            {hasPending ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handlePendingClick();
                }}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                  activeFilter === "pending"
                    ? "bg-[#D97757] text-white"
                    : "bg-[#B98A54]/15 text-[#B98A54] hover:bg-[#B98A54]/25"
                }`}
                title="点击只看待审成员"
              >
                {pendingActionable} 人待审
              </span>
            ) : hasMissing ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#B98A54]/10 px-2 py-0.5 text-[11px] font-medium text-[#B98A54]">
                需跟进
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#6FAA7D]/10 px-2 py-0.5 text-[11px] font-normal text-[#6FAA7D]">
                节奏平稳
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-[580] tabular-nums tracking-tight leading-none transition-colors ${
                  activeFilter === "missing" ? "text-[#D97757]" : "text-[#1C1917]"
                }`}
              >
                {stats.consecutiveMissingMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">人连续未发</span>
            </div>
            <span className="text-[12px] text-[#78716C] font-normal tabular-nums">
              {hasPending
                ? `${pendingActionable} 人待审`
                : hasMissing
                  ? "点击聚焦断发"
                  : "暂无断发风险"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

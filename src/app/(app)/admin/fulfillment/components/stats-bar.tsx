"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";
import { Metric } from "@/components/ui/metric";
import { Badge } from "@/components/ui/badge";

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
    <div className="border-y border-[#E2E2DF]/60 py-5 sm:py-6 transition-all duration-200">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* 1. 全月履约大盘（实发 vs 考核进度） */}
        <div className="flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
              全月作品进度
            </span>
            <Badge
              variant={
                stats.periodFulfillmentRate >= 80
                  ? "success"
                  : stats.periodFulfillmentRate >= 60
                    ? "warning"
                    : "danger"
              }
              className="tabular-nums"
            >
              达成率 {stats.periodFulfillmentRate}%
            </Badge>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <Metric value={stats.publishedCount} />
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
        <div className="flex flex-col justify-between space-y-2 border-t border-[#E2E2DF]/60 pt-4 lg:border-t-0 lg:border-l lg:border-[#E2E2DF]/60 lg:pl-8 lg:pt-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
              本月覆盖成员
            </span>
            <span className="text-[12px] text-[#78716C] font-normal">
              按作品条数对账
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <Metric value={stats.totalMembers} />
              <span className="text-[13px] font-normal text-[#78716C]">位伙伴</span>
            </div>
            <div className="text-right text-[12px] text-[#78716C] font-normal tabular-nums">
              今日已发 <span className="text-[#141413] font-normal">{stats.publishedToday}</span> 人
            </div>
          </div>
        </div>

        {/* 3. 连续未发与待办警示（可交互脉搏卡片） */}
        <div
          onClick={handleMissingClick}
          className={`group/pulse flex flex-col justify-between space-y-2 border-t border-[#E2E2DF]/60 pt-4 lg:border-t-0 lg:border-l lg:border-[#E2E2DF]/60 lg:pl-8 lg:pt-0 rounded-xl p-2 -m-2 transition-all duration-150 ${
            hasMissing ? "cursor-pointer" : ""
          } ${
            activeFilter === "missing"
              ? "bg-[#D97757]/10 ring-1 ring-[#D97757]/30 shadow-input"
              : "hover:bg-[#EBEBE9]/60"
          }`}
          title={hasMissing ? "点击只筛选连续未发成员" : undefined}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C] group-hover/pulse:text-[#141413] transition-colors">
                待审批与断发
              </span>
              {activeFilter === "missing" && (
                <span className="text-[12px] font-normal text-[#D97757] bg-[#D97757]/15 px-1.5 rounded-md">
                  已筛选
                </span>
              )}
            </div>
            {hasPending ? (
              <Badge
                variant={activeFilter === "pending" ? "accent" : "warning"}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePendingClick();
                }}
                className="cursor-pointer transition-all hover:opacity-80"
                title="点击只看待审成员"
              >
                {pendingActionable} 人待审
              </Badge>
            ) : hasMissing ? (
              <Badge variant="warning">
                需跟进
              </Badge>
            ) : (
              <Badge variant="success">
                节奏平稳
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <Metric
                value={stats.consecutiveMissingMembers}
                tone={activeFilter === "missing" ? "accent" : "default"}
              />
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

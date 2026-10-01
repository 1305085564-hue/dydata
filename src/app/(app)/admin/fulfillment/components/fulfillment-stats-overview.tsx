"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";
import { Badge } from "@/components/ui/badge";

export type StatsFilterMode = "all" | "missing" | "pending";

interface FulfillmentStatsOverviewProps {
  stats: FulfillmentCalendarData["stats"];
  activeFilter?: StatsFilterMode;
  onFilterChange?: (mode: StatsFilterMode) => void;
  /** 与 pending 筛选结果同口径的待审人数（待审申诉 ∪ 今日待审请假） */
  pendingCount?: number;
}

export function FulfillmentStatsOverview({
  stats,
  activeFilter = "all",
  onFilterChange,
  pendingCount,
}: FulfillmentStatsOverviewProps) {
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

  const progressPercent = Math.min(100, Math.max(0, stats.periodFulfillmentRate));

  return (
    <section
      aria-label="发布与考勤总览大盘"
      className="rounded-xl border border-[#E2E2DF]/60 bg-white p-4 sm:p-5 shadow-card-ring transition-all duration-150"
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {/* 1. 全月履约进度卡片 */}
        <div className="flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
              全月发布进度
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

          <div className="mt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] font-medium text-[#141413] tracking-tight tabular-nums">
                {stats.publishedCount.toLocaleString()}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">
                / {stats.requiredCount.toLocaleString()} 条应发
              </span>
            </div>

            {/* 达成率细高进度条 */}
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F1F0]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  stats.periodFulfillmentRate >= 80
                    ? "bg-status-success"
                    : stats.periodFulfillmentRate >= 60
                      ? "bg-[#D97757]"
                      : "bg-status-danger"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-[12px] text-[#78716C]">
            <span className="tabular-nums">
              {remainingCount > 0 ? `还差 ${remainingCount.toLocaleString()} 条` : "全队已达标"}
            </span>
            <span className="text-[12px] text-[#A8A29E]">当月累计</span>
          </div>
        </div>

        {/* 2. 覆盖成员与今日发布 */}
        <div className="flex flex-col justify-between space-y-2 border-t border-[#E2E2DF]/60 pt-4 md:border-t-0 md:border-l md:border-[#E2E2DF]/60 md:pl-5 lg:pl-6">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
              团队在册人数
            </span>
            <span className="text-[12px] text-[#78716C] font-normal">
              今日动态
            </span>
          </div>

          <div className="mt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] font-medium text-[#141413] tracking-tight tabular-nums">
                {stats.totalMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">位伙伴</span>
            </div>
            <p className="mt-2 text-[12px] text-[#78716C]">
              今日已发 <span className="font-medium text-[#141413] tabular-nums">{stats.publishedToday}</span> 人
            </p>
          </div>

          <div className="pt-1 text-[12px] text-[#A8A29E]">
            按每人考核天数与实际作品对账
          </div>
        </div>

        {/* 3. 连续断更预警 (可交互脉搏卡片) */}
        <div
          onClick={handleMissingClick}
          role={hasMissing ? "button" : undefined}
          tabIndex={hasMissing ? 0 : undefined}
          onKeyDown={
            hasMissing
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleMissingClick();
                  }
                }
              : undefined
          }
          className={`flex flex-col justify-between space-y-2 border-t border-[#E2E2DF]/60 pt-4 md:border-t-0 md:border-l md:border-[#E2E2DF]/60 md:pl-5 lg:pl-6 rounded-md transition-all duration-150 ${
            hasMissing
              ? "cursor-pointer hover:bg-[#F7F7F6]/80 p-2 -m-2"
              : ""
          } ${
            activeFilter === "missing"
              ? "bg-[#D97757]/10 ring-1 ring-[#D97757]/30 shadow-input"
              : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
              连续断更预警
            </span>
            {hasMissing ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-danger/10 px-2 py-0.5 text-[12px] text-status-danger tabular-nums">
                <span className="size-1.5 rounded-full bg-status-danger" />
                {stats.consecutiveMissingMembers} 人预警
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-success/10 px-2 py-0.5 text-[12px] text-status-success">
                全员连更中
              </span>
            )}
          </div>

          <div className="mt-1">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-[20px] font-medium tracking-tight tabular-nums ${
                  hasMissing ? "text-status-danger" : "text-[#141413]"
                }`}
              >
                {stats.consecutiveMissingMembers}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">人连续未发</span>
            </div>
            <p className="mt-2 text-[12px] text-[#78716C]">
              连续未发布 ≥ 2 天成员
            </p>
          </div>

          <div className="pt-1 text-[12px]">
            {hasMissing ? (
              <span className="text-[#D97757] hover:underline font-normal inline-flex items-center gap-1">
                {activeFilter === "missing" ? "清除筛选 ×" : "点击快速排查 →"}
              </span>
            ) : (
              <span className="text-[#A8A29E]">暂无断更人员</span>
            )}
          </div>
        </div>

        {/* 4. 待审申诉与请假 (可交互卡片) */}
        <div
          onClick={handlePendingClick}
          role={hasPending ? "button" : undefined}
          tabIndex={hasPending ? 0 : undefined}
          onKeyDown={
            hasPending
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePendingClick();
                  }
                }
              : undefined
          }
          className={`flex flex-col justify-between space-y-2 border-t border-[#E2E2DF]/60 pt-4 lg:border-t-0 lg:border-l lg:border-[#E2E2DF]/60 lg:pl-6 rounded-md transition-all duration-150 ${
            hasPending
              ? "cursor-pointer hover:bg-[#F7F7F6]/80 p-2 -m-2"
              : ""
          } ${
            activeFilter === "pending"
              ? "bg-[#D97757]/10 ring-1 ring-[#D97757]/30 shadow-input"
              : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
              待处理审批
            </span>
            {hasPending ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#D97757]/15 px-2 py-0.5 text-[12px] text-[#D97757] tabular-nums font-normal">
                <span className="size-1.5 rounded-full bg-[#D97757]" />
                {pendingActionable} 项待办
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C]">
                已全部清空
              </span>
            )}
          </div>

          <div className="mt-1">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-[20px] font-medium tracking-tight tabular-nums ${
                  hasPending ? "text-[#D97757]" : "text-[#141413]"
                }`}
              >
                {pendingActionable}
              </span>
              <span className="text-[13px] font-normal text-[#78716C]">条需裁决</span>
            </div>
            <p className="mt-2 text-[12px] text-[#78716C]">
              今日待审补交与请假申请
            </p>
          </div>

          <div className="pt-1 text-[12px]">
            {hasPending ? (
              <span className="text-[#D97757] hover:underline font-normal inline-flex items-center gap-1">
                {activeFilter === "pending" ? "清除筛选 ×" : "点击批阅待办 →"}
              </span>
            ) : (
              <span className="text-[#A8A29E]">无待审申请</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

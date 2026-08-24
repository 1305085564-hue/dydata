"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ExemptionGrant } from "./types";

interface SubmissionOverviewCardProps {
  monthSubmittedDates: string[];
  exemptionGrants: ExemptionGrant[];
  today: string;
}

/**
 * 提交概览卡 - 配角微气垫
 * 显示本月提交进度和豁免状态
 */
export function SubmissionOverviewCard({
  monthSubmittedDates,
  exemptionGrants,
  today,
}: SubmissionOverviewCardProps) {
  const monthSubmitCount = monthSubmittedDates.length;

  const todayExemption = useMemo(() => {
    return exemptionGrants.find((g) => g.exempt_date === today);
  }, [exemptionGrants, today]);

  // 生成本月日历点阵（前 14 天）
  const recentDates = useMemo(() => {
    const dates: string[] = [];
    const todayDate = new Date(today);
    for (let i = 13; i >= 0; i--) {
      const date = new Date(todayDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      dates.push(dateStr);
    }
    return dates;
  }, [today]);

  return (
    <div className="rounded-2xl bg-[#F5F3EE] p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* 本月提交进度 */}
        <div className="space-y-1">
          <p className="text-[13px] text-[#78716C]">本月提交进度</p>
          <p className="text-2xl font-semibold tabular-nums text-[#1C1917]">
            {monthSubmitCount}{" "}
            <span className="text-lg font-normal text-[#78716C]">天</span>
          </p>
        </div>

        {/* Mini 日历点阵 */}
        <div className="flex items-center gap-1">
          {recentDates.map((date) => {
            const isSubmitted = monthSubmittedDates.includes(date);
            const isToday = date === today;
            const hasExemption = exemptionGrants.some(
              (g) => g.exempt_date === date && g.status === "approved"
            );

            return (
              <div
                key={date}
                className={cn(
                  "size-2 rounded-full transition-colors",
                  isSubmitted && "bg-[#6FAA7D]",
                  !isSubmitted && hasExemption && "bg-[#B98A54]",
                  !isSubmitted && !hasExemption && "bg-[#E5E0D6]",
                  isToday && "ring-1 ring-[#D97757] ring-offset-1"
                )}
                title={date}
              />
            );
          })}
        </div>
      </div>

      {/* 豁免状态提示 */}
      {todayExemption && (
        <div
          className={cn(
            "mt-4 rounded-lg border px-3 py-2 text-[13px]",
            todayExemption.status === "pending" &&
              "border-[#B98A54]/30 bg-[#B98A54]/5 text-[#B98A54]",
            todayExemption.status === "approved" &&
              "border-[#6FAA7D]/30 bg-[#6FAA7D]/5 text-[#6FAA7D]",
            todayExemption.status === "rejected" &&
              "border-[#C0685C]/30 bg-[#C0685C]/5 text-[#C0685C]"
          )}
        >
          {todayExemption.status === "pending" && "豁免申请审核中"}
          {todayExemption.status === "approved" && "今日已豁免"}
          {todayExemption.status === "rejected" &&
            `豁免被拒绝: ${todayExemption.reason}`}
        </div>
      )}
    </div>
  );
}

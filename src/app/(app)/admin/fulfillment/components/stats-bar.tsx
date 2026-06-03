"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

function BigStat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-zinc-400">{label}</span>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="font-mono text-[32px] font-semibold tabular-nums tracking-tight leading-none"
          style={{ color: color || "#18181b" }}
        >
          {value}
        </span>
        {sub ? <span className="text-[12px] font-medium text-zinc-400">{sub}</span> : null}
      </div>
    </div>
  );
}

function SmallStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <span
        className="font-mono text-[16px] font-semibold tabular-nums tracking-tight"
        style={{ color: color || "#3f3f46" }}
      >
        {value}
      </span>
    </div>
  );
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      {/* 左侧大数字 */}
      <div className="flex gap-8">
        <BigStat
          label="今日待处理"
          value={stats.pendingToday}
          color={stats.pendingToday > 0 ? "#C9604D" : "#6FAA7D"}
        />
        <BigStat
          label="连续未发"
          value={stats.consecutiveMissingMembers}
          color={stats.consecutiveMissingMembers > 0 ? "#D99E55" : undefined}
        />
      </div>

      {/* 分隔线 */}
      <div className="hidden h-10 w-px bg-zinc-200 sm:block" />

      {/* 右侧小数字 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SmallStat label="总成员" value={stats.totalMembers} />
        <SmallStat label="今日已发布" value={stats.publishedToday} color="#6FAA7D" />
        <SmallStat label="请假" value={stats.leaveToday} color="#8AA8C7" />
        <SmallStat label="豁免" value={stats.waivedToday} color="#8AA8C7" />
        <SmallStat label="缺勤" value={stats.absentToday} color="#C9604D" />
        <SmallStat
          label="发布率"
          value={`${stats.periodFulfillmentRate}%`}
          color={
            stats.periodFulfillmentRate >= 80
              ? "#6FAA7D"
              : stats.periodFulfillmentRate >= 60
                ? "#D99E55"
                : "#C9604D"
          }
        />
      </div>
    </div>
  );
}

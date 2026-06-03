"use client";

import type { FulfillmentCalendarData } from "@/types/fulfillment";

interface StatsBarProps {
  stats: FulfillmentCalendarData["stats"];
}

function StatItem({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-zinc-400">{label}</span>
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono text-[24px] font-semibold tabular-nums tracking-tight"
          style={{ color: color || "#18181b" }}
        >
          {value}
        </span>
        {unit ? <span className="text-[12px] font-medium text-zinc-400">{unit}</span> : null}
      </div>
    </div>
  );
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <StatItem
          label="本月发布率"
          value={stats.monthlyFulfillmentRate}
          unit="%"
          color={stats.monthlyFulfillmentRate >= 80 ? "#6FAA7D" : stats.monthlyFulfillmentRate >= 60 ? "#D99E55" : "#C9604D"}
        />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <StatItem
          label="今日待处理"
          value={stats.pendingToday}
          color={stats.pendingToday > 0 ? "#D99E55" : undefined}
        />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <StatItem label="已请假" value={stats.leaveToday} />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <StatItem label="已豁免" value={stats.waivedToday} />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <StatItem
          label="已缺勤"
          value={stats.absentToday}
          color={stats.absentToday > 0 ? "#C9604D" : undefined}
        />
      </div>
    </div>
  );
}

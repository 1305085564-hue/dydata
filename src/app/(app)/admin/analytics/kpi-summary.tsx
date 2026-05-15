"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface KpiReport {
  play_count: number | null;
  completion_rate: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_convert: number | null;
}

interface KpiSummaryProps {
  reports: KpiReport[];
  previousPeriodReports?: KpiReport[];
}

interface KpiAggregate {
  play: number;
  engagement: number;
  convert: number;
  completion: number | null;
}

function aggregate(reports: KpiReport[]): KpiAggregate {
  let play = 0;
  let engagement = 0;
  let convert = 0;
  let completionSum = 0;
  let completionCount = 0;

  for (const report of reports) {
    play += report.play_count ?? 0;
    engagement +=
      (report.likes ?? 0) +
      (report.comments ?? 0) +
      (report.shares ?? 0) +
      (report.favorites ?? 0);
    convert += report.follower_convert ?? 0;

    if (report.completion_rate) {
      const parsed = parseFloat(report.completion_rate.replace("%", ""));
      if (Number.isFinite(parsed)) {
        completionSum += parsed;
        completionCount += 1;
      }
    }
  }

  return {
    play,
    engagement,
    convert,
    completion: completionCount > 0 ? completionSum / completionCount : null,
  };
}

function formatBigNumber(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function computeChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function computePercentPointDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

interface DeltaInfo {
  text: string;
  direction: "up" | "down" | "flat";
}

function formatPercentDelta(delta: number | null): DeltaInfo | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
  const direction: DeltaInfo["direction"] = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return {
    text: `${arrow} ${Math.abs(rounded).toFixed(1)}%`,
    direction,
  };
}

function formatPpDelta(delta: number | null): DeltaInfo | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
  const direction: DeltaInfo["direction"] = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return {
    text: `${arrow} ${Math.abs(rounded).toFixed(1)}pp`,
    direction,
  };
}

function DeltaBadge({ delta }: { delta: DeltaInfo | null }) {
  if (!delta) return null;
  const tone =
    delta.direction === "up"
      ? "text-[#067647]"
      : delta.direction === "down"
        ? "text-[#B42318]"
        : "text-zinc-400";
  return (
    <span className={cn("text-[12px] font-mono tabular-nums", tone)}>
      {delta.text}
    </span>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  delta: DeltaInfo | null;
  hasComparison: boolean;
}

function KpiCard({ label, value, delta, hasComparison }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[12px] text-zinc-500">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tracking-tight text-zinc-900 font-mono tabular-nums leading-none">
        {value}
      </p>
      <div className="mt-1.5 h-[16px]">
        {hasComparison ? (
          delta ? (
            <DeltaBadge delta={delta} />
          ) : (
            <span className="text-[12px] text-zinc-400">vs 上周期 —</span>
          )
        ) : null}
      </div>
    </div>
  );
}

export function KpiSummary({ reports, previousPeriodReports }: KpiSummaryProps) {
  const current = useMemo(() => aggregate(reports), [reports]);
  const previous = useMemo(
    () => (previousPeriodReports ? aggregate(previousPeriodReports) : null),
    [previousPeriodReports],
  );

  const hasComparison = !!previousPeriodReports && previousPeriodReports.length > 0;

  const playDelta = previous ? formatPercentDelta(computeChange(current.play, previous.play)) : null;
  const engagementDelta = previous
    ? formatPercentDelta(computeChange(current.engagement, previous.engagement))
    : null;
  const convertDelta = previous
    ? formatPercentDelta(computeChange(current.convert, previous.convert))
    : null;
  const completionDelta = previous
    ? formatPpDelta(computePercentPointDelta(current.completion, previous.completion))
    : null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center border-l-2 border-[#D97757] pl-3">
        <h3 className="text-[14px] font-medium tracking-tight text-zinc-800">当前周期 KPI 速览</h3>
        {hasComparison ? (
          <span className="ml-auto text-[12px] text-zinc-400">vs 上周期</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="播放"
          value={formatBigNumber(current.play)}
          delta={playDelta}
          hasComparison={hasComparison}
        />
        <KpiCard
          label="互动"
          value={formatBigNumber(current.engagement)}
          delta={engagementDelta}
          hasComparison={hasComparison}
        />
        <KpiCard
          label="转化"
          value={formatBigNumber(current.convert)}
          delta={convertDelta}
          hasComparison={hasComparison}
        />
        <KpiCard
          label="完播"
          value={formatPercent(current.completion)}
          delta={completionDelta}
          hasComparison={hasComparison}
        />
      </div>
    </div>
  );
}

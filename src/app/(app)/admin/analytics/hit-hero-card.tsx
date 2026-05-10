"use client";

import { useMemo } from "react";

interface HeroReport {
  id: string;
  submitter: string;
  title: string | null;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
}

interface HitHeroCardProps {
  reports: HeroReport[];
  scopeLabel?: string | null;
}

function formatPlayCount(value: number) {
  if (value >= 100_000_000) return { num: (value / 100_000_000).toFixed(1), unit: "亿" };
  if (value >= 10_000) return { num: (value / 10_000).toFixed(1), unit: "万" };
  return { num: value.toLocaleString("zh-CN"), unit: "" };
}

function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function HitHeroCard({ reports, scopeLabel }: HitHeroCardProps) {
  const top = useMemo(() => {
    if (reports.length === 0) return null;
    return reports.reduce((leader, report) => {
      const leaderPlay = leader.play_count ?? 0;
      const reportPlay = report.play_count ?? 0;
      return reportPlay > leaderPlay ? report : leader;
    }, reports[0]);
  }, [reports]);

  if (!top || !top.play_count) {
    return (
      <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-zinc-200 bg-white px-8 py-8">
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">Hit Spotlight</p>
        <p className="mt-4 text-[14px] text-zinc-500">当前筛选范围暂无可聚焦的视频样本</p>
      </div>
    );
  }

  const { num, unit } = formatPlayCount(top.play_count);
  const engagement =
    (top.likes ?? 0) + (top.comments ?? 0) + (top.shares ?? 0) + (top.favorites ?? 0);
  const completion = parsePercent(top.completion_rate);

  return (
    <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D97757] bg-white px-8 py-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
            <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-[#D97757]">
              Hit Spotlight
            </p>
            {scopeLabel ? (
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                {scopeLabel}
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 line-clamp-1 text-[18px] font-medium tracking-tight text-zinc-800">
            {top.title || "未命名视频"}
          </h2>
          <p className="mt-1 text-[12px] text-zinc-400 tabular-nums">
            {top.submitter} · {top.report_date}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="text-[32px] font-semibold tabular-nums leading-none text-zinc-800">
              {num}
            </span>
            {unit ? (
              <span className="text-[12px] font-normal text-zinc-400">{unit}</span>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            Play Count
          </p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6 border-t border-zinc-100 pt-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            完播率
          </p>
          <p className="mt-1.5 text-[13px] font-medium tabular-nums text-zinc-800">
            {completion !== null ? `${completion.toFixed(1)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            互动总量
          </p>
          <p className="mt-1.5 text-[13px] font-medium tabular-nums text-zinc-800">
            {engagement.toLocaleString("zh-CN")}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            点赞
          </p>
          <p className="mt-1.5 text-[13px] font-medium tabular-nums text-zinc-800">
            {(top.likes ?? 0).toLocaleString("zh-CN")}
          </p>
        </div>
      </div>
    </div>
  );
}

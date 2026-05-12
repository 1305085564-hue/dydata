"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface ScriptsTopRow {
  id: string;
  script_text: string;
  total_views: number;
  total_follows: number;
  usage_count: number;
  weighted_conversion_rate: number | null;
}

export interface ScriptsTabData {
  topScripts: ScriptsTopRow[];
  totalCases: number;
  conversionCases: number;
  usageCount: number;
  totalViews: number;
  totalFollows: number;
  averageConversionRate: number | null;
  weeklyNewUsageRecords: number;
}

function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatRate(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

export function ScriptsTab({ data }: { data: ScriptsTabData }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-zinc-500">
          <span>转化话术 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{data.conversionCases}</span> / 话术库 <span className="font-mono tabular-nums text-zinc-700">{data.totalCases}</span></span>
          <span>累计使用 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{formatNumber(data.usageCount)}</span>（本周 +{data.weeklyNewUsageRecords}）</span>
          <span>累计涨粉 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{formatNumber(data.totalFollows)}</span></span>
          <span>平均转化率 <span className="ml-0.5 font-mono tabular-nums text-zinc-700">{formatRate(data.averageConversionRate)}</span></span>
        </div>
        <Link
          href="/violations/submit"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-[13px] text-white transition-[background-color] duration-150 hover:bg-zinc-800"
        >
          新增话术
          <ArrowRight className="size-3.5 stroke-[1.5]" />
        </Link>
      </div>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center border-l-2 border-[#D97757] pl-3">
            <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">TOP 10 转化话术</h2>
            <span className="ml-3 text-[11px] text-zinc-500">加权转化率，使用 ≥3 且展示 ≥1k</span>
          </div>
          <Link
            href="/admin/conversion-hub?tab=analytics"
            className="text-[12px] font-medium text-[#D97757] transition-[color] duration-150 hover:text-[#C46A49]"
          >
            查看全部 →
          </Link>
        </div>

        <div className="space-y-2">
          {data.topScripts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center text-[13px] text-zinc-400">
              暂无符合阈值的话术数据
            </div>
          ) : (
            data.topScripts.map((row, idx) => {
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
              return (
                <Link
                  key={row.id}
                  href={`/violations/${row.id}`}
                  className="group flex items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition-[background-color,border-color] duration-150 hover:border-zinc-200 hover:bg-zinc-50"
                >
                  <span className="mt-0.5 w-6 shrink-0 text-center text-[13px] font-medium text-zinc-400">
                    {medal ?? `#${idx + 1}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-snug text-zinc-800">
                      {row.script_text}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                      <span>展示 {formatNumber(row.total_views)}</span>
                      <span>涨粉 {formatNumber(row.total_follows)}</span>
                      <span>使用 {row.usage_count}</span>
                      <span className="font-medium text-[#6FAA7D]">
                        转化率 {formatRate(row.weighted_conversion_rate)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

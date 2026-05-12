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
  const kpis = [
    { label: "转化话术", value: data.conversionCases, hint: `话术库共 ${data.totalCases}` },
    { label: "累计使用", value: formatNumber(data.usageCount), hint: `本周新增 ${data.weeklyNewUsageRecords}` },
    { label: "累计涨粉", value: formatNumber(data.totalFollows), hint: `总展示 ${formatNumber(data.totalViews)}` },
    { label: "平均转化率", value: formatRate(data.averageConversionRate), hint: "加权 follow / view" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-medium tracking-tight text-zinc-800">转化话术沉淀</h2>
        <Link
          href="/violations/submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-[background-color] duration-150 hover:bg-zinc-800"
        >
          新增话术
          <ArrowRight className="size-3.5 stroke-[1.5]" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">{kpi.label}</p>
            <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-zinc-800 font-mono tabular-nums">
              {kpi.value}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-medium tracking-tight text-zinc-800">TOP 10 转化话术</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">按加权转化率，仅展示使用 ≥3 且展示 ≥1k</p>
          </div>
          <Link
            href="/admin/conversion-hub?tab=analytics"
            className="text-[12px] font-medium text-[#D97757] transition-[color] duration-150 hover:text-[#C46A49]"
          >
            查看全部 →
          </Link>
        </div>

        <div className="mt-4 space-y-2">
          {data.topScripts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center text-sm text-zinc-400">
              暂无符合阈值的话术数据
            </div>
          ) : (
            data.topScripts.map((row, idx) => {
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
              return (
                <Link
                  key={row.id}
                  href={`/violations/${row.id}`}
                  className="group flex items-start gap-3 rounded-lg border border-transparent px-2.5 py-2.5 transition-[background-color,border-color] duration-150 hover:border-zinc-200 hover:bg-zinc-50"
                >
                  <span className="mt-0.5 w-6 shrink-0 text-center text-[13px] font-medium text-zinc-400">
                    {medal ?? `#${idx + 1}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug text-zinc-800">
                      {row.script_text}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
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

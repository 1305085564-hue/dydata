"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Inbox } from "lucide-react";

export interface AnalyticsRow {
  id: string;
  script_text: string;
  script_format: "oral" | "visual" | "mixed";
  total_views: number;
  total_follows: number;
  usage_count: number;
  weighted_conversion_rate: number | null;
}

export interface TrendDay {
  date: string;
  count: number;
}

type SortBy = "rate" | "usage" | "views";
type FormatFilter = "all" | "oral" | "visual" | "mixed";

interface Props {
  rows: AnalyticsRow[];
  trend: TrendDay[];
  sort: SortBy;
  format: FormatFilter;
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

const FORMAT_LABEL: Record<"oral" | "visual" | "mixed", string> = {
  oral: "口播",
  visual: "画面",
  mixed: "混合",
};

const FORMAT_STYLE: Record<"oral" | "visual" | "mixed", string> = {
  oral: "bg-zinc-100 text-[#D97757]",
  visual: "bg-zinc-100 text-[#8AA8C7]",
  mixed: "bg-zinc-100 text-[#6FAA7D]",
};

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "rate", label: "转化率" },
  { value: "usage", label: "使用次数" },
  { value: "views", label: "总展示" },
];

const FORMAT_OPTIONS: Array<{ value: FormatFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "oral", label: "口播" },
  { value: "visual", label: "画面" },
  { value: "mixed", label: "混合" },
];

function buildHref(sort: SortBy, format: FormatFilter) {
  const params = new URLSearchParams();
  if (sort !== "rate") params.set("sort", sort);
  if (format !== "all") params.set("format", format);
  const qs = params.toString();
  return `/admin/conversion-hub/analytics${qs ? `?${qs}` : ""}`;
}

function formatDayShort(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function ConversionAnalyticsView({ rows, trend, sort, format }: Props) {
  const maxCount = Math.max(1, ...trend.map((t) => t.count));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
          Conversion Analytics
        </p>
        <h1 className="text-[20px] font-semibold tracking-tight text-zinc-800">数据分析</h1>
        <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">
          TOP 20 转化话术排行榜与近 7 日违规事件趋势
        </p>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-medium text-zinc-800">TOP 20 话术排行榜</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              转化话术，使用 ≥3 且展示 ≥1k
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 rounded-full bg-zinc-100 p-1">
            {SORT_OPTIONS.map((opt) => {
              const active = sort === opt.value;
              return (
                <Link
                  key={opt.value}
                  href={buildHref(opt.value, format)}
                  scroll={false}
                  className={`relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? "text-zinc-800" : "text-zinc-600 hover:text-zinc-800"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sort-active"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {FORMAT_OPTIONS.map((opt) => {
              const active = format === opt.value;
              return (
                <Link
                  key={opt.value}
                  href={buildHref(sort, opt.value)}
                  scroll={false}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[#D97757] bg-zinc-50 text-[#D97757]"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="rounded-l-lg border-y border-l border-zinc-200 px-3 py-3">#</th>
                  <th className="border-y border-zinc-200 px-3 py-3">话术</th>
                  <th className="border-y border-zinc-200 px-3 py-3">格式</th>
                  <th className="border-y border-zinc-200 px-3 py-3 text-right">使用</th>
                  <th className="border-y border-zinc-200 px-3 py-3 text-right">展示</th>
                  <th className="border-y border-zinc-200 px-3 py-3 text-right">涨粉</th>
                  <th className="rounded-r-lg border-y border-r border-zinc-200 px-3 py-3 text-right">转化率</th>
                </tr>
              </thead>
              <AnimatePresence mode="popLayout">
                <motion.tbody layout>
                  {rows.map((row, idx) => {
                    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                    return (
                      <motion.tr
                        key={row.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2) }}
                        className="text-zinc-700 transition-colors hover:bg-zinc-50"
                      >
                        <td className="border-b border-zinc-100 px-3 py-3">
                          <span className="font-semibold text-zinc-500">
                            {medal ?? `#${idx + 1}`}
                          </span>
                        </td>
                        <td className="max-w-[440px] border-b border-zinc-100 px-3 py-3">
                          <Link
                            href={`/violations/${row.id}`}
                            className="group flex items-start gap-2 text-zinc-800 hover:text-zinc-800"
                          >
                            <span className="line-clamp-2 leading-snug">{row.script_text}</span>
                            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${FORMAT_STYLE[row.script_format]}`}
                          >
                            {FORMAT_LABEL[row.script_format]}
                          </span>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-3 text-right font-mono tabular-nums">
                          {row.usage_count}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-3 text-right font-mono tabular-nums">
                          {formatNumber(row.total_views)}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-3 text-right font-mono tabular-nums">
                          {formatNumber(row.total_follows)}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-3 text-right font-semibold font-mono tabular-nums text-[#6FAA7D]">
                          {formatRate(row.weighted_conversion_rate)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </AnimatePresence>
            </table>
          )}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[18px] font-medium text-zinc-800">近 7 日违规事件趋势</h2>
            <p className="mt-0.5 text-xs text-zinc-500">数字化展示每日违规事件数量</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-2">
          {trend.map((day, idx) => {
            const ratio = day.count / maxCount;
            const alert = day.count >= 3;
            return (
              <motion.div
                key={day.date}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05, duration: 0.3, ease: "easeOut" }}
                className={`flex flex-col items-center rounded-xl border p-3 text-center ${
                  alert
                    ? "border-[#C9604D]/30 bg-zinc-50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {formatDayShort(day.date)}
                </p>
                <p
                  className={`mt-2 text-[20px] font-semibold font-mono tabular-nums ${
                    alert ? "text-[#C9604D]" : "text-zinc-800"
                  }`}
                >
                  {day.count}
                </p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, ratio * 100)}%` }}
                    transition={{ delay: 0.1 + idx * 0.05, duration: 0.4, ease: "easeOut" }}
                    className={`h-full ${alert ? "bg-[#C9604D]" : "bg-zinc-400"}`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm">
        <Inbox className="size-6 text-zinc-400" />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-600">暂无符合阈值的话术</p>
      <p className="mt-1 text-xs text-zinc-400">
        当话术使用次数 ≥3 且总展示 ≥1000 时会在此出现
      </p>
    </div>
  );
}

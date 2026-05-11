"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Flame,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import type { TopScriptRow } from "./page";

interface Stats {
  total_cases: number;
  conversion_cases: number;
  usage_count: number;
  total_views: number;
  total_follows: number;
  average_conversion_rate: number | null;
  weekly_new_usage_records: number;
  weekly_violation_events: number;
  week_start: string;
  top_scripts: TopScriptRow[];
}

interface Props {
  stats: Stats;
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

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return `${fmt(start)} - ${fmt(end)}`;
}

const KPI_TONES = {
  primary: "bg-zinc-100 text-[#D97757]",
  success: "bg-zinc-100 text-[#6FAA7D]",
  danger: "bg-zinc-100 text-[#C9604D]",
  info: "bg-zinc-100 text-[#8AA8C7]",
} as const;

function KpiCard({
  index,
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof KPI_TONES;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="text-[24px] font-semibold tracking-tight text-zinc-800 font-mono tabular-nums">{value}</p>
          <p className="text-xs text-zinc-400">{hint}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${KPI_TONES[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </motion.div>
  );
}

export function ConversionHubOverview({ stats }: Props) {
  const kpis = [
    {
      icon: ClipboardList,
      tone: "primary" as const,
      label: "转化话术总数",
      value: stats.conversion_cases,
      hint: `话术库总计 ${stats.total_cases} 条`,
    },
    {
      icon: TrendingUp,
      tone: "success" as const,
      label: "本周新增使用",
      value: stats.weekly_new_usage_records,
      hint: "累计使用 " + formatNumber(stats.usage_count) + " 次",
    },
    {
      icon: Flame,
      tone: "danger" as const,
      label: "本周违规事件",
      value: stats.weekly_violation_events,
      hint: stats.weekly_violation_events > 0 ? "需关注风险话术" : "本周暂无违规",
    },
    {
      icon: Sparkles,
      tone: "info" as const,
      label: "平均转化率",
      value: formatRate(stats.average_conversion_rate),
      hint: `总展示 ${formatNumber(stats.total_views)} · 涨粉 ${formatNumber(stats.total_follows)}`,
    },
  ];

  const shortcuts = [
    {
      href: "/admin/conversion-hub/analytics",
      icon: BarChart3,
      title: "数据分析",
      desc: "TOP20 话术排行榜与违规趋势",
    },
    {
      href: "/admin/conversion-hub/weekly",
      icon: CalendarCheck,
      title: "每周四类清单",
      desc: "推广 / 测试 / 废弃 / 封禁",
    },
    {
      href: "/violations",
      icon: ClipboardList,
      title: "原始话术库",
      desc: "查看全员案例与详情",
    },
  ];

  const workflowSteps = [
    {
      href: "/violations?perspective=conversion",
      icon: TrendingUp,
      title: "转化话术",
      desc: "先沉淀有效话术和使用数据",
      metric: `${stats.conversion_cases} 条`,
    },
    {
      href: "/admin/violations",
      icon: MessageSquareWarning,
      title: "违规风险",
      desc: "复核风险案例和处罚记录",
      metric: `${stats.weekly_violation_events} 个本周事件`,
    },
    {
      href: "/admin/conversion-hub/weekly",
      icon: CalendarCheck,
      title: "每周筛选",
      desc: "推广、测试、废弃、封禁四类清单",
      metric: "周维度",
    },
    {
      href: "/admin/advice",
      icon: ShieldCheck,
      title: "建议动作",
      desc: "把复核结论落到动作名单",
      metric: "闭环执行",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            Conversion Hub
          </p>
          <h1 className="text-[20px] font-semibold tracking-tight text-zinc-800">
            转化中心 · 管理员视角
          </h1>
          <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">
            审视转化话术、追踪违规风险、推进每周筛选决策
          </p>
        </div>
        <div className="rounded-[10px] border border-zinc-200 bg-white px-4 py-1.5 text-[12px] font-medium text-zinc-600">
          本周 · {formatWeekRange(stats.week_start)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <KpiCard key={kpi.label} index={idx} {...kpi} />
        ))}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.4, ease: "easeOut" }}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-medium text-zinc-800">转化闭环</h2>
            <p className="mt-0.5 text-xs leading-5 text-zinc-500">
              从有效话术开始，沿风险复核、每周筛选和建议动作顺序处理。
            </p>
          </div>
          <Link
            href="/violations/submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            新增话术
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {workflowSteps.map(({ href, icon: Icon, title, desc, metric }, index) => (
            <Link
              key={href}
              href={href}
              className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition-[border-color,background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm"
            >
              {index < workflowSteps.length - 1 ? (
                <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-zinc-200 lg:block" aria-hidden />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors group-hover:bg-[#D97757] group-hover:text-white">
                  <Icon className="size-5" />
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500">
                  {metric}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-zinc-800">{title}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{desc}</p>
            </Link>
          ))}
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.4, ease: "easeOut" }}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-medium text-zinc-800">TOP 10 转化话术</h2>
              <p className="mt-0.5 text-xs text-zinc-500">按加权转化率排序，仅展示使用 ≥3 且展示 ≥1k 的话术</p>
            </div>
            <Link
              href="/admin/conversion-hub/analytics"
              className="text-xs font-semibold text-[#D97757] hover:underline"
            >
              查看全部 →
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {stats.top_scripts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center text-sm text-zinc-400">
                暂无符合阈值的话术数据
              </div>
            ) : (
              stats.top_scripts.map((row, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                return (
                  <Link
                    key={row.id}
                    href={`/violations/${row.id}`}
                    className="group flex items-start gap-3 rounded-lg border border-transparent p-2.5 transition-colors hover:border-zinc-200 hover:bg-zinc-50"
                  >
                    <span className="mt-0.5 w-6 shrink-0 text-center text-[13px] font-medium text-zinc-400">
                      {medal ?? `#${idx + 1}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-sm leading-snug text-zinc-800 group-hover:text-zinc-800">
                        {row.script_text}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                        <span>展示 {formatNumber(row.total_views)}</span>
                        <span>涨粉 {formatNumber(row.total_follows)}</span>
                        <span>使用 {row.usage_count}</span>
                        <span className="font-semibold text-[#6FAA7D]">
                          转化率 {formatRate(row.weighted_conversion_rate)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-[18px] font-medium text-zinc-800">快捷入口</h2>
          <p className="mt-0.5 text-xs text-zinc-500">直达数据分析、每周清单与原始话术库</p>

          <div className="mt-4 space-y-3">
            {shortcuts.map(({ href, icon: Icon, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm active:translate-y-0 active:translate-y-0"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors group-hover:bg-[#D97757] group-hover:text-white">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-800">{title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{desc}</p>
                </div>
                <span className="text-xs text-zinc-400 transition-colors group-hover:text-[#D97757]">→</span>
              </Link>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

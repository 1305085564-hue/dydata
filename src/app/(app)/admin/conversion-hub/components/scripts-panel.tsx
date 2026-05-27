"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, BarChart3, FileText, Sparkles, TrendingUp, Users } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ScriptsTabData } from "../data";
import { AnimatedCounter } from "./animated-counter";

/* ─── helpers ─── */

function formatNumber(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatRate(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

/* ─── MiniKpiCard ─── */

function MiniKpiCard({
  icon: Icon,
  label,
  value,
  delay,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  delay: number;
  accent?: string;
}) {
  const isNumeric = typeof value === "number";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400">
        <Icon className="size-3.5 stroke-[1.5]" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className={cn("text-[16px] font-semibold tabular-nums", accent ?? "text-zinc-800")}>
          {isNumeric ? <AnimatedCounter value={value} duration={600} /> : value}
        </p>
      </div>
    </motion.div>
  );
}

/* ─── TopScriptRow ─── */

function TopScriptRow({
  row,
  rank,
}: {
  row: {
    id: string;
    script_text: string;
    total_views: number;
    total_follows: number;
    usage_count: number;
    weighted_conversion_rate: number | null;
  };
  rank: number;
}) {
  return (
    <Link
      href={`/violations/${row.id}`}
      className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-zinc-200 hover:bg-zinc-50"
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold",
          rank === 0
            ? "bg-[#D97757]/10 text-[#D97757]"
            : rank === 1 || rank === 2
              ? "bg-zinc-100 text-zinc-600"
              : "text-zinc-400"
        )}
      >
        {rank + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[12px] font-medium text-zinc-800">
          {row.script_text}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{formatNumber(row.total_views)} 展示</span>
          <span className="text-zinc-300">·</span>
          <span className="font-medium text-[#6FAA7D]">
            {formatRate(row.weighted_conversion_rate)}
          </span>
        </div>
      </div>
      <ArrowUpRight className="size-3.5 shrink-0 text-zinc-300 opacity-0 transition-all group-hover:opacity-100 group-hover:text-zinc-500" />
    </Link>
  );
}

/* ─── ConversionFunnel ─── */

function ConversionFunnel({ scripts }: { scripts: ScriptsTabData }) {
  const stages = [
    {
      label: "入库案例",
      value: scripts.totalCases,
      color: "bg-zinc-200",
      text: "text-zinc-700",
    },
    {
      label: "转化话术",
      value: scripts.conversionCases,
      color: "bg-[#D97757]",
      text: "text-white",
    },
    {
      label: "本周使用",
      value: scripts.weeklyNewUsageRecords,
      color: "bg-[#6FAA7D]",
      text: "text-white",
    },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="space-y-1">
      {stages.map((stage, i) => {
        const widthPct = (stage.value / max) * 100;
        const prev = i > 0 ? stages[i - 1].value : stage.value;
        const dropPct = prev > 0 ? ((prev - stage.value) / prev) * 100 : 0;

        return (
          <div key={stage.label}>
            <div className="flex justify-center">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(widthPct, 28)}%` }}
                transition={{
                  duration: 0.6,
                  delay: 0.15 + i * 0.1,
                  ease: [0.25, 0.46, 0.45, 0.94] as const,
                }}
                className={cn(
                  "flex h-7 items-center justify-center rounded-lg px-3",
                  stage.color
                )}
                style={{ minWidth: 100 }}
              >
                <span
                  className={cn(
                    "whitespace-nowrap text-[11px] font-medium",
                    stage.text
                  )}
                >
                  {stage.label} · {stage.value}
                </span>
              </motion.div>
            </div>
            {i < stages.length - 1 && dropPct > 0 && (
              <div className="flex justify-center py-0.5">
                <span className="text-[10px] text-zinc-400">
                  流失 {dropPct.toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── TrendMiniChart ─── */

function TrendMiniChart() {
  const bars = [35, 52, 48, 65, 58, 72, 68, 80, 75, 88];
  return (
    <div className="flex items-end gap-[3px] h-10">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${h}%` }}
          transition={{
            duration: 0.5,
            delay: 0.4 + i * 0.04,
            ease: [0.25, 0.46, 0.45, 0.94] as const,
          }}
          className={cn(
            "w-1.5 rounded-full",
            i === bars.length - 1 ? "bg-[#6FAA7D]" : "bg-zinc-200"
          )}
        />
      ))}
    </div>
  );
}

/* ─── ScriptsPanel ─── */

interface ScriptsPanelProps {
  scripts: ScriptsTabData;
}

export function ScriptsPanel({ scripts }: ScriptsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-zinc-800">话术资产</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">展示/涨粉/转化自动汇总</p>
          </div>
          <TrendMiniChart />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniKpiCard
            icon={FileText}
            label="入库案例"
            value={scripts.totalCases}
            delay={0.2}
          />
          <MiniKpiCard
            icon={Sparkles}
            label="转化话术"
            value={scripts.conversionCases}
            delay={0.25}
            accent="text-[#D97757]"
          />
          <MiniKpiCard
            icon={Users}
            label="累计使用"
            value={formatNumber(scripts.usageCount)}
            delay={0.3}
          />
          <MiniKpiCard
            icon={TrendingUp}
            label="本周新记录"
            value={scripts.weeklyNewUsageRecords}
            delay={0.35}
            accent="text-[#6FAA7D]"
          />
        </div>
      </motion.div>

      {/* TOP 排行榜 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-zinc-800">TOP 转化话术</h3>
          <span className="text-[11px] text-zinc-400">
            使用 ≥3 且展示 ≥1k
          </span>
        </div>

        {scripts.topScripts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-200 py-8 text-center">
            <p className="text-[12px] text-zinc-400">暂无符合阈值的话术数据</p>
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.04, delayChildren: 0.2 },
              },
            }}
            className="mt-3 space-y-0.5"
          >
            {scripts.topScripts.map((row, idx) => (
              <motion.div
                key={row.id}
                variants={{
                  hidden: { opacity: 0, x: -8 },
                  visible: {
                    opacity: 1,
                    x: 0,
                    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const },
                  },
                }}
              >
                <TopScriptRow row={row} rank={idx} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Conversion funnel */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-zinc-800">转化漏斗</h3>
          <span className="text-[11px] text-zinc-400">本周流转</span>
        </div>
        <div className="mt-4">
          <ConversionFunnel scripts={scripts} />
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <h3 className="text-[14px] font-semibold text-zinc-800">快捷操作</h3>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-left text-[12px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 active:translate-y-0"
          >
            <BarChart3 className="size-4 text-zinc-400" />
            查看完整数据报表
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-left text-[12px] font-medium text-zinc-600 transition-all hover:border-zinc-300 hover:bg-zinc-50 active:translate-y-0"
          >
            <Users className="size-4 text-zinc-400" />
            提醒员工补交数据
          </button>
        </div>
      </motion.div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { AnimatedCounter } from "./animated-counter";

interface CommandBarProps {
  counts: {
    pending_review: number;
    high_risk_pending: number;
    missing_data: number;
    promotion_candidates: number;
  };
}

export function CommandBar({ counts }: CommandBarProps) {
  const total =
    counts.high_risk_pending +
    counts.pending_review +
    counts.missing_data;

  const max = Math.max(total, 1);
  const highPct = (counts.high_risk_pending / max) * 100;
  const pendingPct = (counts.pending_review / max) * 100;
  const missingPct = (counts.missing_data / max) * 100;

  const segments = [
    {
      key: "high",
      label: "高风险",
      count: counts.high_risk_pending,
      width: highPct,
      color: "bg-[#C9604D]",
      text: "text-[#C9604D]",
    },
    {
      key: "pending",
      label: "待审核",
      count: counts.pending_review,
      width: pendingPct,
      color: "bg-[#D97757]",
      text: "text-[#D97757]",
    },
    {
      key: "missing",
      label: "缺数据",
      count: counts.missing_data,
      width: missingPct,
      color: "bg-zinc-400",
      text: "text-zinc-500",
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
    >
      <div className="flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: big number */}
        <div className="flex items-baseline gap-3">
          <span className="text-[36px] font-semibold tabular-nums leading-none text-zinc-800">
            <AnimatedCounter value={total} duration={900} />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-medium text-zinc-800">待处理</p>
            <p className="text-[12px] text-zinc-400">
              高风险 + 待审核 + 缺数据
            </p>
          </div>
        </div>

        {/* Center: distribution bar */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-0 sm:px-8">
          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100">
            {segments.map((s) =>
              s.count > 0 ? (
                <motion.div
                  key={s.key}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.width}%` }}
                  transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", s.color)}
                />
              ) : null
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {segments.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", s.color)} />
                <span className="text-[11px] text-zinc-500">{s.label}</span>
                <span className={cn("text-[11px] font-semibold tabular-nums", s.text)}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: promotion candidates */}
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5">
          <div className="text-right leading-tight">
            <p className="text-[11px] text-zinc-500">推广候选</p>
            <p className="text-[18px] font-semibold tabular-nums text-[#6FAA7D]">
              <AnimatedCounter value={counts.promotion_candidates} duration={600} />
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

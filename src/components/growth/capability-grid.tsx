"use client";

import { motion } from "framer-motion";


import { Badge } from "@/components/ui/badge";
import { containerVariants, itemVariants, useCountUp } from "@/lib/animations";
import type { GrowthDimensionCard } from "@/lib/growth-page";
import { cn } from "@/lib/utils";

const toneMap = {
  success: "border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/10 text-[var(--color-success)]",
  warning: "border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10 text-[var(--color-warning)]",
  danger: "border-[color:var(--color-danger)]/20 bg-[color:var(--color-danger)]/10 text-[var(--color-danger)]",
  neutral: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]",
} as const;

const signalMap = {
  red: "bg-[var(--color-danger)]",
  yellow: "bg-[var(--color-warning)]",
  green: "bg-[var(--color-success)]",
} as const;

function MetricValue({ value, text }: { value: number; text: string }) {
  const isPercent = text.endsWith("%");
  const { formattedValue } = useCountUp(value, 600, true, {
    maximumFractionDigits: isPercent ? 1 : 0,
    minimumFractionDigits: isPercent ? 1 : 0,
    compactThreshold: Number.POSITIVE_INFINITY,
  });

  return <span>{isPercent ? `${formattedValue}%` : text}</span>;
}

export function CapabilityGrid({ items }: { items: GrowthDimensionCard[] }) {
  if (!items.length) {
    return (
      <div className="rounded-[2rem] border border-zinc-200 bg-white p-5">
        <div className="space-y-3">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-zinc-950">六维能力</h2>
          <p className="text-sm text-zinc-500">数据不足，先连续提交数据后再看能力分布。</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-[10px] border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                --
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((item, index) => (
        <motion.div key={item.key} variants={itemVariants}>
          <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:-translate-y-[1px] hover:shadow-md">
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-[-0.02em] text-zinc-950">{item.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{item.metricLabel}</div>
                </div>
                <Badge className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", toneMap[item.rating.tone])} variant="outline">
                  {item.rating.label}
                </Badge>
              </div>

              <div className="text-3xl font-bold tabular-nums tracking-[-0.02em] text-zinc-950">
                <MetricValue value={item.metricValue} text={item.metricText} />
              </div>

              <div className="mt-auto space-y-2 rounded-[12px] border border-zinc-200 bg-white p-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className={cn("h-2.5 w-2.5 rounded-full", signalMap[item.sample.signal])} />
                  <span>{item.sample.label}</span>
                </div>
                <p className="text-sm leading-6 text-zinc-500">{item.sample.hint}</p>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

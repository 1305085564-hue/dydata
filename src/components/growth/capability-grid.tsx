"use client";

import { motion } from "framer-motion";


import { Badge } from "@/components/ui/badge";
import { containerVariants, itemVariants, useCountUp } from "@/lib/animations";
import type { GrowthDimensionCard } from "@/lib/growth-page";
import { cn } from "@/lib/utils";

const toneMap = {
  success: "border-stone-200 bg-stone-50 text-[#6FAA7D]",
  warning: "border-stone-200 bg-stone-50 text-[#D99E55]",
  danger: "border-stone-200 bg-stone-50 text-[#C9604D]",
  neutral: "border-stone-200 bg-stone-50 text-stone-500",
} as const;

const signalMap = {
  red: "bg-[#C9604D] ring-1 ring-white",
  yellow: "bg-[#D99E55] ring-1 ring-white",
  green: "bg-[#6FAA7D] ring-1 ring-white",
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
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="space-y-3">
          <h2 className="text-[18px] font-medium tracking-tight text-stone-800">六维能力</h2>
          <p className="text-[13px] leading-[1.7] text-stone-500">数据不足，先连续提交数据后再看能力分布。</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-dashed border-stone-200 px-3 py-2 text-[13px] text-stone-400">
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
      {items.map((item) => (
        <motion.div key={item.key} variants={itemVariants}>
          <div className="h-full rounded-xl border border-stone-200 bg-white p-5 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0">
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold tracking-tight text-stone-800">{item.name}</div>
                  <div className="mt-1 text-[11px] text-stone-500">{item.metricLabel}</div>
                </div>
                <Badge className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.25em]", toneMap[item.rating.tone])} variant="outline">
                  {item.rating.label}
                </Badge>
              </div>

              <div className="text-[24px] font-semibold font-mono tabular-nums tracking-tight text-stone-800">
                <MetricValue value={item.metricValue} text={item.metricText} />
              </div>

              <div className="mt-auto space-y-2 rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center gap-2 text-[11px] text-stone-500">
                  <span className={cn("h-2 w-2 rounded-full", signalMap[item.sample.signal])} />
                  <span>{item.sample.label}</span>
                </div>
                <p className="text-[13px] leading-[1.7] text-stone-500">{item.sample.hint}</p>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

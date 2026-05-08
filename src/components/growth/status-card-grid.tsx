"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";


import { containerVariants, itemVariants, useCountUp } from "@/lib/animations";
import type { StatusCardItem } from "@/lib/growth-page";

function StatusValue({ item }: { item: StatusCardItem }) {
  const options = item.compact
    ? { compactThreshold: 10000, compactDivisor: 10000, compactSuffix: "万", maximumFractionDigits: item.precision ?? 1, minimumFractionDigits: item.precision ?? 1 }
    : { compactThreshold: Number.POSITIVE_INFINITY, maximumFractionDigits: item.precision ?? 0, minimumFractionDigits: item.precision ?? 0 };
  const { formattedValue } = useCountUp(item.value, 600, true, options);
  return <span>{item.suffix ? `${formattedValue}${item.suffix}` : formattedValue}</span>;
}

function Delta({ item }: { item: StatusCardItem }) {
  if (item.delta === undefined || !item.deltaText || Math.abs(item.delta) < 0.01) return null;
  const up = item.delta >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#FEF3F2] text-[#B42318]"}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {item.deltaText}
    </span>
  );
}

export function StatusCardGrid({ items }: { items: StatusCardItem[] }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
    >
      {items.map((item, index) => (
        <motion.div key={item.label} variants={itemVariants} className="h-full">
          <div className="h-full rounded-2xl border border-zinc-200 bg-white p-4 transition-all hover:-translate-y-[1px] hover:shadow-md">
            <div className="flex h-full flex-col justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{item.label}</p>
              <div className="flex items-end justify-between gap-2">
                <div className="whitespace-nowrap text-2xl font-bold leading-none tabular-nums tracking-[-0.03em] text-zinc-950 sm:text-3xl">
                  <StatusValue item={item} />
                </div>
                <Delta item={item} />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

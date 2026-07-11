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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${up ? "bg-stone-50 text-[#6FAA7D]" : "bg-stone-50 text-[#C9604D]"}`}>
      {up ? <ArrowUp className="h-3 w-3 stroke-[1.5]" /> : <ArrowDown className="h-3 w-3 stroke-[1.5]" />}
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
      {items.map((item) => (
        <motion.div key={item.label} variants={itemVariants} className="h-full">
          <div className="h-full rounded-xl border border-stone-200 bg-white p-4 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0">
            <div className="flex h-full flex-col justify-between gap-3">
              <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">{item.label}</p>
              <div className="flex items-end justify-between gap-2">
                <div className="whitespace-nowrap text-[18px] font-medium leading-none tabular-nums tracking-tight text-stone-900 sm:text-[24px]">
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

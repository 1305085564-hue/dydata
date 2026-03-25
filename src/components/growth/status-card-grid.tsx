"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";

import { MotionCard } from "@/components/ui/motion-card";
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
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
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
      className="grid grid-cols-3 gap-2 sm:grid-cols-3 xl:grid-cols-5"
    >
      {items.map((item, index) => (
        <motion.div key={item.label} variants={itemVariants} className="h-full">
          <MotionCard index={index} className="h-full border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex h-full flex-col justify-between gap-2 p-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">{item.label}</p>
              <div className="flex items-end justify-between gap-1">
                <div className="text-xl font-bold tabular-nums tracking-[-0.02em] text-[var(--color-text-primary)]">
                  <StatusValue item={item} />
                </div>
                <Delta item={item} />
              </div>
            </div>
          </MotionCard>
        </motion.div>
      ))}
    </motion.div>
  );
}

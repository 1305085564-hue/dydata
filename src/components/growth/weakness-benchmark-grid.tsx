"use client";

import { motion } from "framer-motion";

import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { WeakBenchmarkCard } from "@/lib/growth-page";

export function WeaknessBenchmarkGrid({ items }: { items: WeakBenchmarkCard[] }) {
  if (!items.length) {
    return (
      <MotionCard className="border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="space-y-2 p-5">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">弱项对标</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">暂无可用对标数据</p>
        </div>
      </MotionCard>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }} className="grid gap-4 lg:grid-cols-2">
      {items.map((item, index) => (
        <motion.div key={`${item.dimension}-${index}`} variants={itemVariants}>
          <MotionCard index={index} className="h-full border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex h-full flex-col gap-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">弱项对标</p>
                <h3 className="mt-2 text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{item.dimension}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{item.headline}</p>
              </div>

              <div className="rounded-[12px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.7)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{item.personName}</span>
                  <span className="text-sm font-bold tabular-nums text-[var(--color-text-primary)]">{item.metricText}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{item.snippet}</p>
              </div>

              {item.historyTopSamples.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">历史 Top3</div>
                  <div className="grid gap-2">
                    {item.historyTopSamples.map((sample) => (
                      <div key={sample.id} className="flex items-center justify-between rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-primary)]">{sample.title}</span>
                        <span className="font-semibold tabular-nums text-[var(--color-text-secondary)]">{sample.metricText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </MotionCard>
        </motion.div>
      ))}
    </motion.div>
  );
}

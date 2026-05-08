"use client";

import { motion } from "framer-motion";


import { containerVariants, itemVariants } from "@/lib/animations";
import type { WeakBenchmarkCard } from "@/lib/growth-page";

export function WeaknessBenchmarkGrid({ items }: { items: WeakBenchmarkCard[] }) {
  if (!items.length) {
    return (
      <div className="rounded-[2rem] border border-zinc-200 bg-white p-5">
        <div className="space-y-2">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-zinc-950">弱项对标</h2>
          <p className="text-sm text-zinc-500">暂无可用对标数据</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }} className="grid gap-4 lg:grid-cols-2">
      {items.map((item, index) => (
        <motion.div key={`${item.dimension}-${index}`} variants={itemVariants}>
          <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:-translate-y-[1px] hover:shadow-md">
            <div className="flex h-full flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">弱项对标</p>
                <h3 className="mt-2 text-base font-semibold tracking-[-0.02em] text-zinc-950">{item.dimension}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{item.headline}</p>
              </div>

              <div className="rounded-[12px] border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-950">{item.personName}</span>
                  <span className="text-sm font-bold tabular-nums text-zinc-950">{item.metricText}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{item.snippet}</p>
              </div>

              {item.historyTopSamples.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">历史 Top3</div>
                  <div className="grid gap-2">
                    {item.historyTopSamples.map((sample) => (
                      <div key={sample.id} className="flex items-center justify-between rounded-[10px] border border-zinc-200 px-3 py-2 text-sm">
                        <span className="text-zinc-950">{sample.title}</span>
                        <span className="font-semibold tabular-nums text-zinc-500">{sample.metricText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

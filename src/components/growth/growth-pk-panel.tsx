"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";


import { containerVariants, itemVariants } from "@/lib/animations";
import type { GrowthPkRow } from "@/lib/growth-page";

function GapBar({ leftRatio, rightRatio, leftLeads }: { leftRatio: number; rightRatio: number; leftLeads: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} className="flex h-3 w-full overflow-hidden rounded-full bg-[color:var(--color-border)]/45">
      <motion.div
        className="h-full rounded-l-full"
        style={{ backgroundColor: leftLeads ? "#09090B" : "#a1a1aa" }}
        initial={{ width: 0 }}
        animate={inView ? { width: `${leftRatio * 100}%` } : { width: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="flex flex-1 justify-end">
        <motion.div
          className="h-full rounded-r-full"
          style={{ backgroundColor: leftLeads ? "#a1a1aa" : "#09090B" }}
          initial={{ width: 0 }}
          animate={inView ? { width: `${rightRatio * 100}%` } : { width: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        />
      </div>
    </div>
  );
}

function WinBadge({ leftLeads, tied }: { leftLeads: boolean; tied: boolean }) {
  if (tied) return <span className="text-xs text-[var(--color-text-secondary)]">持平</span>;
  return leftLeads ? (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-950">领先</span>
  ) : (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">落后</span>
  );
}

function Row({ row, leftName, rightName }: { row: GrowthPkRow; leftName: string; rightName: string }) {
  const max = Math.max(row.leftValue, row.rightValue, 1);
  const leftRatio = Math.max(row.leftValue / max, row.leftValue === 0 ? 0.01 : 0);
  const rightRatio = Math.max(row.rightValue / max, row.rightValue === 0 ? 0.01 : 0);
  const leftLeads = row.leftValue > row.rightValue;
  const tied = row.leftValue === row.rightValue;

  return (
    <motion.div variants={itemVariants} className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-950">{row.label}</span>
        <WinBadge leftLeads={leftLeads} tied={tied} />
      </div>
      <GapBar leftRatio={leftRatio} rightRatio={rightRatio} leftLeads={leftLeads} />
      <div className="mt-2 flex justify-between text-xs text-zinc-500">
        <span>
          <span className="font-medium text-zinc-950">{leftName}</span>{" "}
          <span className="tabular-nums">{row.leftText}</span>
        </span>
        <span>
          <span className="tabular-nums">{row.rightText}</span>{" "}
          <span className="font-medium text-zinc-950">{rightName}</span>
        </span>
      </div>
    </motion.div>
  );
}

export function GrowthPkPanel({ leftName, rightName, rows }: { leftName: string; rightName: string; rows: GrowthPkRow[] }) {
  const winCount = rows.filter((row) => row.leftValue > row.rightValue).length;
  const total = rows.length;

  return (
    <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">PK Compare</span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">PK 对比</h2>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{leftName} vs {rightName}</p>
          </div>
          {total > 0 && (
            <div className="shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center shadow-sm">
              <div className="text-base font-semibold tabular-nums text-zinc-950">
                {winCount}/{total}
              </div>
              <div className="text-[10px] text-zinc-500">项领先</div>
            </div>
          )}
        </div>
        {!rows.length ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            请先选择对比对象
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="space-y-3"
          >
            {rows.map((row) => (
              <Row key={row.key} row={row} leftName={leftName} rightName={rightName} />
            ))}
          </motion.div>
        )}
      </div>
  );
}

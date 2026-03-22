"use client";

import { motion } from "framer-motion";

import { MotionCard } from "@/components/ui/motion-card";
import { barVariants, containerVariants, itemVariants } from "@/lib/animations";
import type { GrowthPkRow } from "@/lib/growth-page";

function Row({ row, leftName, rightName }: { row: GrowthPkRow; leftName: string; rightName: string }) {
  const max = Math.max(row.leftValue, row.rightValue, 1);
  const leftWidth = `${(row.leftValue / max) * 100}%`;
  const rightWidth = `${(row.rightValue / max) * 100}%`;
  const barClass = row.isDanger ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary)]";

  return (
    <motion.div variants={itemVariants} className="rounded-[12px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.76)] p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] md:items-center">
        <div className="text-center md:text-right">
          <div className="text-xs text-[var(--color-text-secondary)]">{leftName}</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{row.leftText}</div>
        </div>

        <div className="space-y-2">
          <div className="text-center text-sm font-semibold text-[var(--color-text-primary)]">{row.label} · VS</div>
          <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
            <motion.div variants={barVariants} initial="hidden" animate="visible" className={`absolute left-0 top-0 h-full rounded-full ${barClass}`} style={{ width: leftWidth }} />
            <motion.div variants={barVariants} initial="hidden" animate="visible" className="absolute right-0 top-0 h-full rounded-full bg-[var(--color-text-secondary)]/45" style={{ width: rightWidth }} />
          </div>
        </div>

        <div className="text-center md:text-left">
          <div className="text-xs text-[var(--color-text-secondary)]">{rightName}</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{row.rightText}</div>
        </div>
      </div>
      <p className={`mt-3 text-sm leading-6 ${row.isDanger ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}`}>{row.insight}</p>
    </motion.div>
  );
}

export function GrowthPkPanel({ leftName, rightName, rows }: { leftName: string; rightName: string; rows: GrowthPkRow[] }) {
  return (
    <MotionCard className="border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">PK 对比</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">左右对比关键差距，红色表示差距已超过 30%。</p>
        </div>
        {!rows.length ? (
          <div className="rounded-[12px] border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,0.68)] p-4 text-sm text-[var(--color-text-secondary)]">
            请先选择对比对象
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }} className="space-y-3">
            {rows.map((row) => (
              <Row key={row.key} row={row} leftName={leftName} rightName={rightName} />
            ))}
          </motion.div>
        )}
      </div>
    </MotionCard>
  );
}

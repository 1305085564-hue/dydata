"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { GrowthPkRow } from "@/lib/growth-page";

function GapBar({ leftRatio, rightRatio, leftLeads }: { leftRatio: number; rightRatio: number; leftLeads: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} className="flex h-3 w-full overflow-hidden rounded-full bg-[color:var(--color-border)]/45">
      <motion.div
        className="h-full rounded-l-full"
        style={{ backgroundColor: leftLeads ? "var(--color-primary)" : "rgba(148,163,184,0.55)" }}
        initial={{ width: 0 }}
        animate={inView ? { width: `${leftRatio * 100}%` } : { width: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="flex flex-1 justify-end">
        <motion.div
          className="h-full rounded-r-full"
          style={{ backgroundColor: leftLeads ? "rgba(148,163,184,0.55)" : "var(--color-primary)" }}
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
    <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">领先</span>
  ) : (
    <span className="rounded-full bg-[color:var(--color-border)]/40 px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">落后</span>
  );
}

function Row({ row, leftName, rightName }: { row: GrowthPkRow; leftName: string; rightName: string }) {
  const max = Math.max(row.leftValue, row.rightValue, 1);
  const leftRatio = Math.max(row.leftValue / max, row.leftValue === 0 ? 0.01 : 0);
  const rightRatio = Math.max(row.rightValue / max, row.rightValue === 0 ? 0.01 : 0);
  const leftLeads = row.leftValue > row.rightValue;
  const tied = row.leftValue === row.rightValue;

  return (
    <motion.div variants={itemVariants} className="rounded-[12px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.76)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{row.label}</span>
        <WinBadge leftLeads={leftLeads} tied={tied} />
      </div>
      <GapBar leftRatio={leftRatio} rightRatio={rightRatio} leftLeads={leftLeads} />
      <div className="mt-2 flex justify-between text-xs text-[var(--color-text-secondary)]">
        <span>
          <span className="font-medium text-[var(--color-text-primary)]">{leftName}</span>{" "}
          <span className="tabular-nums">{row.leftText}</span>
        </span>
        <span>
          <span className="tabular-nums">{row.rightText}</span>{" "}
          <span className="font-medium text-[var(--color-text-primary)]">{rightName}</span>
        </span>
      </div>
    </motion.div>
  );
}

export function GrowthPkPanel({ leftName, rightName, rows }: { leftName: string; rightName: string; rows: GrowthPkRow[] }) {
  const winCount = rows.filter((row) => row.leftValue > row.rightValue).length;
  const total = rows.length;

  return (
    <MotionCard className="border-white/70 glass-panel backdrop-blur-[16px]">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">PK Compare</p>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">PK 对比</h2>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{leftName} vs {rightName}</p>
          </div>
          {total > 0 && (
            <div className="shrink-0 rounded-2xl border border-white/80 glass-panel px-3 py-2 text-center shadow-[var(--shadow-light)]">
              <div className="text-base font-semibold tabular-nums text-[var(--color-primary)]">
                {winCount}/{total}
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)]">项领先</div>
            </div>
          )}
        </div>
        {!rows.length ? (
          <div className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,0.68)] p-4 text-sm text-[var(--color-text-secondary)]">
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
    </MotionCard>
  );
}

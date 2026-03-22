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
    <div ref={ref} className="flex h-3 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.07)]">
      {/* 左侧 */}
      <motion.div
        className="h-full rounded-l-full"
        style={{ backgroundColor: leftLeads ? "#007AFF" : "#d1d5db" }}
        initial={{ width: 0 }}
        animate={inView ? { width: `${leftRatio * 100}%` } : { width: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* 右侧（从右向左展开，用 scaleX + origin-right） */}
      <div className="flex flex-1 justify-end">
        <motion.div
          className="h-full rounded-r-full"
          style={{ backgroundColor: leftLeads ? "#d1d5db" : "#007AFF" }}
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
    <span className="rounded-full bg-[#007AFF]/10 px-2 py-0.5 text-xs font-medium text-[#007AFF]">领先</span>
  ) : (
    <span className="rounded-full bg-[rgba(0,0,0,0.06)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">落后</span>
  );
}

function Row({ row, leftName, rightName }: { row: GrowthPkRow; leftName: string; rightName: string }) {
  const max = Math.max(row.leftValue, row.rightValue, 1);
  const leftRatio = row.leftValue / max;
  const rightRatio = row.rightValue / max;
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
    <MotionCard className="border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">PK 对比</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {leftName} vs {rightName}
            </p>
          </div>
          {total > 0 && (
            <div className="shrink-0 rounded-[10px] bg-[#007AFF]/10 px-3 py-1.5 text-center">
              <div className="text-base font-bold tabular-nums text-[#007AFF]">
                {winCount}/{total}
              </div>
              <div className="text-[10px] text-[#007AFF]/70">项领先</div>
            </div>
          )}
        </div>
        {!rows.length ? (
          <div className="rounded-[12px] border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,0.68)] p-4 text-sm text-[var(--color-text-secondary)]">
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

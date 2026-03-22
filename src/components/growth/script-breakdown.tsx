"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { MotionCard } from "@/components/ui/motion-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { ScriptBreakdownData } from "@/lib/growth-page";
import { cn } from "@/lib/utils";

type SegmentTone = "primary" | "warning" | "success" | "danger" | "neutral";

const toneMap = {
  primary: "border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10 text-[var(--color-primary)]",
  warning: "border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10 text-[var(--color-warning)]",
  success: "border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/10 text-[var(--color-success)]",
  danger: "border-[color:var(--color-danger)]/20 bg-[color:var(--color-danger)]/10 text-[var(--color-danger)]",
  neutral: "border-[var(--color-border)] bg-[rgba(255,255,255,0.7)] text-[var(--color-text-secondary)]",
} as const;

export function ScriptBreakdown({
  title,
  data,
  onSegmentSelect,
}: {
  title: string;
  data: ScriptBreakdownData;
  onSegmentSelect?: (payload: { startSec?: number | null; endSec?: number | null }) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const maxVisibleSegments = 3;
  const isStructured = data.state === "structured";
  const hasMoreSegments = isStructured && data.segments.length > maxVisibleSegments;
  const visibleSegments =
    isStructured && !expanded ? data.segments.slice(0, maxVisibleSegments) : isStructured ? data.segments : [];

  return (
    <MotionCard className="border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">按结构拆出重点段落，便于对照后续推流曲线。</p>
        </div>

        {isStructured ? (
          <>
            <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }} className="grid gap-3">
              {visibleSegments.map((segment) => (
                <motion.button
                  key={segment.id}
                  type="button"
                  variants={itemVariants}
                  onClick={() => onSegmentSelect?.({ startSec: segment.startSec, endSec: segment.endSec })}
                  className="rounded-[12px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.78)] p-4 text-left shadow-[var(--shadow-card)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] hover:-translate-y-[2px] hover:shadow-[var(--shadow-card-hover)] active:scale-[0.97]"
                >
                  <div className="flex items-center gap-2">
                    <Badge className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", toneMap[segment.tone as SegmentTone])} variant="outline">
                      {segment.label}
                    </Badge>
                    {segment.startSec !== undefined || segment.endSec !== undefined ? (
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        {segment.startSec ?? 0}s - {segment.endSec ?? "--"}s
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-primary)]">{segment.content}</p>
                </motion.button>
              ))}
            </motion.div>

            {hasMoreSegments ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 rounded-xl px-4"
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="size-4" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-4" />
                      展开全部（{data.segments.length}段）
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-3 rounded-[12px] border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,0.68)] p-4">
            {data.rawText ? <p className="text-sm leading-7 text-[var(--color-text-primary)]">{data.rawText}</p> : null}
            <div className="text-sm text-[var(--color-text-secondary)]">{data.placeholder}</div>
          </div>
        )}
      </div>
    </MotionCard>
  );
}

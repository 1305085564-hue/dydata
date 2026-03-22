"use client";

import { motion } from "framer-motion";

import { badgeClass } from "@/lib/tailwind-utils";
import { cn } from "@/lib/utils";
import type { SubmissionStage } from "./提交状态机";

const STAGES: SubmissionStage[] = ["草稿", "识别中", "待确认", "可提交", "已提交"];

interface SubmissionProgressProps {
  currentStage: SubmissionStage;
}

export function 提交进度条({ currentStage }: SubmissionProgressProps) {
  const currentIndex = STAGES.indexOf(currentStage);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STAGES.map((stage, index) => {
          const active = index <= currentIndex;
          const current = stage === currentStage;

          return (
            <div key={stage} className="flex items-center gap-2">
              <motion.div
                initial={{ scale: 0.92, opacity: 0.7 }}
                animate={{ scale: current ? 1 : 0.96, opacity: active ? 1 : 0.56 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  badgeClass(active ? "primary" : "neutral"),
                  "h-8 rounded-[var(--radius-xl)] px-3 text-xs font-semibold",
                  current && "ring-2 ring-[color:var(--color-primary)]/15"
                )}
              >
                {stage}
              </motion.div>
              {index < STAGES.length - 1 ? (
                <div className="h-px w-6 bg-black/10" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-black/6">
        <motion.div
          className="h-full rounded-full bg-[var(--color-primary)]"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / STAGES.length) * 100}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

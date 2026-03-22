"use client";

import { motion } from "framer-motion";

import { containerVariants, itemVariants } from "@/lib/animations";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { SubmissionSlotCard } from "./截图槽位卡";

interface SubmissionSlotsProps {
  slots: Record<SubmissionSlotRole, SubmissionSlotState & { fileName?: string; error?: string | null }>;
  onSelectFile: (role: SubmissionSlotRole, file: File) => void;
  onDelete: (role: SubmissionSlotRole) => void;
  onRetry?: (role: SubmissionSlotRole) => void;
}

const SLOT_META: Array<{
  role: SubmissionSlotRole;
  title: string;
  description: string;
  required: boolean;
}> = [
  { role: "overview", title: "槽1 overview", description: "数据总览截图", required: true },
  { role: "traffic_curve", title: "槽2 traffic_curve", description: "推流曲线图", required: true },
  { role: "retention_curve", title: "槽3 retention_curve", description: "跳出/完播图", required: true },
  { role: "engagement_extra", title: "槽4 engagement_extra", description: "互动补充图", required: false },
  { role: "other", title: "槽5 other", description: "其他", required: false },
];

export function 截图槽位区({ slots, onSelectFile, onDelete, onRetry }: SubmissionSlotsProps) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
          截图槽位区
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          3 个必传槽位全部确认后，才能继续提交。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SLOT_META.map((item) => {
          const slot = slots[item.role];

          return (
            <motion.div key={item.role} variants={itemVariants}>
              <SubmissionSlotCard
                role={item.role}
                title={item.title}
                description={item.description}
                required={item.required}
                status={slot.status}
                fileName={slot.fileName}
                error={slot.error}
                confidenceScore={slot.confidenceScore}
                onSelectFile={(file) => onSelectFile(item.role, file)}
                onDelete={() => onDelete(item.role)}
                onRetry={onRetry ? () => onRetry(item.role) : undefined}
              />
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

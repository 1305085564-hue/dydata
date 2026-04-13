"use client";

import { motion } from "framer-motion";

import { containerVariants, itemVariants } from "@/lib/animations";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { SubmissionSlotCard } from "./截图槽位卡";

interface SubmissionSlotsProps {
  slots: Record<SubmissionSlotRole, SubmissionSlotState & { fileName?: string; error?: string | null; ocrSummary?: string[] }>;
  onSelectFile: (role: SubmissionSlotRole, file: File) => void;
  onDelete: (role: SubmissionSlotRole) => void;
  onRetry?: (role: SubmissionSlotRole) => void;
  issueCount?: number;
  screenshotsRequired?: boolean;
}

const SLOT_META: Array<{
  role: SubmissionSlotRole;
  title: string;
  description: string;
  required: boolean;
}> = [
  { role: "screenshot_1", title: "截图 1", description: "播放数据 + 互动数据 + 推流曲线", required: true },
  { role: "screenshot_2", title: "截图 2", description: "完播/均播/2s跳出/5s完播 + 跳出率/回看率曲线", required: true },
  { role: "screenshot_3", title: "截图 3（可选）", description: "补充截图", required: false },
];

export function 截图槽位区({
  slots,
  onSelectFile,
  onDelete,
  onRetry,
  issueCount = 0,
  screenshotsRequired = true,
}: SubmissionSlotsProps) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
            截图上传
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {screenshotsRequired
              ? "上传 2 张截图（必传），AI 自动识别图片类型。可选上传第 3 张补充截图。"
              : "当前视频状态下截图改为可选。若能补传截图，系统仍会自动识别并回填数据。"}
          </p>
        </div>
        {issueCount > 0 ? (
          <span className="rounded-full bg-[color:rgba(255,149,0,0.12)] px-3 py-1 text-xs font-medium text-[var(--color-warning)]">
            待处理 {issueCount}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SLOT_META.map((item) => {
          const slot = slots[item.role];

          return (
            <motion.div key={item.role} variants={itemVariants}>
              <SubmissionSlotCard
                role={item.role}
                title={item.title}
                description={item.description}
                required={screenshotsRequired && item.required}
                status={slot.status}
                fileName={slot.fileName}
                error={slot.error}
                confidenceScore={slot.confidenceScore}
                ocrSummary={slot.ocrSummary}
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

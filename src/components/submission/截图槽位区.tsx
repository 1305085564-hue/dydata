"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

import { containerVariants, itemVariants } from "@/lib/animations";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { SubmissionSlotCard } from "./截图槽位卡";

interface SubmissionSlotsProps {
  slots: Record<SubmissionSlotRole, SubmissionSlotState & { fileName?: string; error?: string | null; assetUrl?: string | null; ocrSummary?: string[] }>;
  onSelectFile: (role: SubmissionSlotRole, file: File) => void;
  onDelete: (role: SubmissionSlotRole) => void;
  onRetry?: (role: SubmissionSlotRole) => void;
  issueCount?: number;
  screenshotsRequired?: boolean;
  focusedRole?: SubmissionSlotRole | null;
}

const SLOT_META: Array<{
  role: SubmissionSlotRole;
  title: string;
  description: string;
  required: boolean;
}> = [
  { role: "screenshot_1", title: "互动截图", description: "播放数据 + 互动数据 + 推流曲线", required: true },
  { role: "screenshot_2", title: "完播截图", description: "完播/均播/2s跳出/5s完播 + 跳出率/回看率曲线", required: true },
  { role: "screenshot_3", title: "导粉截图（可选）", description: "补充截图", required: false },
];

export function SubmissionSlotsSection({
  slots,
  onSelectFile,
  onDelete,
  onRetry,
  issueCount = 0,
  screenshotsRequired = true,
  focusedRole = null,
}: SubmissionSlotsProps) {
  const [showSlot3, setShowSlot3] = useState(false);

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

      <div className="flex flex-col gap-4">
        {SLOT_META.map((item) => {
          const slot = slots[item.role];

          if (item.role === "screenshot_3" && !showSlot3 && !slot.assetUrl && slot.status === "empty") {
            const isHighlighted = focusedRole === item.role;
            return (
              <motion.div key={item.role} variants={itemVariants}>
                <button
                  type="button"
                  onClick={() => setShowSlot3(true)}
                  className={[
                    "w-full flex items-center justify-center gap-2 h-11 rounded-[var(--radius-lg)] border text-sm font-medium transition-all duration-300",
                    isHighlighted
                      ? "border-[color:var(--color-primary)] bg-[color:rgba(0,122,255,0.05)] text-[var(--color-primary)] ring-4 ring-[color:rgba(0,122,255,0.15)]"
                      : "border-dashed border-black/10 bg-white/50 text-[var(--color-text-secondary)] hover:bg-white/80 hover:border-black/20"
                  ].join(" ")}
                >
                  展开上传导粉截图（可选）
                  <ChevronDown className="size-4 opacity-50" />
                </button>
              </motion.div>
            );
          }

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
                assetUrl={slot.assetUrl}
                isHighlighted={focusedRole === item.role}
                confidenceScore={slot.confidenceScore}
                ocrSummary={slot.ocrSummary}
                onSelectFile={(file) => onSelectFile(item.role, file)}
                onDelete={() => onDelete(item.role)}
                onRetry={onRetry ? () => onRetry(item.role) : undefined}
              />

              {item.role === "screenshot_3" && showSlot3 && !slot.assetUrl && slot.status === "empty" && (
                 <button type="button" onClick={() => setShowSlot3(false)} className="mt-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center gap-1 w-full mx-auto">
                   收起导粉截图 <ChevronUp className="size-3" />
                 </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

export { SubmissionSlotsSection as 截图槽位区 };

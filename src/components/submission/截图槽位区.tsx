"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { containerVariants, itemVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";
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
  highlightedOcrIndex?: number | null;
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
  highlightedOcrIndex = null,
}: SubmissionSlotsProps) {
  const [showSlot3, setShowSlot3] = useState(false);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-[13px] font-semibold tracking-tight text-zinc-800">
            截图上传
          </h3>
          <p className="text-[12px] leading-[1.7] text-zinc-500">
            {screenshotsRequired
              ? "上传 2 张截图（必传），AI 自动识别图片类型。可选上传第 3 张补充截图。"
              : "当前视频状态下截图改为可选。若能补传截图，系统仍会自动识别并回填数据。"}
          </p>
        </div>
        {issueCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
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
                  className={cn(
                    "w-full flex items-center justify-center gap-2 h-11 rounded-xl border text-[13px] font-medium transition-all duration-200",
                    isHighlighted
                      ? "border-[#D97757] bg-[#D97757]/5 text-[#C96442] ring-1 ring-inset ring-[#D97757]/20 shadow-[0_6px_16px_-10px_rgba(217,119,87,0.45)]"
                      : "border-dashed border-zinc-300 bg-white text-zinc-500 hover:border-[#D97757]/40 hover:bg-[#D97757]/[0.03] hover:text-[#C96442]"
                  )}
                >
                  展开上传导粉截图（可选）
                  <ChevronDown className="size-4 opacity-60" />
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
                highlightedOcrIndex={highlightedOcrIndex}
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

export { SubmissionSlotsSection as 截图槽位区 };

"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SummaryData } from "./types";

interface HealthBarProps {
  summary: SummaryData | null;
}

export function HealthBar({ summary }: HealthBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!summary) return null;

  const isHealthy =
    summary.unattributed === 0 && summary.neverFillMembers.length === 0;

  const healthRate = Math.round(
    ((summary.total - summary.unattributed) / (summary.total || 1)) * 100,
  );
  const neverFillCount = summary.neverFillMembers.length;
  const displayedMembers = summary.neverFillMembers.map((m) => m.name);

  return (
    <>
      {/* 控制舱右侧：静默芯片 (Pill Chip) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all ${
          isHealthy
            ? "bg-[#F5F3EE]/80 text-[#292524] hover:bg-[#E5E0D6]/60"
            : "bg-[#D99E55]/10 text-[#8A6A2F] hover:bg-[#D99E55]/15"
        }`}
      >
        {isHealthy ? (
          <CheckCircle2 className="size-3.5 text-[#6FAA7D] shrink-0 opacity-80" />
        ) : (
          <AlertCircle className="size-3.5 text-[#D99E55] shrink-0 opacity-90" />
        )}
        <span>
          {isHealthy
            ? "全量归属健康"
            : `归属健康度 ${healthRate}% (${summary.unattributed}条待归属)`}
        </span>
      </button>

      {/* 极轻明细弹窗 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md p-5 rounded-2xl border border-[#E5E0D6] bg-white shadow-claude-dialog">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-[#ECE7DE]">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-[#D99E55]" />
              <DialogTitle className="text-base font-medium text-[#1C1917]">
                归属健康度明细
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="size-6 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE]"
            >
              <X className="size-3.5" />
            </button>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-[13px] text-[#292524] leading-relaxed">
            <p>
              本月共有{" "}
              <strong className="font-medium text-[#1C1917]">
                {summary.total}
              </strong>{" "}
              条作品。 其中{" "}
              <strong className="font-medium text-[#8A6A2F]">
                {summary.unattributed}
              </strong>{" "}
              条作品缺乏明确的文案、剪辑或运营归属。
            </p>
            {neverFillCount > 0 && (
              <div className="rounded-xl border border-transparent bg-[#D99E55]/[0.08] p-3 space-y-1">
                <div className="font-medium text-[#8A6A2F] text-[12px]">
                  仅标注自运营的成员：
                </div>
                <div className="text-[12px] text-[#8A6A2F]">
                  {displayedMembers.join("、")}（共 {neverFillCount} 人）
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

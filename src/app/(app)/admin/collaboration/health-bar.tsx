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
            ? "bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/60"
            : "bg-[#F59E0B]/10 text-[#B45309] hover:bg-[#F59E0B]/15"
        }`}
      >
        {isHealthy ? (
          <CheckCircle2 className="size-3.5 text-[#16A34A] shrink-0 opacity-80" />
        ) : (
          <AlertCircle className="size-3.5 text-[#D97706] shrink-0 opacity-90" />
        )}
        <span>
          {isHealthy
            ? "全量归属健康"
            : `归属健康度 ${healthRate}% (${summary.unattributed}条待归属)`}
        </span>
      </button>

      {/* 极轻明细弹窗 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-[#D97706]" />
              <DialogTitle className="text-[15px] font-semibold text-zinc-900">
                归属健康度明细
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="size-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            >
              <X className="size-3.5" />
            </button>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-[13px] text-zinc-700 leading-relaxed">
            <p>
              本月共有{" "}
              <strong className="font-semibold text-zinc-900">
                {summary.total}
              </strong>{" "}
              条作品。 其中{" "}
              <strong className="font-semibold text-[#B45309]">
                {summary.unattributed}
              </strong>{" "}
              条作品缺乏明确的文案、剪辑或运营归属。
            </p>
            {neverFillCount > 0 && (
              <div className="rounded-xl border border-transparent bg-[#F59E0B]/[0.08] p-3 space-y-1">
                <div className="font-medium text-[#B45309] text-[12px]">
                  仅标注自运营的成员：
                </div>
                <div className="text-[12px] text-[#B45309]">
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

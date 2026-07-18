"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const QUICK_REASONS = [
  "话术内容不完整",
  "证据截图不足",
  "重复提交",
  "与现有案例雷同",
  "表述存在主观判断",
];

interface CaseRejectDialogProps {
  open: boolean;
  /** 描述当前处理对象 — 单条传话术片段、批量传 "批量驳回 N 条" */
  subject?: string;
  count?: number;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function CaseRejectDialog({
  open,
  subject,
  count = 1,
  busy = false,
  onOpenChange,
  onConfirm,
}: CaseRejectDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const canConfirm = trimmed.length > 0 && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    await onConfirm(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[13px]">
            {count > 1 ? `批量驳回 ${count} 条` : "驳回这条提交"}
          </DialogTitle>
          <DialogDescription>
            {subject ? (
              <span className="block truncate text-stone-500">{subject}</span>
            ) : null}
            原因会写入审批记录，提交人可在话术详情中看到。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Quick reason chips */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <motion.button
                key={r}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  reason === r
                    ? "border-[#C9604D]/40 bg-[#C9604D]/10 text-[#B24E3E]"
                    : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700",
                )}
              >
                {r}
              </motion.button>
            ))}
          </div>

          {/* Reason input */}
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="也可以补充更具体的驳回原因（必填）"
            className="min-h-[100px] resize-none rounded-xl border-stone-200 bg-white text-[13px] leading-[1.7] focus:border-stone-300 focus:ring-1 focus:ring-stone-950/5"
            autoFocus
            onKeyDown={(e) => {
              const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
              if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
                e.preventDefault();
                handleConfirm();
              }
            }}
          />
          <p className="text-[12px] text-stone-500">
            Cmd / Ctrl + Enter 直接提交
          </p>
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-9 rounded-lg border border-stone-200 bg-white px-4 text-[12px] font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#C9604D] px-4 text-[12px] font-medium text-white shadow-sm transition-all active:translate-y-[1px]",
              !canConfirm
                ? "cursor-not-allowed opacity-60"
                : "hover:bg-[#B0533F] hover:shadow-sm",
            )}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            确认驳回
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

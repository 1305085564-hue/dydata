"use client";

import { useState } from "react";
import { Check, Loader2, PenLine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export interface InlineFeedbackTrayProps {
  initialAction?: "approved" | "rejected";
  title: string;
  scopeHint: string;
  onConfirm: (action: "approved" | "rejected", feedback: string) => void;
  onCancel: () => void;
  required?: boolean;
  confirmLabel?: string;
  isSubmitting?: boolean;
}

export function InlineFeedbackTray({
  initialAction = "approved",
  title,
  scopeHint,
  onConfirm,
  onCancel,
  required = false,
  confirmLabel,
  isSubmitting = false,
}: InlineFeedbackTrayProps) {
  const [feedback, setFeedback] = useState("");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const isApprove = initialAction === "approved";

  const trimmed = feedback.trim();
  const isWhitespaceOnly = feedback.length > 0 && trimmed.length === 0;
  const isExceeding = feedback.length > 1000;
  const isInvalid = (required && !trimmed) || isExceeding;

  const handleSubmit = () => {
    setHasAttemptedSubmit(true);
    if (isInvalid || isSubmitting) return;
    onConfirm(initialAction, trimmed);
  };

  const placeholder = required
    ? "输入驳回原因（必填，⌘Enter 发送）..."
    : isApprove
      ? "输入同行批注或提醒（选填，按 ⌘Enter 发送）..."
      : "输入拒绝原因或建议（选填，按 ⌘Enter 发送）...";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: "auto", marginTop: 10 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden pt-1 space-y-2"
    >
      <div className="flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-1 font-normal text-[#1F1E1D]">
          <PenLine className="size-3.5 text-[#78716C]" />
          <span>{required ? title : `附带批注：${title}`}</span>
        </div>
        <div className="flex items-center gap-2">
          {required && (
            <span
              className={cn(
                "tabular-nums text-[12px]",
                isExceeding ? "text-status-danger font-normal" : "text-[#A8A29E]",
              )}
            >
              {feedback.length} / 1000
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-[12px] text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer disabled:opacity-40"
          >
            收起
          </button>
        </div>
      </div>

      <textarea
        value={feedback}
        autoFocus
        disabled={isSubmitting}
        onChange={(e) => setFeedback(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        rows={2}
        className={cn(
          "w-full rounded-xl border bg-white/50 focus:bg-white p-2.5 sm:p-3 text-[13px] text-[#141413] placeholder-[#78716C]/60 focus:outline-none transition-all resize-none shadow-input",
          hasAttemptedSubmit && isInvalid
            ? "border-status-danger focus:border-status-danger focus:ring-1 focus:ring-status-danger/20"
            : "border-[#E2E2DF] focus:border-[#78716C] focus:ring-1 focus:ring-[#141413]/10",
        )}
      />

      {hasAttemptedSubmit && required && !trimmed && (
        <p className="text-[12px] text-status-danger pt-0.5">
          {isWhitespaceOnly ? "驳回原因不能仅包含空格，请输入具体内容" : "请填写具体的驳回原因"}
        </p>
      )}

      {isExceeding && (
        <p className="text-[12px] text-status-danger pt-0.5">
          驳回原因不能超过 1000 字
        </p>
      )}

      <div className="flex items-center justify-between text-[12px] pt-0.5">
        <span className="text-[#78716C] truncate">{scopeHint}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md px-2 py-0.5 text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer disabled:opacity-40"
          >
            取消
          </button>
          <Button
            size="s"
            variant={isApprove ? "default" : "destructive"}
            disabled={isSubmitting || (hasAttemptedSubmit && isInvalid)}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isApprove ? (
              <Check className="size-3 stroke-[2.2]" />
            ) : (
              <X className="size-3 stroke-[2.2]" />
            )}
            <span>
              {isSubmitting
                ? "提交中…"
                : confirmLabel
                  ? confirmLabel
                  : isApprove
                    ? "确认同意并附批注"
                    : "确认拒绝并附批注"}
            </span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

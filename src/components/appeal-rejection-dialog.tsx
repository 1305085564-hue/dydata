"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface AppealRejectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
  isSubmitting?: boolean;
  title?: string;
  description?: string;
}

export function AppealRejectionDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
  title = "驳回补交申请",
  description = "驳回原因将通过通知发送给成员，请填写具体的驳回说明。",
}: AppealRejectionDialogProps) {
  const [reason, setReason] = useState("");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const trimmed = reason.trim();
  const isWhitespaceOnly = reason.length > 0 && trimmed.length === 0;
  const isExceeding = reason.length > 1000;
  const isInvalid = !trimmed || isExceeding;

  const handleClose = () => {
    if (isSubmitting) return;
    setReason("");
    setHasAttemptedSubmit(false);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    setHasAttemptedSubmit(true);
    if (isInvalid) return;
    await onConfirm(trimmed);
    setReason("");
    setHasAttemptedSubmit(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent className="max-w-md bg-white border border-[#E2E2DF] shadow-claude-dialog p-5 sm:p-6">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="text-[18px] font-medium text-[#141413]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[#78716C] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <div className="flex items-center justify-between text-[12px]">
            <label htmlFor="rejection-reason-input" className="text-[#1F1E1D] font-normal">
              驳回原因 <span className="text-status-danger">*</span>
            </label>
            <span
              className={`tabular-nums text-[12px] ${
                isExceeding ? "text-status-danger font-medium" : "text-[#A8A29E]"
              }`}
            >
              {reason.length} / 1000
            </span>
          </div>

          <textarea
            id="rejection-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请输入具体的驳回原因，例如发布截图不完整或日期有误..."
            rows={4}
            maxLength={1000}
            disabled={isSubmitting}
            className={`w-full resize-none rounded-md border bg-white p-2.5 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[#A8A29E] outline-none transition-colors ${
              hasAttemptedSubmit && isInvalid
                ? "border-status-danger focus-visible:border-status-danger focus-visible:ring-1 focus-visible:ring-status-danger/20"
                : "border-[#E2E2DF] focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
            }`}
          />

          {hasAttemptedSubmit && !trimmed && (
            <p className="text-[12px] text-status-danger pt-0.5">
              {isWhitespaceOnly ? "驳回原因不能仅包含空格，请输入具体内容" : "请填写具体的驳回原因"}
            </p>
          )}

          {isExceeding && (
            <p className="text-[12px] text-status-danger pt-0.5">
              驳回原因不能超过 1000 字
            </p>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="m"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-[13px]"
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="m"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || (hasAttemptedSubmit && isInvalid)}
            className="text-[13px]"
          >
            {isSubmitting ? "正在驳回..." : "确认驳回"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

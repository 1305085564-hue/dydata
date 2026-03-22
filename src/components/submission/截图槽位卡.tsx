"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { MotionCard } from "@/components/ui/motion-card";
import { shakeVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { NETWORK_RETRY_MESSAGE, OCR_FAIL_MESSAGE } from "./截图上传错误";
import type { SubmissionSlotRole, SubmissionSlotStatus } from "./提交状态机";

interface SubmissionSlotCardProps {
  role: SubmissionSlotRole;
  title: string;
  description: string;
  required: boolean;
  status: SubmissionSlotStatus;
  fileName?: string;
  error?: string | null;
  confidenceScore?: number | null;
  onSelectFile: (file: File) => void;
  onDelete: () => void;
  onRetry?: () => void;
}

const ACCEPT = ".jpg,.jpeg,.png,.webp";

function getStatusText(status: SubmissionSlotStatus) {
  switch (status) {
    case "uploading":
      return "上传中";
    case "recognizing":
      return "识别中";
    case "pending_confirm":
      return "待确认";
    case "confirmed":
      return "已确认";
    case "failed":
      return "识别失败";
    default:
      return "待上传";
  }
}

export function SubmissionSlotCard({
  title,
  description,
  required,
  status,
  fileName,
  error,
  confidenceScore,
  onSelectFile,
  onDelete,
  onRetry,
}: SubmissionSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessing = status === "uploading" || status === "recognizing";
  const isWarning = status === "pending_confirm" || ((confidenceScore ?? 1) < 0.7 && status !== "failed");
  const isError = status === "failed";
  const isSuccess = status === "confirmed";

  return (
    <MotionCard
      hover={!isProcessing}
      className={cn(
        "relative overflow-hidden border-none bg-white/75",
        isWarning && "ring-2 ring-[color:rgba(255,149,0,0.28)]",
        isError && "ring-2 ring-[color:rgba(255,59,48,0.28)]",
        isSuccess && "ring-2 ring-[color:rgba(52,199,89,0.24)]"
      )}
    >
      <motion.div
        variants={isError ? shakeVariants : undefined}
        initial={isError ? "initial" : undefined}
        animate={isError ? "animate" : undefined}
        className="space-y-4 p-4"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onSelectFile(file);
            }
            event.target.value = "";
          }}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h4>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                {required ? "必传" : "选传"}
              </span>
            </div>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">{description}</p>
          </div>
          <div className="text-xs font-medium text-[var(--color-text-secondary)]">{getStatusText(status)}</div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              onSelectFile(file);
            }
          }}
          className={cn(
            "relative flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed px-4 py-6 text-center transition-transform duration-200",
            "bg-[color:rgba(255,255,255,0.75)]",
            isWarning && "border-[color:var(--color-warning)] bg-[color:rgba(255,149,0,0.06)]",
            isError && "border-[color:var(--color-danger)] bg-[color:rgba(255,59,48,0.06)]",
            isSuccess && "border-[color:var(--color-success)] bg-[color:rgba(52,199,89,0.06)]",
            !isWarning && !isError && !isSuccess && "border-black/10 hover:scale-[1.02] hover:brightness-105 active:scale-[0.97]"
          )}
        >
          {isProcessing ? (
            <motion.div
              className="absolute inset-y-0 left-[-35%] w-1/3 bg-linear-to-r from-transparent via-white/75 to-transparent"
              animate={{ x: ["0%", "260%"] }}
              transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            />
          ) : null}

          <div className="relative flex size-14 items-center justify-center rounded-[var(--radius-xl)] bg-black/5 text-[var(--color-primary)]">
            {isProcessing ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
            <AnimatePresence>
              {isSuccess ? (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
                  className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-[var(--color-success)] text-white"
                >
                  <Check className="size-3.5" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              拖拽图片到这里，或点击上传
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              支持 jpg、png、webp，单张最大 8MB
            </p>
            {fileName ? <p className="text-xs text-[var(--color-text-primary)]">当前文件：{fileName}</p> : null}
          </div>
        </button>

        {isWarning ? (
          <div className="rounded-[var(--radius-lg)] bg-[color:rgba(255,149,0,0.08)] px-3 py-2 text-xs text-[var(--color-warning)]">
            请确认识别结果
          </div>
        ) : null}

        {isError ? (
          <div className="space-y-2 rounded-[var(--radius-lg)] bg-[color:rgba(255,59,48,0.08)] px-3 py-2 text-xs text-[var(--color-danger)]">
            <div>{error || OCR_FAIL_MESSAGE}</div>
            {onRetry && error === NETWORK_RETRY_MESSAGE ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-7 items-center rounded-[var(--radius-sm)] border border-[color:var(--color-danger)] px-2 text-xs"
              >
                重试
              </button>
            ) : null}
          </div>
        ) : null}

        {(fileName || status !== "empty") && !isProcessing ? (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--radius-md)]" onClick={onDelete}>
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        ) : null}
      </motion.div>
    </MotionCard>
  );
}

export { SubmissionSlotCard as 截图槽位卡 };

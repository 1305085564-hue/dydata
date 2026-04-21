"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MotionCard } from "@/components/ui/motion-card";
import { SPRING_EASE, shakeVariants } from "@/lib/animations";
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
  assetUrl?: string | null;
  isHighlighted?: boolean;
  confidenceScore?: number | null;
  ocrSummary?: string[];
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
  assetUrl,
  isHighlighted,
  confidenceScore,
  ocrSummary,
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
        "relative overflow-hidden border-2 bg-white/75 transition-colors duration-300",
        isHighlighted ? "border-[color:var(--color-primary)] ring-4 ring-[color:rgba(0,122,255,0.15)]" : "border-transparent",
        isWarning && "ring-2 ring-[color:rgba(255,149,0,0.28)]",
        isError && "ring-2 ring-[color:rgba(255,59,48,0.28)]",
        isSuccess && "ring-2 ring-[color:rgba(52,199,89,0.24)]"
      )}
    >
      <motion.div
        variants={isError ? shakeVariants : undefined}
        initial={isError ? "initial" : undefined}
        animate={isError ? "animate" : undefined}
        className="flex flex-col gap-3 p-4"
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
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h4>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                {required ? "必传" : "选传"}
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">{description}</p>
          </div>
          <div className="text-[11px] font-medium text-[var(--color-text-secondary)] whitespace-nowrap">{getStatusText(status)}</div>
        </div>

        <div className="flex gap-3 items-stretch">
          <div className="w-[45%] flex-shrink-0">
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
                "relative flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border-2 border-dashed px-2 py-3 text-center transition-all duration-300 cursor-pointer overflow-hidden group h-full",
                "bg-[color:rgba(255,255,255,0.75)]",
                isProcessing && "border-[color:rgba(0,122,255,0.45)] shadow-[0_0_0_1px_rgba(0,122,255,0.08),0_0_20px_rgba(0,122,255,0.12)]",
                isWarning && "border-[color:var(--color-warning)] bg-[color:rgba(255,149,0,0.06)]",
                isError && "border-[color:var(--color-danger)] bg-[color:rgba(255,59,48,0.06)]",
                isSuccess && "border-[color:var(--color-success)] bg-[color:rgba(52,199,89,0.06)]",
                !isProcessing && !isWarning && !isError && !isSuccess && "border-black/10 hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-0.5 hover:shadow-sm transition-all duration-300 active:scale-[0.98]"
              )}
            >
              {assetUrl && !isProcessing ? (
                <div className="absolute inset-0 z-10 w-full h-full overflow-hidden rounded-[inherit]" onClick={(e) => e.stopPropagation()}>
                  <Dialog>
                    <DialogTrigger
                      render={
                        <div className="w-full h-full cursor-zoom-in relative group/img">
                          <img src={assetUrl} alt="截图预览" className="w-full h-full object-cover opacity-60 group-hover/img:opacity-80 transition-opacity" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/20">
                            <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-md font-medium shadow-sm">放大</span>
                          </div>
                        </div>
                      }
                    />
                    <DialogContent className="max-w-4xl w-auto p-0 overflow-hidden bg-transparent border-none shadow-none" showCloseButton={false}>
                      <DialogTitle className="sr-only">截图预览放大</DialogTitle>
                      <img src={assetUrl} alt="截图放大" className="w-full h-auto object-contain max-h-[85vh] rounded-2xl shadow-2xl" />
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}

              {isProcessing ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                  <div
                    className="absolute inset-y-0 left-[-35%] w-1/3 bg-linear-to-r from-transparent via-white/80 to-transparent [animation:var(--animate-shimmer)] [animation-timing-function:linear] [animation-iteration-count:infinite]"
                    style={{ animationDuration: "1.5s" }}
                  />
                </div>
              ) : null}

              <div className="relative flex size-10 items-center justify-center rounded-[var(--radius-lg)] bg-black/5 text-[var(--color-primary)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary/10">
                {isProcessing ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
                <AnimatePresence>
                  {isSuccess ? (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: SPRING_EASE }}
                      className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[var(--color-success)] text-white"
                    >
                      <Check className="size-2.5" />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="space-y-0.5 px-1 relative z-10">
                {fileName ? (
                  <p className="text-[10px] text-[var(--color-text-primary)] truncate max-w-[120px] mx-auto opacity-70 bg-white/50 px-1 rounded">{fileName}</p>
                ) : (
                  <p className="text-[11px] font-medium text-[var(--color-text-primary)]">点击或拖拽</p>
                )}
              </div>
            </button>
          </div>

          <div className="w-[55%] flex flex-col gap-2 relative">
            {isWarning ? (
              <div className="rounded-[var(--radius-md)] bg-[color:rgba(255,149,0,0.08)] px-2.5 py-1.5 text-[11px] text-[var(--color-warning)]">
                请确认识别结果
              </div>
            ) : null}

            {isError ? (
              <div className="space-y-1.5 rounded-[var(--radius-md)] bg-[color:rgba(255,59,48,0.08)] px-2.5 py-1.5 text-[11px] text-[var(--color-danger)]">
                <div>{error || OCR_FAIL_MESSAGE}</div>
                {onRetry && error === NETWORK_RETRY_MESSAGE ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-6 items-center rounded-[var(--radius-sm)] border border-[color:var(--color-danger)] px-2 text-[10px]"
                  >
                    重试
                  </button>
                ) : null}
              </div>
            ) : null}

            {ocrSummary && ocrSummary.length > 0 ? (
              <div className="flex-1 rounded-[var(--radius-md)] bg-[color:rgba(0,122,255,0.04)] px-2.5 py-2 text-[11px] text-[var(--color-text-primary)] border border-[color:rgba(0,122,255,0.08)] overflow-hidden flex flex-col">
                <div className="font-semibold text-[var(--color-text-secondary)] mb-1 shrink-0 text-[10px] uppercase">AI 识别结果</div>
                <ul className="space-y-0.5 overflow-y-auto pr-1">
                  {ocrSummary.map((item) => (
                    <li key={item} className="leading-snug text-black/70">{item}</li>
                  ))}
                </ul>
              </div>
            ) : !isProcessing && !isError ? (
              <div className="flex-1 rounded-[var(--radius-md)] bg-black/[0.02] border border-black/5 flex items-center justify-center text-[10px] text-black/40">
                暂无识别结果
              </div>
            ) : null}

            {(fileName || status !== "empty") && !isProcessing ? (
              <div className="absolute right-0 top-0">
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] rounded hover:bg-red-50 hover:text-red-600" onClick={onDelete}>
                  <Trash2 className="size-3 mr-1" />
                  删除
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </MotionCard>
  );
}

export { SubmissionSlotCard as 截图槽位卡 };

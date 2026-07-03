"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { shakeVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { UPLOAD_LIMITS, formatSizeLimit } from "@/lib/upload-limits";
import { NETWORK_RETRY_MESSAGE, OCR_FAIL_MESSAGE, resolveOcrErrorMessage } from "./截图上传错误";
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
  highlightedOcrIndex?: number | null;
  onSelectFile: (file: File) => void;
  onDelete: () => void;
  onRetry?: () => void;
  onManualFill?: () => void;
  errorCode?: string | null;
}

const ACCEPT = ".jpg,.jpeg,.png,.webp";

interface StatusVisual {
  label: string;
  dotClass: string;
  textClass: string;
  borderClass: string;
}

function getStatusVisual(status: SubmissionSlotStatus, isWarning: boolean): StatusVisual {
  if (status === "uploading")
    return { label: "上传中", dotClass: "bg-[#D97757]", textClass: "text-[#D97757]", borderClass: "border-[#D97757]" };
  if (status === "recognizing")
    return { label: "识别中", dotClass: "bg-[#D97757]", textClass: "text-[#D97757]", borderClass: "border-[#D97757]" };
  if (status === "failed")
    return { label: "识别失败", dotClass: "bg-[#C9604D]", textClass: "text-[#C9604D]", borderClass: "border-[#C9604D]/40" };
  if (status === "confirmed" && !isWarning)
    return { label: "已识别", dotClass: "bg-[#6FAA7D]", textClass: "text-[#6FAA7D]", borderClass: "border-[#6FAA7D]/40" };
  if (isWarning || status === "pending_confirm")
    return { label: "待确认", dotClass: "bg-[#D99E55]", textClass: "text-[#D99E55]", borderClass: "border-[#D99E55]/40" };
  return { label: "待上传", dotClass: "bg-zinc-300", textClass: "text-zinc-500", borderClass: "border-zinc-200" };
}

export function SubmissionSlotCard({
  title,
  description,
  status,
  fileName,
  error,
  assetUrl,
  confidenceScore,
  ocrSummary,
  highlightedOcrIndex,
  onSelectFile,
  onDelete,
  onRetry,
  onManualFill,
  errorCode,
}: SubmissionSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessing = status === "uploading" || status === "recognizing";
  const isWarning = status === "pending_confirm" || ((confidenceScore ?? 1) < 0.7 && status !== "failed");
  const isError = status === "failed";
  const isSuccess = status === "confirmed" && !isWarning;

  const visual = getStatusVisual(status, isWarning);

  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const isProcessingRef = useRef(isProcessing);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (isProcessing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress((prev) => (prev === 100 ? 0 : prev));
      startTimeRef.current = performance.now();
      let frameId: number;

      function animate(currentTime: number) {
        if (!isProcessingRef.current) return;
        const elapsed = currentTime - startTimeRef.current;
        let currentProgress = 0;
        if (elapsed <= 10000) {
          currentProgress = elapsed * 0.008;
        } else {
          const extraTime = elapsed - 10000;
          currentProgress = 80 + 18 * (1 - Math.exp(-extraTime / 5000));
        }
        setProgress(currentProgress);
        if (isProcessingRef.current) {
          frameId = requestAnimationFrame(animate);
        }
      }
      frameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(frameId);
    }
    return undefined;
  }, [isProcessing]);

  useEffect(() => {
    if (!isProcessing) {
      if (status === "confirmed" || status === "failed" || status === "pending_confirm") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProgress(100);
      } else if (status === "empty") {
        setProgress(0);
      }
    }
  }, [isProcessing, status]);

  function handleFile(file: File) {
    if (file.size > UPLOAD_LIMITS.screenshot) {
      feedbackToast.error(`文件超过 ${formatSizeLimit(UPLOAD_LIMITS.screenshot)} 限制，请压缩后重试`);
      return;
    }
    onSelectFile(file);
  }

  return (
    <motion.div
      variants={isError ? shakeVariants : undefined}
      initial={isError ? "initial" : undefined}
      animate={isError ? "animate" : undefined}
      className="group relative"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
          event.target.value = "";
        }}
      />

      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-medium leading-tight tracking-tight text-zinc-800">
              {title}
            </span>
            {description ? (
              <span className="truncate text-[12px] leading-tight text-zinc-400">
                {description}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status !== "empty" && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border bg-white px-2 py-[3px] text-[11px] font-medium transition-colors duration-150",
                visual.borderClass,
                visual.textClass,
              )}
            >
              <span className={cn("size-1.5 rounded-full", visual.dotClass)} />
              {visual.label}
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={() => !isProcessing && inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isProcessing && !assetUrl) setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={isProcessing}
          className="relative col-span-1"
        >
          <motion.div 
            animate={{ 
              scale: isDragOver ? 1.02 : 1,
              borderColor: isDragOver ? "#D97757" : (assetUrl || isProcessing ? "transparent" : "#e4e4e7") 
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={cn(
              "group/drop relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border bg-zinc-50/60 text-zinc-400 transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
              !assetUrl && !isProcessing && !isDragOver && (isTouchDevice ? "border-solid border-zinc-200 bg-white active:scale-[0.98]" : "border-dashed hover:border-[#D97757]/45 hover:bg-[#FDF9F7]/60 hover:text-[#D97757]"),
              !assetUrl && isDragOver && "border-solid border-[#D97757] bg-[#FDF9F7] text-[#D97757] shadow-[0_0_20px_rgba(217,119,87,0.15)] ring-2 ring-[#D97757]/20",
              isProcessing && "bg-white border-zinc-100",
              assetUrl && !isProcessing && "bg-white p-0 border-zinc-200",
              isError && !assetUrl && "border-dashed border-[#C9604D]/40 bg-white",
            )}
          >
          {assetUrl && !isProcessing ? (
            <div
              className="absolute inset-0 z-10 overflow-hidden rounded-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <Dialog>
                <DialogTrigger
                  render={
                    <div className="group/img relative h-full w-full cursor-zoom-in">
                      <img src={assetUrl} alt="截图预览" className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02]" />
                      <div className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/35 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-150 group-hover/img:opacity-100">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 backdrop-blur">
                          <Eye className="size-3 stroke-[1.6]" /> 放大
                        </span>
                      </div>
                    </div>
                  }
                />
                <DialogContent
                  className="w-auto max-w-4xl overflow-hidden border-none bg-transparent p-0 shadow-none"
                  showCloseButton={false}
                >
                  <DialogTitle className="sr-only">截图预览放大</DialogTitle>
                  <img src={assetUrl} alt="截图放大" className="h-auto max-h-[85vh] w-full rounded-2xl object-contain" />
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          {isProcessing ? (
            <div className="relative z-10 flex w-full max-w-[180px] flex-col items-center gap-2.5 px-4">
              <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                <motion.div
                  className="h-full rounded-full bg-[#D97757]"
                  initial={false}
                  animate={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
              <span className="font-mono text-[11px] tabular-nums tracking-[0.1em] text-[#D97757]">
                {status === "uploading" ? "UPLOADING" : "AI READING"} · {Math.floor(Math.min(99, progress))}%
              </span>
            </div>
          ) : null}

          {!assetUrl && !isProcessing ? (
            <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-center">
              <motion.div 
                animate={{ y: isDragOver ? -4 : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <UploadCloud className="size-8 stroke-[1.4]" />
              </motion.div>
              <span className="text-[13px] font-medium leading-snug">
                {isDragOver ? "松开以上传截图" : (isTouchDevice ? "点击从相册选择" : "点击或拖入截图")}
              </span>
              <span className="text-[10px] tracking-wide text-zinc-400">
                JPG / PNG / WEBP · ≤ {formatSizeLimit(UPLOAD_LIMITS.screenshot)}
              </span>
            </div>
          ) : null}

          <AnimatePresence>
            {isSuccess ? (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 22 }}
                className="absolute right-2 top-2 z-20 flex size-6 items-center justify-center rounded-full bg-[#6FAA7D] text-white ring-2 ring-white"
              >
                <Check className="size-3.5" strokeWidth={2.5} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          </motion.div>
        </button>

        <div className="flex min-h-[150px] flex-col gap-2.5">
          {ocrSummary && ocrSummary.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-zinc-50/80 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">
                  <span className="size-1 rounded-full bg-[#D97757]" />
                  AI 识别结果
                </span>
                {fileName ? (
                  <span className="max-w-[140px] truncate font-mono text-[10px] tracking-wide text-zinc-400">
                    {fileName}
                  </span>
                ) : null}
              </div>
              <ul className="custom-scrollbar max-h-[130px] space-y-0.5 overflow-y-auto pr-1">
                {ocrSummary.map((item, idx) => (
                  <li
                    key={item}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[12px] leading-snug transition-[color,background-color] duration-150",
                      highlightedOcrIndex === idx
                        ? "bg-[#D97757]/10 font-medium text-[#C96442]"
                        : "text-zinc-700",
                    )}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-[#C9604D]/30 bg-white p-3">
              <p className="flex items-start gap-1.5 text-[12px] font-medium text-[#C9604D]">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-[#C9604D]" />
                <span>{errorCode ? resolveOcrErrorMessage(errorCode) : error || OCR_FAIL_MESSAGE}</span>
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-7 items-center rounded-lg border border-[#C9604D]/35 bg-white px-2.5 text-[11px] font-medium text-[#C9604D] transition-[background-color,border-color] duration-150 hover:bg-[#C9604D] hover:text-white"
                  >
                    {error === NETWORK_RETRY_MESSAGE ? "重试" : "重新识别"}
                  </button>
                ) : null}
                {onManualFill ? (
                  <button
                    type="button"
                    onClick={onManualFill}
                    className="inline-flex h-7 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 transition-[background-color,border-color,color] duration-150 hover:bg-zinc-50 hover:text-zinc-800"
                  >
                    手动填写
                  </button>
                ) : null}
              </div>
            </div>
          ) : isProcessing ? (
            <div className="flex flex-1 items-center justify-center rounded-xl bg-zinc-50/80 p-4">
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1">
                  <span className="size-1 animate-pulse rounded-full bg-[#D97757]" style={{ animationDelay: "0ms" }} />
                  <span className="size-1 animate-pulse rounded-full bg-[#D97757]" style={{ animationDelay: "120ms" }} />
                  <span className="size-1 animate-pulse rounded-full bg-[#D97757]" style={{ animationDelay: "240ms" }} />
                </div>
                <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-400">PARSING METRICS</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl bg-zinc-50/60 p-4">
              <div className="relative flex size-12 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-dashed border-zinc-200" />
                <div className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 bg-zinc-200" />
                <div className="absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-zinc-200" />
                <span className="relative size-1 rounded-full bg-zinc-300" />
              </div>
              <span className="ml-3 text-[11px] tracking-wide text-zinc-400">等待识别结果</span>
            </div>
          )}
        </div>
      </div>

      {(fileName || status !== "empty") && !isProcessing ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除截图"
          className="absolute right-0 top-0 inline-flex size-7 items-center justify-center rounded-full text-zinc-300 transition-[background-color,color] duration-150 hover:bg-zinc-100 hover:text-[#C9604D]"
        >
          <Trash2 className="size-3.5 stroke-[1.6]" />
        </button>
      ) : null}
    </motion.div>
  );
}

export { SubmissionSlotCard as 截图槽位卡 };

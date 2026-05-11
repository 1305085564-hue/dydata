"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  highlightedOcrIndex?: number | null;
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
  highlightedOcrIndex,
  onSelectFile,
  onDelete,
  onRetry,
}: SubmissionSlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessing = status === "uploading" || status === "recognizing";
  const isWarning = status === "pending_confirm" || ((confidenceScore ?? 1) < 0.7 && status !== "failed");
  const isError = status === "failed";
  const isSuccess = status === "confirmed";
  const isEmpty = status === "empty";

  const [progress, setProgress] = useState(0);
  const isProcessingRef = useRef(isProcessing);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    if (isProcessing) {
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
          currentProgress = 80 + (18 * (1 - Math.exp(-extraTime / 5000)));
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
        setProgress(100);
      } else if (status === "empty") {
        setProgress(0);
      }
    }
  }, [isProcessing, status]);

  // 高亮样式：已填充实线边框 + 阴影 + 微上浮；空槽位虚线边框
  const highlightActive = isHighlighted && !isError && !isWarning && !isSuccess;

  return (
    <motion.div
      variants={isError ? shakeVariants : undefined}
      initial={isError ? "initial" : undefined}
      animate={isError ? "animate" : undefined}
      className={cn(
        "group/card relative overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
        // 默认态
        !highlightActive && !isError && !isWarning && !isSuccess && "border-zinc-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.15)]",
        // 高亮态（已填充）
        highlightActive && !isEmpty && "border-[#D97757] shadow-[0_12px_32px_-12px_rgba(217,119,87,0.35)] -translate-y-0.5",
        // 高亮态（空槽位）
        highlightActive && isEmpty && "border-dashed border-[#D97757] bg-[#FDF9F7]",
        // 状态色覆盖（优先级高于高亮）
        isWarning && "border-amber-300 ring-1 ring-amber-200 shadow-[0_8px_24px_-16px_rgba(245,158,11,0.35)]",
        isError && "border-rose-300 ring-1 ring-rose-200 shadow-[0_8px_24px_-16px_rgba(244,63,94,0.35)]",
        isSuccess && "border-emerald-300 ring-1 ring-emerald-200 shadow-[0_8px_24px_-16px_rgba(16,185,129,0.3)]"
      )}
    >
      <div className="flex flex-col sm:flex-row items-stretch">
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

        {/* 左侧：1:1 正方形截图槽位 */}
        <div className="w-full sm:w-[45%] aspect-square sm:aspect-auto sm:min-h-[180px] flex-shrink-0 relative border-b sm:border-b-0 sm:border-r border-zinc-100 bg-gradient-to-br from-zinc-50 to-white">
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
            className="group relative flex h-full w-full flex-col items-center justify-center overflow-hidden transition-colors duration-300 cursor-pointer hover:bg-zinc-100/50"
          >
            {/* 悬浮标签：标题、状态等 */}
            <div className="absolute top-2 left-2 z-20 flex flex-col items-start gap-1.5">
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 backdrop-blur-md ring-1 ring-inset ring-zinc-200/80 shadow-sm">
                  {title}
                </span>
                {required ? (
                  <span className="rounded-full bg-[#D97757]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#D97757] backdrop-blur-md ring-1 ring-inset ring-[#D97757]/20">
                    必传
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-100/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 backdrop-blur-md ring-1 ring-inset ring-zinc-200/80">
                    选传
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md ring-1 ring-inset shadow-sm",
                  isSuccess && "bg-emerald-50/90 text-emerald-700 ring-emerald-200",
                  isError && "bg-rose-50/90 text-rose-700 ring-rose-200",
                  isWarning && "bg-amber-50/90 text-amber-700 ring-amber-200",
                  !isSuccess && !isError && !isWarning && "bg-white/85 text-zinc-600 ring-zinc-200/80"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    isSuccess && "bg-emerald-500",
                    isError && "bg-rose-500 animate-pulse",
                    isWarning && "bg-amber-500",
                    !isSuccess && !isError && !isWarning && "bg-zinc-400"
                  )}
                />
                {getStatusText(status)}
              </span>
            </div>

            {/* 背景图片及预览 */}
            {assetUrl && !isProcessing ? (
              <div className="absolute inset-0 z-10 w-full h-full overflow-hidden bg-black/5" onClick={(e) => e.stopPropagation()}>
                <Dialog>
                  <DialogTrigger
                    render={
                      <div className="w-full h-full cursor-zoom-in relative group/img">
                        <img src={assetUrl} alt="截图预览" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/30">
                          <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full font-medium flex items-center gap-1">
                            放大
                          </span>
                        </div>
                      </div>
                    }
                  />
                  <DialogContent className="max-w-4xl w-auto p-0 overflow-hidden bg-transparent border-none shadow-none" showCloseButton={false}>
                    <DialogTitle className="sr-only">截图预览放大</DialogTitle>
                    <img src={assetUrl} alt="截图放大" className="w-full h-auto object-contain max-h-[85vh] rounded-2xl shadow-sm" />
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}

            {/* 上传中动画遮罩 */}
            {isProcessing ? (
              <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-white/30" />
            ) : null}

            {/* 中心图标 (未上传或上传中) */}
            {!assetUrl || isProcessing ? (
              <div className="relative z-10 flex flex-col items-center justify-center gap-2 transition-transform duration-300 group- w-full px-4">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2 w-full max-w-[120px]">
                    <div className="w-full h-[3px] bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#D97757] to-[#E89B7E] transition-[width] duration-150"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-medium text-[#D97757] bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-full ring-1 ring-inset ring-[#D97757]/20 shadow-sm">
                      AI 解析中 {Math.floor(Math.min(99, progress))}%
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-white border border-zinc-200 text-zinc-400 shadow-sm transition-all duration-200 group-hover:text-[#D97757] group-hover:border-[#D97757]/30 group-hover:shadow-[0_6px_16px_-6px_rgba(217,119,87,0.35)] group-hover:-translate-y-0.5">
                      <UploadCloud className="size-5" />
                    </div>
                    <p className="text-[10px] font-medium text-zinc-500 px-2 text-center leading-tight transition-colors group-hover:text-zinc-700">
                      点击或拖拽上传
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {/* 成功角标 */}
            <AnimatePresence>
              {isSuccess ? (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: SPRING_EASE }}
                  className="absolute right-2 top-2 z-20 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_4px_12px_-2px_rgba(16,185,129,0.5)] ring-2 ring-white"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </button>
        </div>

        {/* 右侧：说明与识别结果区 */}
        <div className="flex-1 sm:w-[55%] flex flex-col relative bg-white p-4">
          {/* 顶部描述与删除按钮 */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-[11px] text-zinc-500 leading-snug flex-1 pr-6">{description}</p>
            {(fileName || status !== "empty") && !isProcessing ? (
              <div className="absolute right-2 top-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-full text-zinc-300 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 hover:scale-110"
                  onClick={onDelete}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 flex-1 relative">
            {isWarning ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                请确认识别结果
              </div>
            ) : null}

            {isError ? (
              <div className="space-y-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 leading-snug ring-1 ring-inset ring-rose-200/80">
                <div className="flex items-start gap-1.5 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0 mt-1 animate-pulse" />
                  <span>{error || OCR_FAIL_MESSAGE}</span>
                </div>
                {onRetry && error === NETWORK_RETRY_MESSAGE ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-6 items-center rounded-full bg-white px-3 text-[10px] font-semibold text-rose-600 ring-1 ring-inset ring-rose-300 transition-all duration-150 hover:bg-rose-600 hover:text-white hover:ring-rose-600"
                  >
                    重试上传
                  </button>
                ) : null}
              </div>
            ) : null}

            {ocrSummary && ocrSummary.length > 0 ? (
              <div className="flex-1 rounded-xl bg-gradient-to-br from-zinc-50 to-white px-3 py-2 text-[11px] text-zinc-800 ring-1 ring-inset ring-zinc-200 overflow-hidden flex flex-col max-h-[140px]">
                <div className="mb-1.5 flex items-center gap-1.5 shrink-0">
                  <span className="h-1 w-1 rounded-full bg-[#D97757]" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">AI 识别结果</span>
                </div>
                <ul className="space-y-0.5 overflow-y-auto pr-1 flex-1 min-h-0 custom-scrollbar">
                  {ocrSummary.map((item, idx) => (
                    <li
                      key={item}
                      className={cn(
                        "leading-snug text-[10.5px] rounded-md px-1.5 py-0.5 transition-all duration-200",
                        highlightedOcrIndex === idx
                          ? "bg-[#D97757]/10 text-[#C96442] font-medium ring-1 ring-inset ring-[#D97757]/20"
                          : "text-zinc-600"
                      )}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : !isProcessing && !isError ? (
              <div className="flex-1 rounded-xl bg-zinc-50/70 ring-1 ring-inset ring-zinc-200 flex items-center justify-center text-[10px] text-zinc-400 min-h-[60px]">
                暂无识别结果
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export { SubmissionSlotCard as 截图槽位卡 };

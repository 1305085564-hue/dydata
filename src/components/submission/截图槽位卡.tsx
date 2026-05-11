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

  return (
    <motion.div
      variants={isError ? shakeVariants : undefined}
      initial={isError ? "initial" : undefined}
      animate={isError ? "animate" : undefined}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-[#FAFAFB] transition-colors duration-200",
        isHighlighted ? "border-zinc-950 ring-2 ring-zinc-950/8" : "border-zinc-200",
        isWarning && "border-[#EAB308] ring-1 ring-[#EAB308]/50",
        isError && "border-[#C9604D] ring-1 ring-[#C9604D]/50",
        isSuccess && "border-[#6FAA7D] ring-1 ring-[#6FAA7D]/50"
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
        <div className="w-full sm:w-[45%] aspect-square sm:aspect-auto sm:min-h-[180px] flex-shrink-0 relative border-b sm:border-b-0 sm:border-r border-zinc-200 bg-[#FAFAFB]">
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
            className="group relative flex h-full w-full flex-col items-center justify-center overflow-hidden transition-colors duration-300 cursor-pointer hover:bg-black/[0.03]"
          >
            {/* 悬浮标签：标题、状态等 */}
            <div className="absolute top-2 left-2 z-20 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1">
                <span className="rounded-lg bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 border border-zinc-200">
                  {title}
                </span>
                {required ? (
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-800 border border-zinc-200">
                    必传
                  </span>
                ) : (
                  <span className="rounded-lg bg-zinc-400/70 px-1 py-0.5 text-[10px] font-medium text-white/90">
                    选传
                  </span>
                )}
              </div>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors flex items-center gap-1",
                isSuccess ? "bg-[#6FAA7D] text-white" :
                isError ? "bg-[#C9604D] text-white" :
                isWarning ? "bg-[#EAB308] text-white" :
                "bg-zinc-600/80 text-white/90"
              )}>
                <span className={cn(
                  "inline-block h-2 w-2 rounded-full ring-1 ring-white",
                  isSuccess && "bg-[#6FAA7D]",
                  isError && "bg-[#C9604D]",
                  isWarning && "bg-[#D99E55]"
                )} />
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
                  <div className="flex flex-col items-center gap-2 w-full max-w-[100px]">
                    <div className="w-full h-[3px] bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-zinc-400 rounded-full transition-colors"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-medium text-zinc-800 bg-white px-1.5 py-0.5 rounded-lg border border-zinc-200">AI正在解析... {Math.floor(Math.min(99, progress))}%</p>
                  </div>
                ) : (
                  <>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-white border border-zinc-200 text-zinc-400 group-hover:text-zinc-700 group-hover:border-zinc-300 transition-colors shadow-sm">
                      <UploadCloud className="size-5" />
                    </div>
                    <p className="text-[10px] font-medium text-zinc-400 px-2 text-center leading-tight">
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
                  className="absolute right-2 top-2 z-20 flex size-5 items-center justify-center rounded-full bg-[#6FAA7D] text-white shadow-sm ring-2 ring-white"
                >
                  <Check className="size-3" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </button>
        </div>

        {/* 右侧：说明与识别结果区 */}
        <div className="flex-1 sm:w-[55%] flex flex-col relative bg-[#FAFAFB] p-4">
          {/* 顶部描述与删除按钮 */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-[10px] text-zinc-500 leading-snug flex-1 pr-6">{description}</p>
            {(fileName || status !== "empty") && !isProcessing ? (
              <div className="absolute right-2 top-2">
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-zinc-100 hover:text-[#C9604D] text-zinc-300 transition-colors" onClick={onDelete}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 flex-1 relative">
            {isWarning ? (
              <div className="rounded-lg bg-[#FEFCE8] px-2.5 py-1.5 text-[10px] text-[#D99E55] font-medium border border-[#FEFCE8]">
                请确认识别结果
              </div>
            ) : null}

            {isError ? (
              <div className="space-y-1.5 rounded-lg bg-[#FEF3F2] px-2.5 py-1.5 text-[10px] text-[#C9604D] leading-snug border border-[#FEF3F2]">
                <div>{error || OCR_FAIL_MESSAGE}</div>
                {onRetry && error === NETWORK_RETRY_MESSAGE ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-5 items-center rounded border border-[#C9604D]/40 px-2 text-[10px] hover:bg-[#C9604D]/8 transition-colors"
                  >
                    重试
                  </button>
                ) : null}
              </div>
            ) : null}

            {ocrSummary && ocrSummary.length > 0 ? (
              <div className="flex-1 rounded-xl bg-[#F9F9FB] px-2.5 py-2 text-[11px] text-zinc-800 border border-zinc-200 overflow-hidden flex flex-col max-h-[120px]">
                <div className="font-semibold text-zinc-500 mb-1 shrink-0 text-[10px] uppercase tracking-wider">AI 识别结果</div>
                <ul className="space-y-0.5 overflow-y-auto pr-1 flex-1 min-h-0 custom-scrollbar">
                  {ocrSummary.map((item) => (
                    <li key={item} className="leading-snug text-zinc-700 text-[10px]">{item}</li>
                  ))}
                </ul>
              </div>
            ) : !isProcessing && !isError ? (
              <div className="flex-1 rounded-xl bg-[#F9F9FB] border border-zinc-200 flex items-center justify-center text-[10px] text-zinc-400 min-h-[60px]">
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

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState, useEffect } from "react";

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
          currentProgress = elapsed * 0.008; // 10000ms * 0.008 = 80
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
  }, [isProcessing]); // 移除了 status 依赖，确保 uploading -> recognizing 时不会重置计时器

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
        className="flex items-stretch min-h-[140px]"
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

        {/* 左侧：完全撑满的图片区域 (约45%) */}
        <div className="w-[45%] flex-shrink-0 relative border-r border-black/5 bg-black/[0.03]">
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
            className="group relative flex h-full w-full flex-col items-center justify-center overflow-hidden transition-all duration-300 cursor-pointer hover:bg-black/[0.05]"
          >
            {/* 悬浮标签：标题、状态等 */}
            <div className="absolute top-2 left-2 z-20 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1">
                <span className="rounded bg-black/60 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                  {title}
                </span>
                {required ? (
                  <span className="rounded bg-white/90 backdrop-blur-md px-1 py-0.5 text-[9px] font-bold text-[var(--color-primary)] shadow-sm">
                    必传
                  </span>
                ) : (
                  <span className="rounded bg-black/40 backdrop-blur-md px-1 py-0.5 text-[9px] font-medium text-white/90 shadow-sm">
                    选传
                  </span>
                )}
              </div>
              <span className={cn(
                "rounded backdrop-blur-md px-1.5 py-0.5 text-[9px] font-medium shadow-sm transition-colors",
                isSuccess ? "bg-[var(--color-success)]/90 text-white" :
                isError ? "bg-[var(--color-danger)]/90 text-white" :
                isWarning ? "bg-[var(--color-warning)]/90 text-white" :
                "bg-black/50 text-white/90"
              )}>
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
                          <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-md font-medium shadow-sm flex items-center gap-1">
                            放大
                          </span>
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

            {/* 上传中动画 */}
            {isProcessing ? (
              <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-white/40 backdrop-blur-[2px]">
                {/* 平滑上升进度条（背景变色） */}
              </div>
            ) : null}

            {/* 中心图标 (未上传或上传中) */}
            {!assetUrl || isProcessing ? (
              <div className="relative z-10 flex flex-col items-center justify-center gap-2 transition-transform duration-300 group-hover:scale-110 w-full px-4">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2 w-full max-w-[100px]">
                    <div className="w-full h-[4px] bg-black/10 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] relative">
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-medium text-[var(--color-primary)] bg-white/90 px-1.5 py-0.5 rounded shadow-sm">AI正在解析... {Math.floor(Math.min(99, progress))}%</p>
                  </div>
                ) : (
                  <>
                    <div className="flex size-10 items-center justify-center rounded-[var(--radius-lg)] bg-black/5 group-hover:bg-[var(--color-primary)]/10 transition-colors text-[var(--color-primary)]">
                      <UploadCloud className="size-5" />
                    </div>
                    <p className="text-[10px] font-medium text-black/50 px-2 text-center leading-tight">
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
                  className="absolute right-2 top-2 z-20 flex size-5 items-center justify-center rounded-full bg-[var(--color-success)] text-white shadow-sm ring-2 ring-white"
                >
                  <Check className="size-3" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </button>
        </div>

        {/* 右侧：说明与识别结果区 (约55%) */}
        <div className="w-[55%] flex flex-col relative bg-white/40 p-3">
          {/* 顶部描述与删除按钮 */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-[10px] text-[var(--color-text-secondary)] leading-snug flex-1 pr-6">{description}</p>
            {(fileName || status !== "empty") && !isProcessing ? (
              <div className="absolute right-2 top-2">
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-red-50 hover:text-red-600 text-black/40" onClick={onDelete}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 flex-1 relative">
            {isWarning ? (
              <div className="rounded-[var(--radius-md)] bg-[color:rgba(255,149,0,0.08)] px-2 py-1.5 text-[10px] text-[var(--color-warning)] font-medium">
                请确认识别结果
              </div>
            ) : null}

            {isError ? (
              <div className="space-y-1.5 rounded-[var(--radius-md)] bg-[color:rgba(255,59,48,0.08)] px-2 py-1.5 text-[10px] text-[var(--color-danger)] leading-snug">
                <div>{error || OCR_FAIL_MESSAGE}</div>
                {onRetry && error === NETWORK_RETRY_MESSAGE ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-5 items-center rounded border border-[color:var(--color-danger)]/50 px-2 text-[9px] hover:bg-[var(--color-danger)]/10 transition-colors"
                  >
                    重试
                  </button>
                ) : null}
              </div>
            ) : null}

            {ocrSummary && ocrSummary.length > 0 ? (
              <div className="flex-1 rounded-[var(--radius-md)] bg-[color:rgba(0,122,255,0.04)] px-2.5 py-2 text-[11px] text-[var(--color-text-primary)] border border-[color:rgba(0,122,255,0.08)] overflow-hidden flex flex-col max-h-[120px]">
                <div className="font-semibold text-[var(--color-text-secondary)] mb-1 shrink-0 text-[9px] uppercase tracking-wider">AI 识别结果</div>
                <ul className="space-y-0.5 overflow-y-auto pr-1 flex-1 min-h-0 custom-scrollbar">
                  {ocrSummary.map((item) => (
                    <li key={item} className="leading-snug text-black/75 text-[10px]">{item}</li>
                  ))}
                </ul>
              </div>
            ) : !isProcessing && !isError ? (
              <div className="flex-1 rounded-[var(--radius-md)] bg-black/[0.02] border border-black/5 flex items-center justify-center text-[10px] text-black/40 min-h-[60px]">
                暂无识别结果
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </MotionCard>
  );
}

export { SubmissionSlotCard as 截图槽位卡 };

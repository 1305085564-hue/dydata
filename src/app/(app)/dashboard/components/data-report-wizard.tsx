"use client";

/**
 * 数据上报 wizard 容器
 *
 * v9(2026-05-31)
 *  - 视频状态切换从 ProgressHeader 浮动 chip 撤回,改用 leadingActionSlot 渲染在 actions 行最左侧
 *    (对齐阿禅原话「三个都在外面直接切换」「左下角卡片外面」)
 *  - actions 按钮尺寸对齐导粉中心 StepWizard:h-11 + px-5/6 + text-[13px]
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardStepDef {
  key: string;
  label: string;
  hint?: string;
}

export type WizardMissingItem = {
  label: string;
  onClick?: () => void;
};

export type WizardStepState = "active" | "completed" | "upcoming" | "skipped";

interface DataReportWizardProps {
  visibleSteps: WizardStepDef[];
  visibleStep: number;
  contentKey: string | number;
  direction: 1 | -1;
  stepStateOverrides?: Record<number, WizardStepState>;

  /** 浮在 actions 行最左侧的次要控件(视频状态分段胶囊等),× 占进度条空间 */
  leadingActionSlot?: ReactNode;

  children: ReactNode;

  showActions: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
  canGoNext: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  isLastStep: boolean;
  submitLabel: string;

  status?: "ready" | "incomplete" | null;
  missingItems?: WizardMissingItem[];

  trailingControl?: ReactNode;

  onAttemptNext?: () => void;
}

export function DataReportWizard({
  visibleSteps,
  visibleStep,
  contentKey,
  direction,
  stepStateOverrides,
  leadingActionSlot,
  children,
  showActions,
  onPrev,
  onNext,
  onSubmit,
  onCancel,
  canGoNext,
  canSubmit,
  isSubmitting,
  isLastStep,
  submitLabel,
  status,
  missingItems,
  trailingControl,
  onAttemptNext,
}: DataReportWizardProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    if (!showMissing) return;
    function onClickOutside(event: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(event.target as Node)) {
        setShowMissing(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showMissing]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <ProgressHeader
        visibleSteps={visibleSteps}
        visibleStep={visibleStep}
        stepStateOverrides={stepStateOverrides}
      />

      {/* Inner card: 唯一承载当前 step 内容 */}
      <motion.div layout className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentKey}
            initial={{ x: direction * 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -22, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.55 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Action bar: 卡外左右两端 */}
      <AnimatePresence initial={false}>
        {showActions ? (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-wrap items-center gap-3">
              {leadingActionSlot}
              {status === "ready" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#6FAA7D] bg-white px-2.5 py-1 text-[12px] font-medium text-[#6FAA7D]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
                  {isLastStep ? "已就绪,可提交" : "本步已完成"}
                </span>
              ) : status === "incomplete" ? (
                <div className="relative" ref={popoverRef}>
                  <button
                    type="button"
                    onClick={() => setShowMissing((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-[#D99E55] bg-white px-2.5 py-1 text-[12px] font-medium text-[#D99E55] transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      showMissing ? "bg-stone-50" : "hover:bg-stone-50",
                    )}
                    aria-expanded={showMissing}
                    aria-label={`待完善 ${missingItems?.length ?? 0} 项,点击展开`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55]" />
                    <span>待完善</span>
                    {missingItems && missingItems.length > 0 ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D99E55] px-1 text-[12px] font-medium leading-none text-white tabular-nums">
                        {missingItems.length}
                      </span>
                    ) : null}
                    <ChevronUp
                      className={cn(
                        "size-3 stroke-[2] transition-transform duration-150",
                        showMissing ? "rotate-0" : "rotate-180",
                      )}
                    />
                  </button>
                  <AnimatePresence>
                    {showMissing && missingItems && missingItems.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                        className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-60 rounded-2xl border border-stone-200 bg-white p-3 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-[#D99E55]" />
                          <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-stone-500">
                            待完善 · {missingItems.length}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {missingItems.map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                item.onClick?.();
                                setShowMissing(false);
                              }}
                              className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-700 transition-[background-color,color] duration-150 hover:bg-stone-50 hover:text-stone-700"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}

              {trailingControl}
            </div>

            <div className="flex items-center gap-2">
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className={cn(
                    "h-11 rounded-lg px-4 text-[13px] font-medium text-stone-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    isSubmitting ? "cursor-not-allowed opacity-50" : "hover:bg-stone-100 hover:text-stone-700",
                  )}
                >
                  取消
                </button>
              ) : null}
              <button
                type="button"
                onClick={onPrev}
                disabled={isSubmitting || visibleStep === 0}
                className={cn(
                  "h-11 rounded-lg border border-stone-200 bg-white px-5 text-[13px] font-medium text-stone-700 transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:translate-y-0",
                  isSubmitting || visibleStep === 0 ? "cursor-not-allowed opacity-50" : "hover:bg-stone-50",
                )}
              >
                上一步
              </button>

              {isLastStep ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isSubmitting || !canSubmit}
                  className={cn(
                    "group relative h-11 overflow-hidden rounded-xl px-6 text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.98]",
                    isSubmitting || !canSubmit
                      ? "cursor-not-allowed bg-stone-100 text-stone-500"
                      : "bg-[#D97757] text-white shadow-[0_4px_12px_rgba(217,119,87,0.25)] hover:shadow-[0_8px_24px_rgba(217,119,87,0.4)] hover:-translate-y-0.5"
                  )}
                >
                  <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative z-10 flex items-center justify-center gap-2">{submitLabel}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onAttemptNext?.();
                    if (canGoNext) onNext();
                  }}
                  disabled={!canGoNext}
                  title={canGoNext ? undefined : "本步必要项尚未完成"}
                  className={cn(
                    "group relative h-11 overflow-hidden rounded-xl px-6 text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.98]",
                    canGoNext
                      ? "bg-[#D97757] text-white shadow-[0_4px_12px_rgba(217,119,87,0.25)] hover:shadow-[0_8px_24px_rgba(217,119,87,0.4)] hover:-translate-y-0.5"
                      : "cursor-not-allowed bg-stone-100 text-stone-500"
                  )}
                >
                  <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative z-10 flex items-center justify-center gap-2">下一步</span>
                </button>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p className="text-center text-[12px] text-stone-500">
        快捷键 · Esc 上一步 · Cmd / Ctrl + Enter 推进
      </p>
    </div>
  );
}

interface ProgressHeaderProps {
  visibleSteps: WizardStepDef[];
  visibleStep: number;
  stepStateOverrides?: Record<number, WizardStepState>;
}

function resolveStepState(
  index: number,
  visibleStep: number,
  overrides?: Record<number, WizardStepState>,
): WizardStepState {
  if (overrides?.[index]) return overrides[index];
  if (index < visibleStep) return "completed";
  if (index === visibleStep) return "active";
  return "upcoming";
}

function ProgressHeader({ visibleSteps, visibleStep, stepStateOverrides }: ProgressHeaderProps) {
  const lastIndex = visibleSteps.length - 1;

  return (
    <div className="flex items-start">
      {visibleSteps.map((step, index) => {
        const state = resolveStepState(index, visibleStep, stepStateOverrides);
        const isCurrent = state === "active";
        const isCompleted = state === "completed";
        const isSkipped = state === "skipped";
        const prevState = index > 0 ? resolveStepState(index - 1, visibleStep, stepStateOverrides) : null;
        const isPrevDone = prevState === "completed" || prevState === "skipped";

        return (
          <div key={step.key} className="flex flex-1 items-start">
            {/* 左 line:第一个 step 隐藏占位,保持圆点居中 */}
            <div
              className={cn(
                "mt-[18px] h-px flex-1",
                index === 0 ? "invisible" : isPrevDone ? (prevState === "skipped" ? "bg-stone-300" : "bg-[#6FAA7D]") : "bg-stone-200",
              )}
            />

            {/* 圆点 + 标签 */}
            <div className="flex shrink-0 flex-col items-center gap-2 px-2">
              <motion.div
                initial={false}
                animate={{ scale: isCurrent ? 1.06 : 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 26 }}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-[13px] font-medium transition-colors duration-150",
                  isCurrent && "bg-[#D97757] text-white shadow-[0_6px_18px_-6px_rgba(217,119,87,0.6)]",
                  isCompleted && "bg-[#6FAA7D] text-white",
                  isSkipped && "bg-stone-200 text-stone-500",
                  state === "upcoming" && "bg-stone-100 text-stone-500",
                )}
              >
                {isCompleted ? (
                  <Check className="size-[18px] stroke-[2.5]" />
                ) : isSkipped ? (
                  <Minus className="size-[18px] stroke-[2.5]" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </motion.div>
              <span
                className={cn(
                  "whitespace-nowrap text-[13px] font-medium tracking-tight transition-colors duration-150",
                  isCurrent ? "text-stone-700" : isSkipped ? "text-stone-500" : "text-stone-500",
                )}
              >
                {isSkipped ? `${step.label} · 已跳过` : step.label}
              </span>
            </div>

            {/* 右 line:最后一个 step 隐藏占位 */}
            <div
              className={cn(
                "mt-[18px] h-px flex-1",
                index === lastIndex ? "invisible" : isCompleted || isSkipped ? (isSkipped ? "bg-stone-300" : "bg-[#6FAA7D]") : "bg-stone-200",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

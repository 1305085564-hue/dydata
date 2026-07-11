"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardStepDef {
  key: string;
  label: string;
}

interface StepWizardProps {
  /** 进度条上展示的步骤（不含 type 起步） */
  visibleSteps: WizardStepDef[];
  /** 当前在 visibleSteps 中的位置：-1 表示「起步」尚未完成 */
  visibleStep: number;
  /** 内部用于 AnimatePresence 唯一 key */
  contentKey: string | number;
  /** 切换方向：1 前进，-1 后退 */
  direction: 1 | -1;
  children: React.ReactNode;
  showActions: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canGoNext: boolean;
  isSubmitting: boolean;
  isLastStep: boolean;
}

export function StepWizard({
  visibleSteps,
  visibleStep,
  contentKey,
  direction,
  children,
  showActions,
  onPrev,
  onNext,
  onSubmit,
  canGoNext,
  isSubmitting,
  isLastStep,
}: StepWizardProps) {
  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          {/* 起步徽标 */}
          <motion.div
            initial={false}
            animate={{
              opacity: visibleStep >= 0 ? 0.55 : 1,
              scale: visibleStep >= 0 ? 0.95 : 1,
            }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[12px] font-medium transition-colors",
                visibleStep >= 0
                  ? "border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#6FAA7D]"
                  : "border-[#D97757]/40 bg-[#D97757]/10 text-[#D97757]",
              )}
            >
              {visibleStep >= 0 ? <Check className="size-3 stroke-[2.5]" /> : "·"}
            </span>
            <span className="text-[12px] font-medium tracking-[0.12em] text-stone-500">
              起步
            </span>
          </motion.div>

          {/* 主进度条 */}
          <div className="ml-4 flex flex-1 items-center">
            {visibleSteps.map((step, index) => {
              const isCompleted = index < visibleStep;
              const isCurrent = index === visibleStep;
              const isUpcoming = index > visibleStep;

              return (
                <div
                  key={step.key}
                  className="flex flex-1 items-center"
                >
                  <motion.div
                    layout
                    className="flex flex-col items-center gap-1.5"
                  >
                    <motion.div
                      initial={false}
                      animate={{
                        scale: isCurrent ? 1.05 : 1,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 360,
                        damping: 26,
                      }}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-[13px] font-medium transition-colors",
                        isCurrent && "bg-[#D97757] text-white shadow-sm",
                        isCompleted && "bg-[#6FAA7D] text-white",
                        isUpcoming && "bg-stone-200 text-stone-500",
                      )}
                    >
                      {isCompleted ? (
                        <Check className="size-4 stroke-[2.5]" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </motion.div>
                    <span
                      className={cn(
                        "text-[12px] transition-colors",
                        isCurrent
                          ? "font-medium text-stone-900"
                          : "text-stone-500",
                      )}
                    >
                      {step.label}
                    </span>
                  </motion.div>
                  {index < visibleSteps.length - 1 ? (
                    <div className="mx-2 flex-1">
                      <div className="relative h-px overflow-hidden bg-stone-200">
                        <motion.div
                          initial={false}
                          animate={{
                            scaleX: index < visibleStep ? 1 : 0,
                          }}
                          transition={{
                            type: "spring",
                            stiffness: 240,
                            damping: 30,
                          }}
                          style={{ transformOrigin: "left" }}
                          className="absolute inset-0 bg-[#6FAA7D]"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content with directional spring animation */}
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentKey}
            initial={{ x: direction * 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -24, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 30,
              mass: 0.55,
            }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action bar — 起步阶段隐藏，避免冗余按钮 */}
      <AnimatePresence initial={false}>
        {showActions ? (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex items-center justify-between border-t border-stone-100 pt-6"
          >
            <button
              type="button"
              onClick={onPrev}
              disabled={isSubmitting}
              className={cn(
                "h-11 rounded-lg border border-stone-200 bg-white px-5 text-[13px] font-medium text-stone-700 transition-all active:translate-y-[1px]",
                isSubmitting
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-stone-50",
              )}
            >
              上一步
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || !canGoNext}
                className={cn(
                  "h-11 rounded-lg px-6 text-[13px] font-medium transition-all active:translate-y-[1px]",
                  isSubmitting || !canGoNext
                    ? "cursor-not-allowed bg-stone-100 text-stone-500"
                    : "bg-[#D97757] text-white shadow-sm hover:bg-[#C96442] hover:shadow-sm",
                )}
              >
                {isSubmitting ? "提交中..." : "确认提交"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                disabled={!canGoNext}
                className={cn(
                  "h-11 rounded-lg px-6 text-[13px] font-medium transition-all active:translate-y-[1px]",
                  !canGoNext
                    ? "cursor-not-allowed bg-stone-100 text-stone-500"
                    : "bg-[#D97757] text-white shadow-sm hover:bg-[#C96442] hover:shadow-sm",
                )}
              >
                下一步
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

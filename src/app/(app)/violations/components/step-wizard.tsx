"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardStepDef {
  key: string;
  label: string;
}

interface StepWizardProps {
  steps: WizardStepDef[];
  currentStep: number;
  children: React.ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canGoNext: boolean;
  isSubmitting: boolean;
  isLastStep: boolean;
}

export function StepWizard({
  steps,
  currentStep,
  children,
  onPrev,
  onNext,
  onSubmit,
  canGoNext,
  isSubmitting,
  isLastStep,
}: StepWizardProps) {
  const direction = 1; // 1 = forward, -1 = backward — managed by parent via key

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-[13px] font-medium transition-colors",
                    isCurrent && "bg-[#D97757] text-white",
                    isCompleted && "bg-[#6FAA7D] text-white",
                    isUpcoming && "bg-zinc-200 text-zinc-500",
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-4 stroke-[2.5]" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[12px] transition-colors",
                    isCurrent ? "text-zinc-800" : "text-zinc-500",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 ? (
                <div className="mx-2 flex-1">
                  <div
                    className={cn(
                      "h-px transition-colors",
                      index < currentStep ? "bg-[#6FAA7D]" : "bg-zinc-200",
                    )}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Step content with animation */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStep}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-6">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentStep === 0 || isSubmitting}
          className={cn(
            "h-11 rounded-lg border border-zinc-200 bg-white px-5 text-[13px] font-medium text-zinc-700 transition-colors active:translate-y-0",
            currentStep === 0 || isSubmitting
              ? "cursor-not-allowed opacity-50"
              : "hover:bg-zinc-50",
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
              "h-11 rounded-lg bg-[#D97757] px-6 text-[13px] font-semibold text-white transition-colors active:translate-y-0",
              isSubmitting || !canGoNext
                ? "cursor-not-allowed opacity-70"
                : "hover:bg-[#C96442]",
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
              "h-11 rounded-lg bg-[#D97757] px-6 text-[13px] font-semibold text-white transition-colors active:translate-y-0",
              !canGoNext
                ? "cursor-not-allowed opacity-70"
                : "hover:bg-[#C96442]",
            )}
          >
            下一步
          </button>
        )}
      </div>
    </div>
  );
}

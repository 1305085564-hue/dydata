"use client";

import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  cleanMetricInputValue,
  isMetricInputValueValid,
  preserveMetricInputText,
  type MetricInputType,
} from "@/lib/dashboard-logic/metric-input-cleaner";
import type { SubmissionFieldState } from "./提交状态机";
import { canRestoreOcrValue, type ConfidenceLevel } from "./填报表单状态";

export type MetricCellMode = "pending" | "settled" | "doubt" | "missing" | "blank";

/**
 * 一格指标的呈现方式（空输入框是最贵的注意力）：
 * - pending：对应截图还在识别，只占位不画框；
 * - settled：认出来了（或人已改过），以文字呈现，点一下就能改；
 * - doubt：识别置信度为中/低，画成输入框并标「请核对」；
 * - missing：必填但没有值，画成输入框（只靠边框提示，不加字）；
 * - blank：截图还没来、也没有值，只显示「—」。
 */
export function resolveMetricCellMode(args: {
  field: Pick<SubmissionFieldState, "value" | "source"> & { manuallyEdited?: boolean };
  confidenceLevel: ConfidenceLevel | null | undefined;
  optional: boolean;
  slotProcessing: boolean;
  inputsOpen: boolean;
}): MetricCellMode {
  const hasValue = Boolean(args.field.value.trim());
  if (args.slotProcessing && !hasValue) return "pending";
  if (hasValue) {
    const unsure = args.field.source === "ocr" && (args.confidenceLevel === "low" || args.confidenceLevel === "medium");
    return unsure ? "doubt" : "settled";
  }
  if (!args.optional && args.inputsOpen) return "missing";
  return "blank";
}

interface MetricInputCardProps {
  label: string;
  field: SubmissionFieldState & {
    ocrValue?: string | null;
    manuallyEdited?: boolean;
  };
  mode: MetricCellMode;
  suffix?: string;
  metricType?: MetricInputType;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onRestoreOcr?: () => void;
  optional?: boolean;
  hint?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function MetricInputCard({
  label,
  field,
  mode,
  suffix,
  metricType = "count",
  onChange,
  onFocus,
  onBlur,
  onRestoreOcr,
  optional = false,
  hint,
  inputRef,
  onKeyDown,
}: MetricInputCardProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputEl = inputRef ?? localRef;
  const displayValue = field.value;
  const canRestoreOcr = Boolean(onRestoreOcr) && canRestoreOcrValue(field);
  const isBoxed = mode === "doubt" || mode === "missing";
  const hasInvalidInput = Boolean(displayValue) && !isMetricInputValueValid(displayValue, metricType);
  const checkedByHand = Boolean(field.manuallyEdited) && Boolean(field.ocrValue) && field.value === field.ocrValue;

  return (
    <div className="flex min-w-0 flex-col gap-1" title={hint}>
      <div className="flex h-5 items-center justify-between gap-1 px-2">
        <Label
          htmlFor={`metric-${field.key}`}
          title={`${label}${suffix ? `（${suffix}）` : ""}${optional ? " · 选填" : ""}`}
          className="min-w-0 truncate text-[12px] font-normal text-[#78716C] select-none cursor-pointer"
        >
          {label}
          {suffix ? `（${suffix}）` : ""}
          {optional && mode === "blank" && !suffix ? <span className="ml-1 opacity-70">选填</span> : null}
        </Label>
        <div className="flex shrink-0 items-center gap-1 text-[12px]">
          {mode === "doubt" ? (
            <>
              <span className="text-status-warning-text">请核对</span>
              <button
                type="button"
                onClick={() => onChange(field.value)}
                className="text-[#78716C] underline-offset-2 hover:text-[#141413] hover:underline cursor-pointer"
              >
                没问题
              </button>
            </>
          ) : checkedByHand ? (
            <span className="text-[#78716C]">已核对</span>
          ) : canRestoreOcr ? (
            <>
              <span className="text-[#78716C]">已改</span>
              <button
                type="button"
                aria-label={`恢复${label}的识别值`}
                title={`恢复识别值 ${field.ocrValue}`}
                onClick={() => onRestoreOcr?.()}
                className="flex items-center rounded-md p-0.5 text-[#78716C] hover:text-[#D97757] cursor-pointer"
              >
                <RotateCcw className="size-3" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {mode === "pending" ? (
        <div className="flex h-9 items-center gap-2 px-2 text-[14px] text-[#A8A29E]">
          <span className="h-4 w-12 rounded-md bg-[#F1F1F0] animate-pulse-claude" />
          <span className="text-[12px] text-[#A8A29E]">识别中…</span>
        </div>
      ) : (
        <Input
          id={`metric-${field.key}`}
          ref={inputEl as React.RefObject<HTMLInputElement>}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={displayValue}
          placeholder={mode === "missing" ? undefined : "—"}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (pasted) {
              const cleaned = cleanMetricInputValue(pasted, metricType);
              if (cleaned !== pasted) {
                e.preventDefault();
                onChange(cleaned);
              }
            }
          }}
          onChange={(event) => onChange(preserveMetricInputText(event.target.value))}
          onFocus={(e) => {
            e.currentTarget.select();
            onFocus?.();
          }}
          onBlur={() => {
            if (displayValue) {
              const cleaned = cleanMetricInputValue(displayValue, metricType);
              if (cleaned !== displayValue) onChange(cleaned);
            }
            onBlur?.();
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-9 min-h-[36px] rounded-md px-2 text-left font-sans text-[14px] tabular-nums text-[#141413] transition-colors",
            "placeholder:text-[#A8A29E] focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:ring-offset-0",
            hasInvalidInput
              ? "border border-status-danger/50 bg-white shadow-input"
              : isBoxed
                ? "border border-status-warning/50 bg-white shadow-input"
              : "border border-transparent bg-transparent shadow-none hover:bg-[#F1F1F0]",
          )}
        />
      )}
      {hasInvalidInput ? (
        <p role="alert" className="px-2 text-[12px] text-status-danger">
          请输入有效数字
        </p>
      ) : null}
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

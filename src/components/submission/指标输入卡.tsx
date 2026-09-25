"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cleanMetricInputValue, type MetricInputType } from "@/lib/dashboard-logic/metric-input-cleaner";
import type { SubmissionFieldState } from "./提交状态机";
import type { ConfidenceLevel } from "./填报表单状态";

function getConfidenceDotProps(level: ConfidenceLevel | null | undefined) {
  if (level === "high") {
    return { color: "bg-[#6FAA7D]", tooltip: "AI 高置信识别" };
  }
  if (level === "medium") {
    return { color: "bg-[#B98A54]", tooltip: "AI 识别，建议核对" };
  }
  if (level === "low") {
    return { color: "bg-[#C0685C]", tooltip: "AI 识别置信度较低，请务必核对" };
  }
  return null;
}

interface MetricInputCardProps {
  label: string;
  field: SubmissionFieldState;
  confidenceLevel?: ConfidenceLevel | null;
  step?: string;
  suffix?: string;
  metricType?: MetricInputType;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  optional?: boolean;
  animationDelay?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function MetricInputCard({
  label,
  field,
  confidenceLevel,
  suffix,
  metricType = "count",
  onChange,
  onFocus,
  onBlur,
  optional = false,
  inputRef,
  onKeyDown,
}: MetricInputCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const inputEl = inputRef ?? localRef;
  const displayValue = field.value;
  const confidenceProps = getConfidenceDotProps(confidenceLevel);

  return (
    <div className="space-y-0.5 sm:space-y-1 transition-colors min-w-0">
      <div className="flex items-center justify-between gap-1">
        <Label
          htmlFor={`metric-${field.key}`}
          className={cn("font-medium text-[#78716C] text-[12px] sm:text-[13px] truncate select-none")}
        >
          {label}
          {optional && (
            <span className="ml-0.5 lg:ml-1 font-normal opacity-60 text-[10px] lg:text-[13px]">可选</span>
          )}
        </Label>
        {field.source === "ocr" && confidenceProps ? (
          <div
            className="relative flex items-center"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span className={cn("size-1.5 rounded-full ring-1 ring-white shadow-2xs", confidenceProps.color)} />
            {showTooltip ? (
              <div className="absolute right-0 bottom-full mb-1.5 z-20 whitespace-nowrap rounded-md bg-[#292524] px-2 py-1 text-[12px] leading-none text-[#FBFBFA] shadow-md pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100">
                {confidenceProps.tooltip}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <div className="rounded-lg">
          <Input
            id={`metric-${field.key}`}
            ref={inputEl as React.RefObject<HTMLInputElement>}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={displayValue}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted) {
                const cleaned = cleanMetricInputValue(pasted, metricType);
                if (cleaned !== pasted && cleaned) {
                  e.preventDefault();
                  onChange(cleaned);
                }
              }
            }}
            onChange={(event) => {
              const raw = event.target.value;
              const cleaned = cleanMetricInputValue(raw, metricType);
              onChange(cleaned);
            }}
            onFocus={(e) => {
              e.currentTarget.select();
              onFocus?.();
            }}
            onBlur={() => {
              if (displayValue) {
                const cleaned = cleanMetricInputValue(displayValue, metricType);
                if (cleaned !== displayValue) {
                  onChange(cleaned);
                }
              }
              onBlur?.();
            }}
            onKeyDown={onKeyDown}
            className={cn(
              "h-9 sm:h-9 lg:h-9 min-h-[36px] rounded-lg bg-white text-[#292524] tabular-nums text-right font-sans transition-all duration-150",
              "border border-[#E2E2DF] shadow-input",
              "hover:border-[#78716C]/40 text-[13px]",
              "focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:border-[#78716C] focus-visible:ring-offset-0",
              "pl-2.5 sm:pl-3",
              suffix ? "pr-7 sm:pr-8" : "pr-2.5 sm:pr-3",
              field.source === "ocr"
                ? "border-b-2 border-b-[#D97757]/80 shadow-input"
                : "",
            )}
          />
        </div>
        {/* 后缀单位 (如 % 或 秒) */}
        {suffix && (
          <span className="pointer-events-none absolute right-2 lg:right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#78716C] tabular-nums font-sans select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

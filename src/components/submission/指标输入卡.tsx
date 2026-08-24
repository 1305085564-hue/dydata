"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SubmissionFieldState } from "./提交状态机";

interface MetricInputCardProps {
  label: string;
  field: SubmissionFieldState;
  step?: string;
  suffix?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  optional?: boolean;
  animationDelay?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function getConfidenceDotProps(score: number | null | undefined) {
  const s = score ?? 0.5; // 无 confidence 默认中置信
  if (s >= 0.95) {
    return {
      color: "bg-[#16A34A]",
      tooltip: "AI 高置信识别",
    };
  }
  if (s >= 0.8) {
    return {
      color: "bg-[#D99E55]",
      tooltip: "AI 识别，建议核对",
    };
  }
  return {
    color: "bg-[#DC2626]/100",
    tooltip: "AI 识别置信度较低，请务必核对",
  };
}

function getStatusBadge(field: SubmissionFieldState) {
  if (field.source !== "ocr") return null;

  const score = field.confidenceScore ?? 0.5;
  if (score >= 0.95) {
    return {
      label: "AI 已识别",
      className: "bg-[#FBF9F5] text-[#292524] border border-[#E5E0D6]",
      dotClass: "bg-[#16A34A]",
    };
  }
  if (score >= 0.8) {
    return {
      label: "待确认",
      className: "bg-[#FBF9F5] text-[#292524] border border-[#E5E0D6]",
      dotClass: "bg-[#D99E55]",
    };
  }
  return {
    label: "请核对",
    className: "bg-[#FBF9F5] text-[#292524] border border-[#E5E0D6]",
    dotClass: "bg-[#DC2626]/100",
  };
}

export function MetricInputCard({
  label,
  field,
  step = "1",
  suffix,
  onChange,
  onFocus,
  onBlur,
  optional = false,
  animationDelay = 0,
  inputRef,
  onKeyDown,
}: MetricInputCardProps) {
  const [displayValue, setDisplayValue] = useState(field.value);
  const [showTooltip, setShowTooltip] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const inputEl = inputRef ?? localRef;

  useEffect(() => {
    if (field.source === "ocr") {
      let i = 0;
      const target = String(field.value);
      setDisplayValue("");

      const speed = Math.max(15, 300 / (target.length || 1));
      let timer: ReturnType<typeof setInterval>;

      const delayTimer = setTimeout(() => {
        timer = setInterval(() => {
          if (i < target.length) {
            i++;
            setDisplayValue(target.substring(0, i));
          } else {
            clearInterval(timer);
          }
        }, speed);
      }, animationDelay);

      return () => {
        clearTimeout(delayTimer);
        clearInterval(timer);
      };
    } else {
      setDisplayValue(field.value);
    }
  }, [field.value, field.source, animationDelay]);

  let statusLabel = null;
  if (field.source === "ocr") {
    statusLabel = "AI 已识别";
  }
  // statusLabel kept as derived flag; actual rendering uses getStatusBadge for three-tier coloring.
  void statusLabel;

  const statusBadge = getStatusBadge(field);
  void statusBadge;
  const confidenceProps =
    field.source === "ocr"
      ? getConfidenceDotProps(field.confidenceScore)
      : null;

  return (
    <div className="space-y-0.5 sm:space-y-1 transition-colors min-w-0">
      <div className="flex items-center justify-between gap-0.5">
        <Label className={cn("font-medium text-[#78716C] text-[11px] sm:text-[12.5px] lg:text-[13px] truncate select-none")}>
          {label}
          {optional && (
            <span className="ml-0.5 lg:ml-1 font-normal opacity-60 text-[10px] lg:text-[13px]">可选</span>
          )}
        </Label>
      </div>

      <div className="relative">
        <motion.div
          animate={
            field.source === "ocr"
              ? {
                  boxShadow: [
                    "0 0 0px rgba(217,119,87,0)",
                    "0 0 12px rgba(217,119,87,0.3)",
                    "0 0 0px rgba(217,119,87,0)",
                  ],
                }
              : {}
          }
          transition={{
            duration: 1.5,
            ease: "easeInOut",
            times: [0, 0.5, 1],
            delay: animationDelay / 1000,
          }}
          className="rounded-lg"
        >
          <Input
            ref={inputEl as React.RefObject<HTMLInputElement>}
            type="number"
            min={0}
            step={step}
            inputMode="numeric"
            value={displayValue}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(e) => {
              e.currentTarget.select();
              onFocus?.();
            }}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            className={cn(
              "rounded-lg lg:pr-8 tabular-nums text-[#1C1917] transition-all duration-150",
              "bg-white border border-[#E5E0D6] shadow-2xs hover:border-[#78716C]/50 text-[12px] sm:text-[13px]",
              "focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0",
              "h-8 sm:h-9 lg:h-9.5 min-h-[32px] sm:min-h-0 px-2 sm:px-3",
              suffix ? "pr-5 sm:pr-6 lg:pr-8" : "",
              field.source === "ocr"
                ? "border-b-2 border-b-[#D97757]/70 shadow-[0_1px_2px_rgba(217,119,87,0.06)]"
                : "",
            )}
          />
        </motion.div>
        {/* 后缀单位 (如 % 或 秒) */}
        {suffix && (
          <span className="pointer-events-none absolute right-1.5 sm:right-2 lg:right-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-[11px] lg:text-[12px] text-[#78716C]">
            {suffix}
          </span>
        )}
        {/* 置信度圆点 */}
        {confidenceProps ? (
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 cursor-help",
              suffix ? "right-5 sm:right-6 lg:right-3" : "right-2 sm:right-2.5 lg:right-3"
            )}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ring-1 ring-white shadow-sm",
                confidenceProps.color,
              )}
            />
            {showTooltip ? (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#1C1917] text-white text-[11px] lg:text-[12px] rounded-lg px-2 py-1 whitespace-nowrap pointer-events-none z-30 shadow-sm ring-1 ring-white/10">
                {confidenceProps.tooltip}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

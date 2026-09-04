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
      color: "bg-[#6FAA7D]",
      tooltip: "AI 高置信识别",
    };
  }
  if (s >= 0.8) {
    return {
      color: "bg-[#B98A54]",
      tooltip: "AI 识别，建议核对",
    };
  }
  return {
    color: "bg-[#C0685C]",
    tooltip: "AI 识别置信度较低，请务必核对",
  };
}

function getStatusBadge(field: SubmissionFieldState) {
  if (field.source !== "ocr") return null;

  const score = field.confidenceScore ?? 0.5;
  if (score >= 0.95) {
    return {
      label: "AI 已识别",
      className: "bg-[#FBF9F5] text-[#292524] border border-[#ECE7DE]",
      dotClass: "bg-[#6FAA7D]",
    };
  }
  if (score >= 0.8) {
    return {
      label: "待确认",
      className: "bg-[#FBF9F5] text-[#292524] border border-[#ECE7DE]",
      dotClass: "bg-[#B98A54]",
    };
  }
  return {
    label: "请核对",
    className: "bg-[#FBF9F5] text-[#292524] border border-[#ECE7DE]",
    dotClass: "bg-[#C0685C]",
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="flex items-center justify-between gap-1">
        <Label className={cn("font-medium text-[#78716C] text-[11px] sm:text-[12.5px] lg:text-[13px] truncate select-none")}>
          {label}
          {optional && (
            <span className="ml-0.5 lg:ml-1 font-normal opacity-60 text-[10px] lg:text-[13px]">可选</span>
          )}
        </Label>

        {/* 置信度圆点与提示，置于 Label 右侧，彻底不遮挡输入框数据 */}
        {confidenceProps ? (
          <div
            className="relative flex items-center gap-1 cursor-help shrink-0"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span
              className={cn(
                "inline-block size-1.5 rounded-full ring-1 ring-white shadow-2xs",
                confidenceProps.color,
              )}
            />
            {showTooltip ? (
              <span className="absolute -top-7 right-0 bg-[#1C1917] text-white text-[11px] rounded-lg px-2 py-0.5 whitespace-nowrap pointer-events-none z-30 shadow-md">
                {confidenceProps.tooltip}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <motion.div
          animate={
            field.source === "ocr"
              ? {
                  y: [0, 1.2, 0],
                  scale: [1, 0.992, 1],
                  boxShadow: [
                    "0 0 0 0px rgba(28,25,23,0)",
                    "0 1px 2px 0 rgba(28,25,23,0.08), inset 0 1px 2px 0 rgba(28,25,23,0.05)",
                    "0 0 0 0px rgba(28,25,23,0)",
                  ],
                }
              : {}
          }
          transition={{
            duration: 1.2,
            ease: "easeInOut",
            times: [0, 0.4, 1],
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
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              "rounded-xl tabular-nums text-right text-[#1C1917] transition-all duration-150",
              "bg-[#FAF8F4]/50 border border-[#E5E0D6] shadow-2xs hover:bg-white hover:border-[#78716C]/50 text-[12px] sm:text-[13px]",
              "focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0",
              "h-8 sm:h-9 lg:h-9.5 min-h-[32px] sm:min-h-0 pl-2.5 sm:pl-3",
              suffix ? "pr-7 sm:pr-8 lg:pr-8" : "pr-2.5 sm:pr-3",
              field.source === "ocr"
                ? "border-b-2 border-b-[#D97757]/80 shadow-[0_1px_2px_rgba(217,119,87,0.06)]"
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
      </div>
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

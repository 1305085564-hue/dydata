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
  size?: "primary" | "secondary";
  optional?: boolean;
  animationDelay?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function getConfidenceDotProps(score: number | null | undefined) {
  const s = score ?? 0.5; // 无 confidence 默认中置信
  if (s >= 0.95) {
    return {
      color: "bg-emerald-500",
      tooltip: "AI 高置信识别",
    };
  }
  if (s >= 0.80) {
    return {
      color: "bg-amber-500",
      tooltip: "AI 识别，建议核对",
    };
  }
  return {
    color: "bg-rose-500",
    tooltip: "AI 识别置信度较低，请务必核对",
  };
}

function getStatusBadge(field: SubmissionFieldState) {
  if (field.source !== "ocr") return null;

  const score = field.confidenceScore ?? 0.5;
  if (score >= 0.95) {
    return {
      label: "AI 已识别",
      className: "bg-zinc-50 text-zinc-700 border border-zinc-200",
      dotClass: "bg-emerald-500",
    };
  }
  if (score >= 0.80) {
    return {
      label: "待确认",
      className: "bg-zinc-50 text-zinc-700 border border-zinc-200",
      dotClass: "bg-amber-500",
    };
  }
  return {
    label: "请核对",
    className: "bg-zinc-50 text-zinc-700 border border-zinc-200",
    dotClass: "bg-rose-500",
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
  size = "secondary",
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
  const confidenceProps = field.source === "ocr" ? getConfidenceDotProps(field.confidenceScore) : null;

  return (
    <div className="space-y-1 transition-colors">
      <div className="flex items-center justify-between gap-1">
        <Label
          className={cn(
            "font-medium text-zinc-500 text-[13px]"
          )}
        >
          {label}
          {optional && <span className="ml-1 font-normal opacity-60">可选</span>}
        </Label>
        {statusBadge && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] font-medium tracking-wide",
              statusBadge.className
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusBadge.dotClass)} />
            {statusBadge.label}
          </span>
        )}
      </div>

      <div className="relative">
        <motion.div
          animate={
            field.source === "ocr"
              ? {
                  boxShadow: ["0 0 0px rgba(217,119,87,0)", "0 0 12px rgba(217,119,87,0.3)", "0 0 0px rgba(217,119,87,0)"],
                }
              : {}
          }
          transition={{ duration: 1.5, ease: "easeInOut", times: [0, 0.5, 1], delay: animationDelay / 1000 }}
          className="rounded-xl"
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
              "rounded-xl pr-8 font-mono tabular-nums text-zinc-800 transition-[background-color,border-color,box-shadow,color] duration-300",
              "bg-zinc-100/70 border-transparent text-[13px]",
              "focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 focus:border-b-2 focus:border-b-[#D97757]",
              "h-10",
              field.source === "ocr"
                ? "border-b-2 border-b-[#D97757]/60 shadow-[0_1px_0_0_rgba(217,119,87,0.1)] bg-[#D97757]/[0.03] text-[#D97757]"
                : ""
            )}
          />
        </motion.div>
        {/* 后缀或置信度圆点 */}
        {confidenceProps ? (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full ring-1 ring-white shadow-sm", confidenceProps.color)} />
            {showTooltip ? (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[12px] rounded-lg px-2 py-1 whitespace-nowrap pointer-events-none z-30 shadow-lg">
                {confidenceProps.tooltip}
              </span>
            ) : null}
          </span>
        ) : suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

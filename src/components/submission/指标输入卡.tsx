"use client";


import { useEffect, useState } from "react";
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
}: MetricInputCardProps) {
  const [displayValue, setDisplayValue] = useState(field.value);

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

  return (
    <div className="space-y-1.5 transition-colors">
      <div className="flex items-center justify-between gap-1">
        <Label
          className={cn(
            "font-medium text-zinc-500",
            size === "primary" ? "text-[13px]" : "text-[12px]"
          )}
        >
          {label}
          {optional && <span className="ml-1 font-normal opacity-60">可选</span>}
        </Label>
        {statusLabel && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide scale-90 origin-right bg-zinc-100 text-zinc-500 border border-zinc-200">
            {statusLabel}
          </span>
        )}
      </div>

      <div className="relative">
        <Input
          type="number"
          min={0}
          step={step}
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className={cn(
            "rounded-xl pr-8 font-semibold text-zinc-800 transition-colors tracking-wide",
            "bg-white border-zinc-200 focus:bg-white focus:border-zinc-950/30 focus:ring-1 focus:ring-zinc-950/10",
            size === "primary" ? "h-10 text-lg" : "h-9 text-base",
            field.source === "ocr"
              ? "border-b-2 border-b-zinc-950 shadow-sm font-mono tracking-tight"
              : ""
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

"use client";


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
}: MetricInputCardProps) {
  let statusLabel = null;
  if (field.source === "ocr") {
    statusLabel = "🤖 AI已识别";
  }
  const helperText = null;

  return (
    <div
      className={cn(
        "space-y-1.5 transition-colors",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <Label
          className={cn(
            "font-medium text-[var(--color-text-secondary)]",
            size === "primary" ? "text-[13px]" : "text-[12px]"
          )}
        >
          {label}
          {optional && <span className="ml-1 font-normal opacity-60">可选</span>}
        </Label>
        {statusLabel && (
          <span
            className={cn(
              "text-emerald-600 bg-emerald-50/80 border border-emerald-100",
              "rounded px-1 py-0.5 text-[10px] scale-90 origin-right"
            )}
          >
            {statusLabel}
          </span>
        )}
      </div>

      <div className="relative">
        <Input
          type="number"
          min={0}
          step={step}
          value={field.value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className={cn(
            "rounded-[var(--radius-md)] border-black/8 bg-white/60 pr-8 font-semibold text-[var(--color-text-primary)] transition-all focus:bg-white focus:border-primary/40 focus:ring-2 focus:ring-primary/10",
            size === "primary" ? "h-10 text-lg" : "h-9 text-base",
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)]">
            {suffix}
          </span>
        ) : null}

      </div>

      {helperText ? <p className="text-xs font-medium text-[var(--color-warning)]">{helperText}</p> : null}
    </div>
  );
}

export { MetricInputCard as 指标输入卡 };

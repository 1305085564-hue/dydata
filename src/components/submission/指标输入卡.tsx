"use client";


import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { badgeClass } from "@/lib/tailwind-utils";
import { cn } from "@/lib/utils";
import type { SubmissionFieldState } from "./提交状态机";

interface MetricInputCardProps {
  label: string;
  field: SubmissionFieldState;
  step?: string;
  suffix?: string;
  onChange: (value: string) => void;
  size?: "primary" | "secondary";
  optional?: boolean;
}

export function 指标输入卡({
  label,
  field,
  step = "1",
  suffix,
  onChange,
  size = "secondary",
  optional = false,
}: MetricInputCardProps) {
  const isWarning = field.requiresManualConfirmation && !field.confirmed;
  let statusLabel = null;
  if (field.source === "ocr") {
    statusLabel = "🤖 AI已识别";
  }
  const helperText = null;

  return (
    <div
      className={cn(
        "space-y-2 rounded-[var(--radius-lg)] border border-black/6 bg-white/80 p-3 shadow-[var(--shadow-card)] transition-colors",
        
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label
          className={cn(
            "font-semibold text-[var(--color-text-primary)]",
            size === "primary" ? "text-sm" : "text-xs"
          )}
        >
          {label}
          {optional && <span className="ml-1 font-normal text-[var(--color-text-secondary)]">可选</span>}
        </Label>
        {statusLabel && (
          <span
            className={cn(
              "bg-emerald-50 text-emerald-600 border border-emerald-200",
              "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px]"
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
          className={cn(
            "rounded-[var(--radius-lg)] border bg-white pr-9 font-semibold text-[var(--color-text-primary)] transition-transform duration-200",
            size === "primary" ? "h-11 text-xl" : "h-9 text-base",
            
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

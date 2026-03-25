"use client";

import { AlertTriangle } from "lucide-react";

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
  missingRequired?: boolean;
}

export function 指标输入卡({
  label,
  field,
  step = "1",
  suffix,
  onChange,
  size = "secondary",
  optional = false,
  missingRequired = false,
}: MetricInputCardProps) {
  const isWarning = field.requiresManualConfirmation && !field.confirmed;
  const statusTone = missingRequired ? "danger" : isWarning ? "warning" : "neutral";
  const statusLabel = missingRequired ? "未填写" : field.source === "ocr" ? "OCR识别" : "手动输入";
  const helperText = missingRequired ? "必填，仍未填写" : isWarning ? "待确认，请核对 OCR 结果" : null;

  return (
    <div
      className={cn(
        "space-y-2 rounded-[var(--radius-lg)] border border-black/6 bg-white/80 p-3 shadow-[var(--shadow-card)] transition-colors",
        missingRequired && "border-[color:rgba(255,59,48,0.24)] bg-[color:rgba(255,59,48,0.04)]",
        !missingRequired && isWarning && "border-[color:rgba(255,149,0,0.24)] bg-[color:rgba(255,149,0,0.04)]"
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
        <span
          className={cn(
            badgeClass(statusTone),
            "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px]"
          )}
        >
          {statusLabel}
        </span>
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
            missingRequired &&
              "border-[color:var(--color-danger)] bg-[color:rgba(255,59,48,0.08)] ring-2 ring-[color:rgba(255,59,48,0.12)]",
            !missingRequired &&
              isWarning &&
              "border-[color:var(--color-warning)] bg-[color:rgba(255,149,0,0.08)] ring-2 ring-[color:rgba(255,149,0,0.12)]"
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)]">
            {suffix}
          </span>
        ) : null}
        {(missingRequired || isWarning) ? (
          <AlertTriangle
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2",
              missingRequired ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]"
            )}
          />
        ) : null}
      </div>

      {helperText ? (
        <p className={cn("text-xs font-medium", missingRequired ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]")}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

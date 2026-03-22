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
}

export function 指标输入卡({ label, field, step = "1", suffix, onChange }: MetricInputCardProps) {
  const isWarning = field.requiresManualConfirmation && !field.confirmed;
  const sourceLabel = field.source === "ocr" ? "OCR识别" : "手动输入";

  return (
    <div className="space-y-2 rounded-[var(--radius-lg)] border border-black/6 bg-white/80 p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</Label>
        <span
          className={cn(
            badgeClass(isWarning ? "warning" : "neutral"),
            "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px]"
          )}
        >
          {sourceLabel}
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
            "h-11 rounded-[var(--radius-lg)] border bg-white pr-9 text-base font-semibold text-[var(--color-text-primary)] transition-transform duration-200",
            isWarning &&
              "border-[color:var(--color-warning)] bg-[color:rgba(255,149,0,0.08)] ring-2 ring-[color:rgba(255,149,0,0.12)]"
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)]">
            {suffix}
          </span>
        ) : null}
        {isWarning ? (
          <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-warning)]" />
        ) : null}
      </div>
    </div>
  );
}

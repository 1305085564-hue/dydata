"use client";

import { useMemo } from "react";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ModelFamilySelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  allowEmptyLabel?: string | null;
  disabled?: boolean;
  className?: string;
  triggerTitle?: string;
}

export function ModelFamilySelect({
  value,
  onChange,
  allowEmptyLabel = "跟随全局默认",
  disabled = false,
  className,
  triggerTitle,
}: ModelFamilySelectProps) {
  const { bundle } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  const families = useMemo(() => {
    if (!report?.modelFamilies) return [];
    return report.modelFamilies.map((f) => ({
      id: f.modelId,
      displayName: f.displayName,
      isSelectable: f.isSelectable,
      unavailableReason: f.unavailableReasonKey
        ? AI_CONFIG_MESSAGES[f.unavailableReasonKey]
        : null,
      schedulableCount: f.schedulableChannelCount,
      isShelved: f.isShelved,
    }));
  }, [report]);

  const currentFamily = value ? families.find((f) => f.id === value) : undefined;

  const selectedDisplay = value
    ? currentFamily
      ? currentFamily.displayName
      : value
    : (allowEmptyLabel ?? "请选择模型");

  return (
    <Select
      value={value ?? "__empty__"}
      onValueChange={(val) => {
        if (val === "__empty__" || !val) {
          onChange(null);
        } else {
          onChange(val);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger
        title={triggerTitle}
        className={cn(
          "h-8 w-full rounded-md border border-[#E2E2DF] bg-white px-2 text-[14px] text-[#1F1E1D] shadow-input transition-colors hover:bg-[#F7F7F6]/80 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10",
          className
        )}
        aria-label="选择模型"
      >
        <SelectValue>{selectedDisplay}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64 min-w-[280px] max-w-[360px] w-auto rounded-xl border border-[#E2E2DF] bg-white p-1 text-[#1F1E1D] shadow-claude-float">
        {allowEmptyLabel && (
          <SelectItem value="__empty__" className="text-[12px] text-[#78716C] py-1">
            {allowEmptyLabel}
          </SelectItem>
        )}
        {value && !currentFamily && (
          <SelectItem value={value} disabled className="text-[12px] text-[#A8A29E] py-1">
            {value} (不可选)
          </SelectItem>
        )}
        {families.map((f) => {
          const isSelected = value === f.id;
          // 当前已选的模型即使不可选也照常显示、保留
          const isDisabled = !f.isSelectable && !isSelected;

          return (
            <SelectItem
              key={f.id}
              value={f.id}
              disabled={isDisabled}
              className={cn(
                "text-[12px] py-1",
                isDisabled ? "text-[#A8A29E] opacity-60" : "text-[#1F1E1D]"
              )}
            >
              <div className="flex items-center justify-between gap-2 w-full min-w-0">
                <span
                  className={cn(
                    "truncate",
                    isDisabled ? "text-[#A8A29E]" : "text-[#141413]"
                  )}
                >
                  {f.displayName}
                </span>
                {!f.isSelectable && f.unavailableReason && (
                  <span className="text-[12px] text-[#78716C] shrink-0 whitespace-nowrap pl-2">
                    {f.unavailableReason}
                  </span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

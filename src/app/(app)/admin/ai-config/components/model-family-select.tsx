"use client";

import { useMemo } from "react";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { getModelDisplayName } from "@/lib/ai/model-families";
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
  allowEmptyLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function ModelFamilySelect({
  value,
  onChange,
  allowEmptyLabel = "跟随全局默认兜底",
  disabled = false,
  className,
}: ModelFamilySelectProps) {
  const { bundle } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  // 统一可用性口径：现役（已上架）系列实时计算；0 可调度渠道的系列可见但不可选
  const families = useMemo(() => {
    if (!report) return [];
    return report.modelFamilies
      .filter((f) => f.isShelved)
      .map((f) => ({
        id: f.modelId,
        displayName: f.displayName,
        schedulableCount: f.schedulableChannelCount,
      }))
      .sort(
        (a, b) =>
          b.schedulableCount - a.schedulableCount ||
          a.displayName.localeCompare(b.displayName),
      );
  }, [report]);

  const currentFamily = value ? families.find((f) => f.id === value) : undefined;
  // 当前绑定不可调度：绑定值不在现役系列，或该系列 0 个可调度渠道（不静默改配置，只如实标注）
  const currentUnavailable =
    Boolean(value && report) && (!currentFamily || currentFamily.schedulableCount === 0);

  const selectedDisplay = value
    ? currentFamily
      ? `${currentFamily.displayName} (${currentFamily.schedulableCount} 个密钥就绪)`
      : `${getModelDisplayName(value)} (不可调度 · 0 个密钥就绪)`
    : allowEmptyLabel;

  return (
    <div className="space-y-1">
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
          className={cn(
            "h-8 w-full rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input transition-colors hover:bg-[#F7F7F6]/80 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10",
            className
          )}
          aria-label="选择调度模型系列"
        >
          <SelectValue>{selectedDisplay}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-64 min-w-[280px] max-w-[360px] w-auto rounded-xl border border-[#E2E2DF] bg-white p-1 text-[#1F1E1D] shadow-claude-float">
          {allowEmptyLabel && (
            <SelectItem value="__empty__" className="text-[12px] text-[#78716C] py-1.5">
              {allowEmptyLabel}
            </SelectItem>
          )}
          {value && !currentFamily && (
            <SelectItem value={value} disabled className="text-[12px] text-[#A8A29E] py-1.5">
              {getModelDisplayName(value)} (不可调度 · 0 个密钥就绪)
            </SelectItem>
          )}
          {families.map((f) => (
            <SelectItem
              key={f.id}
              value={f.id}
              disabled={f.schedulableCount === 0}
              className={cn(
                "text-[12px] py-1.5",
                f.schedulableCount === 0 ? "text-[#A8A29E]" : "text-[#1F1E1D]"
              )}
            >
              <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
                <span className="font-medium truncate">{f.displayName}</span>
                <span className="text-[12px] text-[#78716C] shrink-0 font-mono whitespace-nowrap">
                  {f.schedulableCount === 0 ? "0 个就绪" : `${f.schedulableCount} 个就绪`}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {currentUnavailable && (
        <p className="text-[12px] leading-[1.5] text-[#B98A54]">
          当前不可用 · 将按全局顺位兜底
        </p>
      )}
    </div>
  );
}

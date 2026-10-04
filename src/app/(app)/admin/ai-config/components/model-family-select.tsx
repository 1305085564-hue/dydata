"use client";

import { useMemo } from "react";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { getModelDisplayName } from "@/lib/ai/model-families";
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

  return (
    <div className="space-y-1">
      <select
        value={value || ""}
        onChange={(e) => {
          const val = e.target.value.trim();
          onChange(val ? val : null);
        }}
        disabled={disabled}
        className={cn(
          "h-8.5 w-full rounded-md border border-[#E2E2DF] bg-white px-2.5 text-[13px] text-[#1F1E1D] shadow-input transition-colors focus:border-[#D97757] focus:outline-none disabled:bg-[#F1F1F0] disabled:text-[#A8A29E]",
          className
        )}
      >
        {allowEmptyLabel && (
          <option value="">{allowEmptyLabel}</option>
        )}
        {value && !currentFamily && (
          <option value={value} disabled>
            {getModelDisplayName(value)} (不可调度 · 0 个密钥就绪)
          </option>
        )}
        {families.map((f) => (
          <option key={f.id} value={f.id} disabled={f.schedulableCount === 0}>
            {f.schedulableCount === 0
              ? `${f.displayName} (不可调度 · 0 个密钥就绪)`
              : `${f.displayName} (${f.schedulableCount} 个密钥就绪)`}
          </option>
        ))}
      </select>
      {currentUnavailable && (
        <p className="text-[12px] leading-[1.5] text-[#B98A54]">
          当前不可用 · 将按全局顺位兜底
        </p>
      )}
    </div>
  );
}

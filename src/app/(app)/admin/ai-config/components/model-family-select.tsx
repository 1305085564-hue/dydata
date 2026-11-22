"use client";

import { useMemo } from "react";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";
import { compareSelectableModels } from "@/lib/ai-config/list-order";
import type { AvailabilityModelFamily } from "@/lib/ai-config/availability";
import { getModelScope, isModelAllowedForFeature } from "@/lib/ai/provider-protocols";
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
  featureKey?: string;
  allowEmptyLabel?: string | null;
  disabled?: boolean;
  className?: string;
  triggerTitle?: string;
}

export type ModelFamilySelectOption = {
  id: string;
  displayName: string;
  isOcrOnly: boolean;
  isSelectable: boolean;
  scopeBlocked: boolean;
  disabledReason: string | null;
  schedulableCount: number;
  isShelved: boolean;
};

/**
 * 能力限制与拒绝原因复用服务端同一规则，展示分类不决定能否绑定。
 */
export function buildModelFamilySelectOptions(
  modelFamilies: readonly AvailabilityModelFamily[],
  featureKey?: string,
): ModelFamilySelectOption[] {
  return modelFamilies
    .map((f) => {
      const isOcrOnly = (f.modelScope ?? getModelScope(f.modelId)) === "ocr_only";
      const capability = featureKey ? isModelAllowedForFeature(featureKey, f.modelId) : { allowed: true as const };
      const scopeBlocked = !capability.allowed;
      const scopeReason = capability.allowed ? null : capability.reason;
      const unavailableReason = f.unavailableReasonKey
        ? AI_CONFIG_MESSAGES[f.unavailableReasonKey]
        : null;

      return {
        id: f.modelId,
        displayName: f.displayName,
        isOcrOnly,
        isSelectable: f.isSelectable && !scopeBlocked,
        scopeBlocked,
        disabledReason: scopeReason ?? (!f.isSelectable ? unavailableReason : null),
        schedulableCount: f.schedulableChannelCount,
        isShelved: f.isShelved,
      };
    })
    .sort(compareSelectableModels);
}

export function ModelFamilySelect({
  value,
  onChange,
  featureKey,
  allowEmptyLabel = "跟随全局默认",
  disabled = false,
  className,
  triggerTitle,
}: ModelFamilySelectProps) {
  const { bundle } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  const families = useMemo(() => {
    if (!report?.modelFamilies) return [];
    return buildModelFamilySelectOptions(report.modelFamilies, featureKey);
  }, [report, featureKey]);

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
      <SelectContent className="max-h-64 min-w-[280px] max-w-[400px] w-auto rounded-xl border border-[#E2E2DF] bg-white p-1 text-[#1F1E1D] shadow-claude-float">
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
                  {f.isOcrOnly && (
                    <span className="ml-1 text-[12px] text-[#78716C]">· 截图专项</span>
                  )}
                </span>
                {f.disabledReason && (
                  <span className="text-[12px] text-[#78716C] shrink-0 whitespace-nowrap pl-2">
                    {f.disabledReason}
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

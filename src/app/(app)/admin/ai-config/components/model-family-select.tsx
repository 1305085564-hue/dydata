"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useAiConfig } from "../hooks/use-ai-config";
import type { ModelFamilyInfo } from "@/lib/ai/model-families";
import { getModelDisplayName, getModelFamilyId } from "@/lib/ai/model-families";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
  const { data: remoteFamilies } = useSWR<ModelFamilyInfo[]>(
    "/api/admin/ai-config/model-families",
    fetcher,
    { revalidateOnFocus: false }
  );

  // 本地根据 bundle 回退兜底计算，确保无网络时或即时变更时依然实时
  const families = useMemo<Array<{ id: string; displayName: string; availableKeyCount: number }>>(() => {
    if (remoteFamilies && Array.isArray(remoteFamilies) && remoteFamilies.length > 0) {
      return remoteFamilies;
    }

    if (!bundle) return [];

    const map = new Map<string, { id: string; displayName: string; availableKeyCount: number }>(); // gate:transient-map useMemo计算内部去重选项，随渲染释放

    for (const m of bundle.models) {
      if (!m.is_enabled) continue;
      const key = bundle.keys.find((k) => k.id === m.key_id);
      if (!key || !key.is_enabled) continue;
      const provider = bundle.providers.find((p) => p.id === key.provider_id);
      if (!provider || !provider.is_enabled) continue;

      const modelId = m.model_id;
      const entry = map.get(modelId) ?? {
        id: modelId,
        displayName: m.display_name || getModelDisplayName(modelId),
        availableKeyCount: 0,
      };
      entry.availableKeyCount += 1;
      map.set(modelId, entry);
    }

    return Array.from(map.values()).sort((a, b) => b.availableKeyCount - a.availableKeyCount);
  }, [remoteFamilies, bundle]);

  return (
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
      {families.map((f) => (
        <option key={f.id} value={f.id}>
          {f.displayName} ({f.availableKeyCount} 个密钥就绪)
        </option>
      ))}
    </select>
  );
}

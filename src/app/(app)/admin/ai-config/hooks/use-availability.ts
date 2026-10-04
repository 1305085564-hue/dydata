"use client";

import { useMemo } from "react";
import { computeAvailability, type AvailabilityReport } from "@/lib/ai-config/availability";
import type { AiConfigBundle } from "./use-ai-config";

/** 把配置 bundle 换算成统一可用性报告；bundle 每次变更为新引用，memo 随之重算 */
export function useAvailabilityReport(
  bundle: AiConfigBundle | null,
): AvailabilityReport | null {
  return useMemo(() => {
    if (!bundle) return null;
    return computeAvailability({
      providers: bundle.providers,
      keys: bundle.keys,
      models: bundle.models,
      featureControls: bundle.featureControls,
      defaultBinding:
        bundle.featureBindings.find((b) => b.feature_key === "default") ?? null,
    });
  }, [bundle]);
}

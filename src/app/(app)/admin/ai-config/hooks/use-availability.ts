"use client";

import type { AvailabilityReport } from "@/lib/ai-config/availability";
import type { AiConfigBundle } from "./use-ai-config";

/** The server report is the only availability source; the browser never recalculates it. */
export function useAvailabilityReport(bundle: AiConfigBundle | null): AvailabilityReport | null {
  return bundle?.availability ?? null;
}

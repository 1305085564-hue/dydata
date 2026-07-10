import type { GrowthPageData, GrowthPageHydrationData } from "@/lib/loaders/growth-page";

export const GROWTH_FULL_HYDRATION_DELAY_MS = 1200;

export function mergeGrowthPageData(initialData: GrowthPageData, fullData: GrowthPageHydrationData | null): GrowthPageData {
  if (!fullData) {
    return initialData;
  }

  return {
    ...initialData,
    contract: fullData.contract,
    reportCount: fullData.reportCount,
    statusCards: fullData.statusCards,
    capabilityCards: fullData.capabilityCards,
    weakBenchmarkCards: fullData.weakBenchmarkCards,
    pkPanel: fullData.pkPanel,
    scriptBreakdown: fullData.scriptBreakdown,
    advice: fullData.advice,
    myReports: fullData.myReports,
    teamReports: fullData.teamReports,
    teamMembers: fullData.teamMembers,
    summary: fullData.summary,
    loadMode: fullData.loadMode,
    isPartial: fullData.isPartial,
  };
}

export function scheduleGrowthFullHydration(
  task: () => void,
  {
    delayMs = GROWTH_FULL_HYDRATION_DELAY_MS,
    doc = document,
    setTimeoutFn = window.setTimeout.bind(window),
    clearTimeoutFn = window.clearTimeout.bind(window),
  }: {
    delayMs?: number;
    doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
    setTimeoutFn?: typeof window.setTimeout;
    clearTimeoutFn?: typeof window.clearTimeout;
  } = {},
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let active = true;

  const runTask = () => {
    if (!active) return;
    timeoutId = setTimeoutFn(() => {
      if (active) task();
    }, delayMs);
  };

  const handleVisibilityChange = () => {
    if (doc.visibilityState !== "visible") return;
    doc.removeEventListener("visibilitychange", handleVisibilityChange);
    runTask();
  };

  if (doc.visibilityState === "visible") {
    runTask();
  } else {
    doc.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return () => {
    active = false;
    if (timeoutId !== null) {
      clearTimeoutFn(timeoutId);
    }
    doc.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

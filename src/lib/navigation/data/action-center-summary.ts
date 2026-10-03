import {
  isActionCenterSummary,
  type ActionCenterSummary,
} from "@/lib/action-center/types";

export const ACTION_CENTER_CACHE_TTL_MS = 60_000;

let actionCenterSummaryCache: {
  userId: string;
  summary: ActionCenterSummary;
  fetchedAt: number;
} | null = null;
let actionCenterSummaryInFlight: {
  userId: string;
  promise: Promise<ActionCenterSummary>;
} | null = null;
let actionCenterSummaryRequestSequence = 0;

export function getCachedActionCenterSummary(userId: string): ActionCenterSummary | null {
  return actionCenterSummaryCache?.userId === userId
    ? actionCenterSummaryCache.summary
    : null;
}

export function requestActionCenterSummary(userId: string, force = false) {
  const cached = actionCenterSummaryCache;
  if (
    !force
    && cached?.userId === userId
    && Date.now() - cached.fetchedAt < ACTION_CENTER_CACHE_TTL_MS
  ) {
    return Promise.resolve(cached.summary);
  }

  if (!force && actionCenterSummaryInFlight?.userId === userId) {
    return actionCenterSummaryInFlight.promise;
  }

  const url = force
    ? "/api/action-center/summary?refresh=1"
    : "/api/action-center/summary";
  const requestSequence = ++actionCenterSummaryRequestSequence;
  const promise = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("action-center summary request failed");
      const data: unknown = await response.json();
      if (!isActionCenterSummary(data)) {
        throw new Error("action-center summary response invalid");
      }
      if (requestSequence === actionCenterSummaryRequestSequence) {
        actionCenterSummaryCache = {
          userId,
          summary: data,
          fetchedAt: Date.now(),
        };
      }
      return data;
    })
    .finally(() => {
      if (actionCenterSummaryInFlight?.promise === promise) {
        actionCenterSummaryInFlight = null;
      }
    });

  actionCenterSummaryInFlight = { userId, promise };
  return promise;
}

/** The single identity used by configuration summaries and production routing. */
export type ChannelIdentity = "active" | "retest" | "sleeping" | "invalid" | "disabled";

export type ProviderHealthFields = {
  is_enabled: boolean;
  consecutive_failures?: number | null;
  unhealthy_until?: string | null;
  last_failure_at?: string | null;
  last_success_at?: string | null;
  first_failure_at?: string | null;
  invalidated_at?: string | null;
};

export type ChannelGovernance = {
  identity: ChannelIdentity;
  isSchedulable: boolean;
  sleepSource: "manual" | "automatic" | null;
  sleepUntil: string | null;
  persistentFailure: boolean;
};

export const CHANNEL_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Failures 1–2 remain available for retest; later attempts wait progressively longer. */
export function channelCooldownMinutes(consecutiveFailures: number): number {
  if (consecutiveFailures < 3) return 0;
  return [5, 15, 30, 60, 120, 240, 360][Math.min(consecutiveFailures - 3, 6)];
}

export function getChannelGovernance(input: {
  model: ProviderHealthFields & { global_is_enabled?: boolean | null };
  key?: (ProviderHealthFields & { manual_sleep_until?: string | null }) | null;
  provider?: { is_enabled: boolean } | null;
  now?: number;
}): ChannelGovernance {
  const { model, key, provider } = input;
  const now = input.now ?? Date.now();
  const result: ChannelGovernance = {
    identity: "active", isSchedulable: true,
    sleepSource: null, sleepUntil: null, persistentFailure: false,
  };
  if (!key || !provider?.is_enabled || !key.is_enabled || !model.is_enabled) {
    return { ...result, identity: "disabled", isSchedulable: false };
  }

  const health = [key, model];
  const persistentFailure = health.some((row) => {
    const firstFailure = row.first_failure_at && Date.parse(row.first_failure_at);
    return Boolean(firstFailure && now - firstFailure >= CHANNEL_FAILURE_WINDOW_MS &&
      (!row.last_success_at || Date.parse(row.last_success_at) < firstFailure));
  });
  if (persistentFailure || health.some((row) => row.invalidated_at)) {
    return { ...result, identity: "invalid", isSchedulable: false, persistentFailure };
  }

  const sleeps = [
    { until: key.manual_sleep_until, source: "manual" as const },
    { until: key.unhealthy_until, source: "automatic" as const },
    { until: model.unhealthy_until, source: "automatic" as const },
  ].filter((sleep): sleep is { until: string; source: "manual" | "automatic" } =>
    Boolean(sleep.until && Date.parse(sleep.until) > now));
  if (sleeps.length) {
    // The latest deadline is when this channel can actually rejoin the queue.
    const sleep = sleeps.sort((a, b) => Date.parse(b.until) - Date.parse(a.until))[0];
    return { ...result, identity: "sleeping", isSchedulable: false, sleepSource: sleep.source, sleepUntil: sleep.until };
  }
  const requiresRetest = health.some((row) =>
    (row.consecutive_failures ?? 0) > 0 ||
    (row.last_failure_at && (!row.last_success_at || Date.parse(row.last_failure_at) > Date.parse(row.last_success_at))));
  return { ...result, identity: requiresRetest ? "retest" : "active" };
}

/** Key summaries use exactly the same identity rule, without a model-specific restriction. */
export function getProviderKeyGovernance(input: {
  key: ProviderHealthFields & { manual_sleep_until?: string | null };
  provider?: { is_enabled: boolean } | null;
  now?: number;
}): ChannelGovernance {
  return getChannelGovernance({ ...input, model: { is_enabled: true } });
}

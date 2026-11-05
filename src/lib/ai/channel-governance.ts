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

export const CHANNEL_ESCALATION_WINDOW_SECONDS = 10 * 60;
export const CHANNEL_ESCALATION_MODEL_COUNT = 3;
export const CHANNEL_ESCALATION_PAUSE_SECONDS = 5 * 60;

/** Every failed real request waits 1, 5, 30, then at most 60 minutes. */
export function channelCooldownMinutes(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return [1, 5, 30, 60][Math.min(consecutiveFailures - 1, 3)];
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
  if (health.some((row) => row.invalidated_at)) {
    return { ...result, identity: "invalid", isSchedulable: false };
  }
  const sleeps = health
    .filter((row) => row.unhealthy_until && Date.parse(row.unhealthy_until) > now)
    .map((row) => ({ until: row.unhealthy_until!, source: "automatic" as const }));
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

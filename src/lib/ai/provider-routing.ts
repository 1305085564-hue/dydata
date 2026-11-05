import { getChannelGovernance, type ProviderHealthFields } from "./channel-governance";

// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalClient = any;

export type ProviderKeyModelConfig = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  providerName: string;
  providerKeyId: string;
  providerKeyModelId: string;
  requiresProbe?: boolean;
  cooldownUntil?: string | null;
};

type ProviderKeyModelJoinRow = ProviderHealthFields & {
  id: string;
  model_id: string;
  sort_order?: number | null;
  global_is_enabled?: boolean | null;
  last_error_message?: string | null;
  last_failure_scope?: "model" | "unknown" | null;
  key: ProviderKeyJoinRow | ProviderKeyJoinRow[] | null;
};

type ProviderKeyJoinRow = ProviderHealthFields & {
  id: string;
  api_key: string;
  manual_sleep_until?: string | null;
  provider: ProviderJoinRow | ProviderJoinRow[] | null;
};

type ProviderJoinRow = {
  id: string;
  name: string;
  base_url: string;
  is_enabled: boolean;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isProviderKeyModelSchedulable(input: Parameters<typeof getChannelGovernance>[0]) {
  return getChannelGovernance(input).isSchedulable;
}

function toConfig(row: ProviderKeyModelJoinRow, options: { includeSleeping?: boolean } = {}): ProviderKeyModelConfig | null {
  const key = firstOrNull(row.key);
  const provider = firstOrNull(key?.provider);
  if (!key || !provider) return null;
  const governance = getChannelGovernance({ model: row, key, provider });
  if (!governance.isSchedulable && !(options.includeSleeping && governance.identity === "sleeping")) return null;

  return {
    baseUrl: provider.base_url,
    apiKey: key.api_key,
    modelId: row.model_id,
    providerName: provider.name,
    providerKeyId: key.id,
    providerKeyModelId: row.id,
    requiresProbe: governance.identity === "retest" || governance.identity === "sleeping",
    cooldownUntil: governance.sleepUntil,
  };
}

const PROVIDER_KEY_MODEL_SELECT = `
  id,
  model_id,
  is_enabled,
  consecutive_failures,
  unhealthy_until,
  last_failure_at,
  last_success_at,
  last_error_message,
  last_failure_scope,
  first_failure_at,
  invalidated_at,
  sort_order,
  key:ai_provider_keys(
    id,
    api_key,
    is_enabled,
    consecutive_failures,
    unhealthy_until,
    last_failure_at,
    last_success_at,
    first_failure_at,
    invalidated_at,
    manual_sleep_until,
    provider:ai_providers(
      id,
      name,
      base_url,
        is_enabled
    )
  )
`;

async function selectProviderKeyModelRows(
  service: MinimalClient,
  modelIdPreference?: string,
): Promise<ProviderKeyModelJoinRow[]> {
  const buildQuery = (select: string) => {
    let query = service
      .from("ai_provider_key_models")
      .select(select)
      .eq("is_enabled", true);
    if (modelIdPreference?.trim()) {
      query = query.eq("model_id", modelIdPreference.trim());
    }
    return query;
  };

  const result = await buildQuery(PROVIDER_KEY_MODEL_SELECT);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as ProviderKeyModelJoinRow[];
}

export async function getProviderKeyModelConfig(
  service: MinimalClient,
  providerKeyModelId: string,
  options: { includeSleeping?: boolean } = {},
): Promise<ProviderKeyModelConfig | null> {
  const fullResult = await service
    .from("ai_provider_key_models")
    .select(PROVIDER_KEY_MODEL_SELECT)
    .eq("id", providerKeyModelId)
    .maybeSingle();
  if (fullResult.error) throw new Error(fullResult.error.message);
  return fullResult.data ? toConfig(fullResult.data as ProviderKeyModelJoinRow, options) : null;
}

/** 模型内按独立顺位；兜底保留跨模型位置，同模型仍遵守独立顺位。 */
export async function listRankedProviderKeyModels(
  service: MinimalClient,
  modelIdPreference?: string,
  options: { includeSleeping?: boolean } = {},
): Promise<Array<{ providerKeyModelId: string; config: ProviderKeyModelConfig }>> {
  const data = await selectProviderKeyModelRows(service, modelIdPreference);

  const ranked = data
    .map((row) => ({ row, config: toConfig(row, options) }))
    .filter((item): item is { row: ProviderKeyModelJoinRow; config: ProviderKeyModelConfig } =>
      Boolean(item.config),
    )
    .sort((left, right) => Number(right.config.requiresProbe) - Number(left.config.requiresProbe) || (left.row.sort_order ?? 0) - (right.row.sort_order ?? 0) || left.row.id.localeCompare(right.row.id));
  return ranked.map((item) => ({ providerKeyModelId: item.config.providerKeyModelId, config: item.config }));
}

export async function selectHealthyProviderKeyModel(
  service: MinimalClient,
  modelIdPreference?: string,
): Promise<{ providerKeyModelId: string; config: ProviderKeyModelConfig } | null> {
  const [first] = await listRankedProviderKeyModels(service, modelIdPreference);
  return first ?? null;
}

export async function bumpProviderKeyFailure(
  service: MinimalClient,
  providerKeyId: string,
  errorMessage?: string,
  permanentFailure = false,
): Promise<void> {
  const { error } = await service.rpc("bump_provider_key_failure", {
    key_id: providerKeyId,
    permanent_failure: permanentFailure,
    error_message: errorMessage?.slice(0, 500) ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function markProviderKeySuccess(
  service: MinimalClient,
  providerKeyId: string,
): Promise<void> {
  const { error } = await service
    .from("ai_provider_keys")
    .update({
      consecutive_failures: 0,
      first_failure_at: null,
      invalidated_at: null,
      unhealthy_until: null,
      last_success_at: new Date().toISOString(),
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", providerKeyId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function bumpProviderKeyModelFailure(
  service: MinimalClient,
  providerKeyModelId: string,
  errorMessage: string | undefined,
  failureScope: "model" | "unknown",
  permanentFailure = false,
): Promise<void> {
  const { error } = await service.rpc("bump_provider_key_model_failure", {
    key_model_id: providerKeyModelId,
    permanent_failure: permanentFailure,
    error_message: errorMessage?.slice(0, 500) ?? null,
    failure_scope: failureScope,
  });

  if (error) throw new Error(error.message);
}

export async function markProviderKeyModelSuccess(
  service: MinimalClient,
  providerKeyModelId: string,
): Promise<void> {
  const { error } = await service
    .from("ai_provider_key_models")
    .update({
      consecutive_failures: 0,
      first_failure_at: null,
      invalidated_at: null,
      unhealthy_until: null,
      last_success_at: new Date().toISOString(),
      last_error_message: null,
      last_failure_scope: null,
    })
    .eq("id", providerKeyModelId);

  if (error) throw new Error(error.message);
}

/** A database lease serializes the one recovery attempt across app instances. */
export async function claimProviderRecovery(service: MinimalClient, supplyId: string, timeoutMs: number, allowCooling = false): Promise<string | null> {
  const { data, error } = await service.rpc("claim_ai_supply_recovery", {
    supply_id: supplyId, lease_seconds: Math.ceil(timeoutMs / 1000) + 5,
    ...(allowCooling ? { allow_cooling: true } : {}),
  });
  if (error) throw new Error(error.message);
  return data as string | null;
}

export async function releaseProviderRecovery(service: MinimalClient, supplyId: string, token: string): Promise<void> {
  const { error } = await service.rpc("release_ai_supply_recovery", { supply_id: supplyId, lease_token: token });
  if (error) throw new Error(error.message);
}

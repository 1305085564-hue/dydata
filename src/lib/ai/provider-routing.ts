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
};

type ProviderKeyModelJoinRow = {
  id: string;
  model_id: string;
  is_enabled: boolean;
  key:
    | {
        id: string;
        api_key: string;
        is_enabled: boolean;
        priority: number;
        consecutive_failures: number | null;
        unhealthy_until: string | null;
        provider:
          | {
              id: string;
              name: string;
              base_url: string;
              priority: number;
              is_enabled: boolean;
            }
          | Array<{
              id: string;
              name: string;
              base_url: string;
              priority: number;
              is_enabled: boolean;
            }>
          | null;
      }
    | Array<{
        id: string;
        api_key: string;
        is_enabled: boolean;
        priority: number;
        consecutive_failures: number | null;
        unhealthy_until: string | null;
        provider:
          | {
              id: string;
              name: string;
              base_url: string;
              priority: number;
              is_enabled: boolean;
            }
          | Array<{
              id: string;
              name: string;
              base_url: string;
              priority: number;
              is_enabled: boolean;
            }>
          | null;
      }>
    | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isProviderKeyHealthy(input: {
  isEnabled: boolean;
  consecutiveFailures?: number | null;
  unhealthyUntil?: string | null;
  now?: number;
}) {
  if (!input.isEnabled) return false;
  const failures = input.consecutiveFailures ?? 0;
  if (failures < 3) return true;
  if (!input.unhealthyUntil) return false;

  const unhealthyUntilMs = Date.parse(input.unhealthyUntil);
  return Number.isNaN(unhealthyUntilMs) || unhealthyUntilMs <= (input.now ?? Date.now());
}

function toConfig(row: ProviderKeyModelJoinRow): ProviderKeyModelConfig | null {
  if (!row.is_enabled) return null;

  const key = firstOrNull(row.key);
  const provider = firstOrNull(key?.provider);
  if (!key || !provider) return null;
  if (!provider.is_enabled) return null;
  if (!isProviderKeyHealthy({
    isEnabled: key.is_enabled,
    consecutiveFailures: key.consecutive_failures,
    unhealthyUntil: key.unhealthy_until,
  })) {
    return null;
  }

  return {
    baseUrl: provider.base_url,
    apiKey: key.api_key,
    modelId: row.model_id,
    providerName: provider.name,
    providerKeyId: key.id,
    providerKeyModelId: row.id,
  };
}

const PROVIDER_KEY_MODEL_SELECT = `
  id,
  model_id,
  is_enabled,
  key:ai_provider_keys(
    id,
    api_key,
    is_enabled,
    priority,
    consecutive_failures,
    unhealthy_until,
    provider:ai_providers(
      id,
      name,
      base_url,
      priority,
      is_enabled
    )
  )
`;

export async function getProviderKeyModelConfig(
  service: MinimalClient,
  providerKeyModelId: string,
): Promise<ProviderKeyModelConfig | null> {
  const { data, error } = await service
    .from("ai_provider_key_models")
    .select(PROVIDER_KEY_MODEL_SELECT)
    .eq("id", providerKeyModelId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toConfig(data as ProviderKeyModelJoinRow) : null;
}

export async function selectHealthyProviderKeyModel(
  service: MinimalClient,
  modelIdPreference?: string,
): Promise<{ providerKeyModelId: string; config: ProviderKeyModelConfig } | null> {
  let query = service
    .from("ai_provider_key_models")
    .select(PROVIDER_KEY_MODEL_SELECT)
    .eq("is_enabled", true);

  if (modelIdPreference?.trim()) {
    query = query.eq("model_id", modelIdPreference.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const candidates = ((data ?? []) as ProviderKeyModelJoinRow[])
    .map((row) => ({ row, config: toConfig(row) }))
    .filter((item): item is { row: ProviderKeyModelJoinRow; config: ProviderKeyModelConfig } =>
      Boolean(item.config),
    )
    .sort((left, right) => {
      const leftKey = firstOrNull(left.row.key);
      const rightKey = firstOrNull(right.row.key);
      const leftProvider = firstOrNull(leftKey?.provider);
      const rightProvider = firstOrNull(rightKey?.provider);
      const leftScore = (leftKey?.priority ?? 100) + (leftProvider?.priority ?? 100);
      const rightScore = (rightKey?.priority ?? 100) + (rightProvider?.priority ?? 100);
      return leftScore - rightScore;
    });

  const selected = candidates[0];
  return selected
    ? { providerKeyModelId: selected.config.providerKeyModelId, config: selected.config }
    : null;
}

export async function bumpProviderKeyFailure(
  service: MinimalClient,
  providerKeyId: string,
  errorMessage?: string,
): Promise<void> {
  const { error } = await service.rpc("bump_provider_key_failure", {
    key_id: providerKeyId,
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

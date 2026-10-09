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

export type ProviderKeyModelHealthStatus =
  | "disabled"
  | "untested"
  | "healthy"
  | "unhealthy"
  | "unknown";

type ProviderKeyModelJoinRow = {
  id: string;
  model_id: string;
  is_enabled: boolean;
  global_is_enabled?: boolean | null;
  consecutive_failures?: number | null;
  unhealthy_until?: string | null;
  last_failure_at?: string | null;
  last_success_at?: string | null;
  last_error_message?: string | null;
  last_failure_scope?: "model" | "unknown" | null;
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

export type ProviderKeyHealthStatus = "disabled" | "untested" | "healthy" | "unhealthy";

function parseHealthTimestamp(value?: string | null) {
  if (!value?.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getProviderKeyHealthStatus(input: {
  isEnabled: boolean;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  unhealthyUntil?: string | null;
  now?: number;
}): ProviderKeyHealthStatus {
  if (!input.isEnabled) return "disabled";

  const lastSuccessAt = parseHealthTimestamp(input.lastSuccessAt);
  const lastFailureAt = parseHealthTimestamp(input.lastFailureAt);
  const hasInvalidTimestamp =
    (Boolean(input.lastSuccessAt?.trim()) && lastSuccessAt === null) ||
    (Boolean(input.lastFailureAt?.trim()) && lastFailureAt === null);
  if (hasInvalidTimestamp) return "unhealthy";

  if (lastSuccessAt === null && lastFailureAt === null) return "untested";
  if (lastFailureAt !== null && (lastSuccessAt === null || lastFailureAt > lastSuccessAt)) {
    return "unhealthy";
  }

  if (input.unhealthyUntil?.trim()) {
    const unhealthyUntil = parseHealthTimestamp(input.unhealthyUntil);
    if (unhealthyUntil === null || unhealthyUntil > (input.now ?? Date.now())) return "unhealthy";
  }

  return "healthy";
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

export function getProviderKeyModelHealthStatus(input: {
  isEnabled: boolean;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureScope?: "model" | "unknown" | null;
  unhealthyUntil?: string | null;
  now?: number;
}): ProviderKeyModelHealthStatus {
  if (!input.isEnabled) return "disabled";

  const lastSuccessAt = parseHealthTimestamp(input.lastSuccessAt);
  const lastFailureAt = parseHealthTimestamp(input.lastFailureAt);
  const hasInvalidTimestamp =
    (Boolean(input.lastSuccessAt?.trim()) && lastSuccessAt === null) ||
    (Boolean(input.lastFailureAt?.trim()) && lastFailureAt === null);
  if (hasInvalidTimestamp) return "unhealthy";

  if (lastSuccessAt === null && lastFailureAt === null) return "untested";
  if (lastFailureAt !== null && (lastSuccessAt === null || lastFailureAt > lastSuccessAt)) {
    return input.lastFailureScope === "unknown" ? "unknown" : "unhealthy";
  }

  if (input.unhealthyUntil?.trim()) {
    const unhealthyUntil = parseHealthTimestamp(input.unhealthyUntil);
    if (unhealthyUntil === null || unhealthyUntil > (input.now ?? Date.now())) return "unhealthy";
  }

  return "healthy";
}

export function isProviderKeyModelHealthy(input: {
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
  if (row.global_is_enabled === false || row.global_is_enabled === null) return null;

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

  if (!isProviderKeyModelHealthy({
    isEnabled: row.is_enabled,
    consecutiveFailures: row.consecutive_failures,
    unhealthyUntil: row.unhealthy_until,
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
  global_is_enabled,
  consecutive_failures,
  unhealthy_until,
  last_failure_at,
  last_success_at,
  last_error_message,
  last_failure_scope,
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

const LEGACY_PROVIDER_KEY_MODEL_SELECT = `
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

  const fullResult = await buildQuery(PROVIDER_KEY_MODEL_SELECT);
  if (!fullResult.error) return (fullResult.data ?? []) as ProviderKeyModelJoinRow[];

  // 新字段尚未执行 migration 时保留旧代码窗口，旧数据仍可正常调度。
  const legacyResult = await buildQuery(LEGACY_PROVIDER_KEY_MODEL_SELECT);
  if (legacyResult.error) throw new Error(fullResult.error.message);
  return (legacyResult.data ?? []) as ProviderKeyModelJoinRow[];
}

export async function getProviderKeyModelConfig(
  service: MinimalClient,
  providerKeyModelId: string,
): Promise<ProviderKeyModelConfig | null> {
  const fullResult = await service
    .from("ai_provider_key_models")
    .select(PROVIDER_KEY_MODEL_SELECT)
    .eq("id", providerKeyModelId)
    .maybeSingle();
  if (!fullResult.error) return fullResult.data ? toConfig(fullResult.data as ProviderKeyModelJoinRow) : null;

  const legacyResult = await service
    .from("ai_provider_key_models")
    .select(LEGACY_PROVIDER_KEY_MODEL_SELECT)
    .eq("id", providerKeyModelId)
    .maybeSingle();
  if (legacyResult.error) throw new Error(fullResult.error.message);
  return legacyResult.data ? toConfig(legacyResult.data as ProviderKeyModelJoinRow) : null;
}

/** 按优先级返回全部健康候选（Key.priority + Provider.priority 升序），供调用失败时顺位切换 */
export async function listRankedProviderKeyModels(
  service: MinimalClient,
  modelIdPreference?: string,
): Promise<Array<{ providerKeyModelId: string; config: ProviderKeyModelConfig }>> {
  const data = await selectProviderKeyModelRows(service, modelIdPreference);

  return data
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
    })
    .map((item) => ({ providerKeyModelId: item.config.providerKeyModelId, config: item.config }));
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

export async function bumpProviderKeyModelFailure(
  service: MinimalClient,
  providerKeyModelId: string,
  errorMessage: string | undefined,
  failureScope: "model" | "unknown",
): Promise<void> {
  const { error } = await service.rpc("bump_provider_key_model_failure", {
    key_model_id: providerKeyModelId,
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
      unhealthy_until: null,
      last_success_at: new Date().toISOString(),
      last_error_message: null,
      last_failure_scope: null,
    })
    .eq("id", providerKeyModelId);

  if (error) throw new Error(error.message);
}

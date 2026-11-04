import { isProviderKeyModelSchedulable } from "@/lib/ai/provider-routing";

export type KeyDependencyItem = {
  id: string;
  key: string;
  label: string;
  modelId: string | null;
};

export type KeyDependencyCheckResult = {
  criticalBindings: KeyDependencyItem[];
  affectedBindings: KeyDependencyItem[];
};

export type ModelDependencyCheckResult = {
  criticalBindings: KeyDependencyItem[];
  affectedBindings: KeyDependencyItem[];
};

export type ProviderDependencyCheckResult = {
  criticalBindings: KeyDependencyItem[];
  affectedBindings: KeyDependencyItem[];
  keyCount: number;
  modelCount: number;
};

export type DependencyPreview = {
  scope: "provider" | "key" | "model";
  targetId: string;
  complete: boolean;
  unknownReasons: string[];
  channels: Array<{
    id: string;
    name: string;
    providerName: string;
    models: Array<{ modelId: string; displayName: string | null; isEnabled: boolean; isGloballyEnabled: boolean | null }>;
    businessFunctions: Array<{ key: string; label: string }>;
  }>;
  businessFunctions: Array<{ key: string; label: string }>;
  remainingAvailableLineCount?: number;
  soleBusinessFunctions?: Array<{ key: string; label: string }>;
};

type ActiveBindingRow = {
  id: string;
  feature_key: string;
  label: string;
  model_id: string | null;
  provider_key_model_id: string | null;
};

import type { ProviderHealthFields } from "@/lib/ai/channel-governance";

type KeyRow = ProviderHealthFields & {
  manual_sleep_until?: string | null;
  id: string;
  provider_id: string;
  is_enabled: boolean;
  consecutive_failures?: number | null;
  unhealthy_until?: string | null;
};

type ProviderRow = {
  id: string;
  is_enabled: boolean;
};

type KeyModelRow = ProviderHealthFields & {
  id: string;
  key_id: string;
  model_id: string;
  is_enabled: boolean;
  global_is_enabled?: boolean | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDependencyRows(supabase: any) {
  const [bindingsResult, keyModelsResult, keysResult, providersResult] = await Promise.all([
    supabase
      .from("ai_feature_bindings")
      .select("id, feature_key, label, model_id, provider_key_model_id")
      .eq("is_enabled", true)
      .neq("lifecycle_state", "archived"),
    supabase.from("ai_provider_key_models").select("id, key_id, model_id, is_enabled, global_is_enabled, consecutive_failures, unhealthy_until, first_failure_at, invalidated_at, last_failure_at, last_success_at"),
    supabase.from("ai_provider_keys").select("id, provider_id, is_enabled, consecutive_failures, unhealthy_until, manual_sleep_until, first_failure_at, invalidated_at, last_failure_at, last_success_at"),
    supabase.from("ai_providers").select("id, is_enabled"),
  ]);

  const firstError = bindingsResult.error ?? keyModelsResult.error ?? keysResult.error ?? providersResult.error;
  if (firstError) throw new Error(firstError.message);

  const bindings = (bindingsResult.data ?? []) as ActiveBindingRow[];
  const keyModels = (keyModelsResult.data ?? []) as KeyModelRow[];
  const keys = (keysResult.data ?? []) as KeyRow[];
  const providers = (providersResult.data ?? []) as ProviderRow[];
  // gate:transient-map 请求级供应商状态索引；扫描结束释放，无外部缓存 TTL/容量。
  const providerEnabled = new Map(providers.map((provider) => [provider.id, provider.is_enabled]));

  const keyById = new Map(keys.map((key) => [key.id, key])); // gate:transient-map 单次依赖查询索引，返回后释放
  const providerById = new Map(providers.map((provider) => [provider.id, provider])); // gate:transient-map 单次依赖查询索引，返回后释放
  const schedulableModelIds = new Set(keyModels.filter((model) => {
    const key = keyById.get(model.key_id);
    return isProviderKeyModelSchedulable({ model, key, provider: providerById.get(key?.provider_id ?? "") });
  }).map((model) => model.id));
  return { bindings, keyModels, keys, providerEnabled, schedulableModelIds };
}

function asDependencyItem(binding: ActiveBindingRow): KeyDependencyItem {
  return {
    id: binding.id,
    key: binding.feature_key,
    label: binding.label,
    modelId: binding.model_id,
  };
}

/**
 * 模型维度的下架依赖扫描：下架会让目标 model_id 的所有渠道退出调度，
 * 因此备用必须是仍健康的其它模型渠道，运行时才能走全库顺位兜底。
 */
export async function checkModelDependencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  modelId: string,
): Promise<ModelDependencyCheckResult> {
  const rows = await loadDependencyRows(supabase);
  const targetModels = rows.keyModels.filter((model) => model.model_id === modelId);
  const targetModelIds = new Set(targetModels.map((model) => model.id));
  const relevantBindings = rows.bindings.filter(
    (binding) => binding.model_id === modelId || (binding.provider_key_model_id ? targetModelIds.has(binding.provider_key_model_id) : false),
  );

  const hasHealthyFallback = rows.keyModels.some(
    (model) => model.model_id !== modelId && rows.schedulableModelIds.has(model.id),
  );

  return relevantBindings.reduce<ModelDependencyCheckResult>(
    (result, binding) => {
      const item = asDependencyItem(binding);
      (hasHealthyFallback ? result.affectedBindings : result.criticalBindings).push(item);
      return result;
    },
    { criticalBindings: [], affectedBindings: [] },
  );
}

/** 服务商删除前扫描：删除后仍须存在健康渠道，否则阻断核心业务。 */
export async function checkProviderDependencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  providerId: string,
): Promise<ProviderDependencyCheckResult> {
  const rows = await loadDependencyRows(supabase);
  const providerKeyIds = new Set(rows.keys.filter((key) => key.provider_id === providerId).map((key) => key.id));
  const providerModelIds = new Set(rows.keyModels.filter((model) => providerKeyIds.has(model.key_id)).map((model) => model.id));
  const providerModelNames = new Set(rows.keyModels.filter((model) => providerKeyIds.has(model.key_id)).map((model) => model.model_id));
  const relevantBindings = rows.bindings.filter(
    (binding) =>
      (binding.provider_key_model_id ? providerModelIds.has(binding.provider_key_model_id) : false) ||
      (binding.model_id ? providerModelNames.has(binding.model_id) : false),
  );
  const hasHealthyFallback = rows.keyModels.some(
    (model) =>
      !providerKeyIds.has(model.key_id) &&
      rows.schedulableModelIds.has(model.id),
  );

  return {
    criticalBindings: hasHealthyFallback ? [] : relevantBindings.map(asDependencyItem),
    affectedBindings: hasHealthyFallback ? relevantBindings.map(asDependencyItem) : [],
    keyCount: providerKeyIds.size,
    modelCount: rows.keyModels.filter((model) => providerKeyIds.has(model.key_id)).length,
  };
}

export async function checkKeyDependencies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  keyId: string
): Promise<KeyDependencyCheckResult> {
  const rows = await loadDependencyRows(supabase);
  const currentModels = rows.keyModels.filter((model) => model.key_id === keyId);
  const currentIds = new Set(currentModels.map((model) => model.id));
  const currentModelIds = new Set(currentModels.map((model) => model.model_id));
  const relevant = rows.bindings.filter((binding) =>
    (binding.provider_key_model_id && currentIds.has(binding.provider_key_model_id)) ||
    (binding.model_id && currentModelIds.has(binding.model_id)));
  const backups = new Set(rows.keyModels.filter((model) => model.key_id !== keyId && rows.schedulableModelIds.has(model.id)).map((model) => model.model_id));
  return relevant.reduce<KeyDependencyCheckResult>((result, binding) => {
    const hasBackup = Boolean(binding.model_id && backups.has(binding.model_id));
    (hasBackup ? result.affectedBindings : result.criticalBindings).push(asDependencyItem(binding));
    return result;
  }, { criticalBindings: [], affectedBindings: [] });
}

/**
 * 危险动作执行前的只读名单。任何查询不完整都会以 complete=false 返回，
 * 调用方必须拒绝执行，不能把未知压成空数组。
 */
export async function buildDependencyPreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: { scope: "provider" | "key" | "model"; id: string; keyId?: string; modelId?: string },
): Promise<DependencyPreview> {
  const [providersResult, keysResult, modelsResult, bindingsResult] = await Promise.all([
    supabase.from("ai_providers").select("id, name, is_enabled"),
    supabase.from("ai_provider_keys").select("id, provider_id, label, available_models, is_enabled, consecutive_failures, unhealthy_until, first_failure_at, last_failure_at, last_success_at, invalidated_at, manual_sleep_until"),
    supabase.from("ai_provider_key_models").select("id, key_id, model_id, display_name, is_enabled, global_is_enabled, consecutive_failures, unhealthy_until, first_failure_at, last_failure_at, last_success_at, invalidated_at"),
    supabase.from("ai_feature_bindings").select("feature_key, label, model_id, provider_key_model_id").eq("is_enabled", true).neq("lifecycle_state", "archived"),
  ]);
  const firstError = providersResult.error ?? keysResult.error ?? modelsResult.error ?? bindingsResult.error;
  if (firstError) throw new Error(firstError.message);

  const providers = (providersResult.data ?? []) as Array<ProviderRow & { name: string }>;
  const keys = (keysResult.data ?? []) as Array<KeyRow & { label: string; available_models?: unknown }>;
  const models = (modelsResult.data ?? []) as Array<KeyModelRow & { display_name: string | null }>;
  const bindings = (bindingsResult.data ?? []) as Array<{ feature_key: string; label: string; model_id: string | null; provider_key_model_id: string | null }>;
  const providerById = new Map(providers.map((provider) => [provider.id, provider])); // gate:transient-map 单次依赖查询索引，返回后释放
  const selectedKeys = input.scope === "provider"
    ? keys.filter((key) => key.provider_id === input.id)
    : input.scope === "key"
      ? keys.filter((key) => key.id === input.id)
      : keys.filter((key) => models.some((model) => model.key_id === key.id && model.model_id === input.id));
  const selectedKeyIds = new Set(selectedKeys.map((key) => key.id));
  const selectedModels = input.scope === "model"
    ? models.filter((model) => model.model_id === input.id)
    : models.filter((model) => selectedKeyIds.has(model.key_id));
  const selectedModelIds = new Set(selectedModels.map((model) => model.id));
  const relevantBindings = bindings.filter((binding) =>
    (binding.provider_key_model_id ? selectedModelIds.has(binding.provider_key_model_id) : false)
      || (binding.model_id && (input.scope === "model" ? binding.model_id === input.id : selectedModels.some((model) => model.model_id === binding.model_id))),
  );
  const unknownReasons = selectedKeys.flatMap((key) => {
    const available = key.available_models;
    return Object.prototype.hasOwnProperty.call(key, "available_models") && (!Array.isArray(available) || available.length === 0)
      ? [`渠道【${key.label}】从未成功同步或上游返回空清单，无法确认其真实供给`]
      : [];
  });
  const businessFunctions = relevantBindings.map((binding) => ({ key: binding.feature_key, label: binding.label }));
  const channels = selectedKeys.map((key) => {
    const channelModels = selectedModels.filter((model) => model.key_id === key.id);
    const channelModelIds = new Set(channelModels.map((model) => model.id));
    return {
      id: key.id,
      name: key.label,
      providerName: providerById.get(key.provider_id)?.name ?? "未知接入点",
      models: channelModels.map((model) => ({
        modelId: model.model_id,
        displayName: model.display_name,
        isEnabled: model.is_enabled,
        isGloballyEnabled: model.global_is_enabled ?? null,
      })),
      businessFunctions: relevantBindings
        .filter((binding) => (binding.provider_key_model_id ? channelModelIds.has(binding.provider_key_model_id) : false) || (binding.model_id && channelModels.some((model) => model.model_id === binding.model_id)))
        .map((binding) => ({ key: binding.feature_key, label: binding.label })),
    };
  });

  const preview: DependencyPreview = {
    scope: input.scope,
    targetId: input.id,
    complete: unknownReasons.length === 0,
    unknownReasons,
    channels: input.scope === "model" ? [] : channels,
    businessFunctions,
  };

  if (input.scope === "model") {
    const keyById = new Map(keys.map((key) => [key.id, key])); // gate:transient-map 单次依赖查询索引，返回后释放
    const availableLines = models.filter((model) => {
      const key = keyById.get(model.key_id);
      return model.model_id === input.id && model.key_id !== input.keyId && isProviderKeyModelSchedulable({ model, key, provider: providerById.get(key?.provider_id ?? "") });
    });
    preview.remainingAvailableLineCount = availableLines.length;
    preview.soleBusinessFunctions = preview.remainingAvailableLineCount === 0 ? businessFunctions : [];
  }
  return preview;
}

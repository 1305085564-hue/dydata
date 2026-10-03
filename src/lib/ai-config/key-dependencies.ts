import { isProviderKeyHealthy } from "@/lib/ai/provider-routing";

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

type ActiveBindingRow = {
  id: string;
  feature_key: string;
  label: string;
  model_id: string | null;
  provider_key_model_id: string | null;
};

type KeyRow = {
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

type KeyModelRow = {
  id: string;
  key_id: string;
  model_id: string;
  is_enabled: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDependencyRows(supabase: any) {
  const [bindingsResult, keyModelsResult, keysResult, providersResult] = await Promise.all([
    supabase
      .from("ai_feature_bindings")
      .select("id, feature_key, label, model_id, provider_key_model_id")
      .eq("is_enabled", true)
      .neq("lifecycle_state", "archived"),
    supabase.from("ai_provider_key_models").select("id, key_id, model_id, is_enabled"),
    supabase.from("ai_provider_keys").select("id, provider_id, is_enabled, consecutive_failures, unhealthy_until"),
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

  const healthyKeyIds = new Set(
    keys
      .filter((key) => {
        if (!key.is_enabled || !providerEnabled.get(key.provider_id)) return false;
        return isProviderKeyHealthy({
          isEnabled: true,
          consecutiveFailures: key.consecutive_failures,
          unhealthyUntil: key.unhealthy_until,
        });
      })
      .map((key) => key.id),
  );

  return { bindings, keyModels, keys, providerEnabled, healthyKeyIds };
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
    (model) => model.model_id !== modelId && model.is_enabled && rows.healthyKeyIds.has(model.key_id),
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
      model.is_enabled &&
      rows.healthyKeyIds.has(model.key_id),
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
  // 1. 获取该 key 关联的所有 key_model 及 model_id
  const { data: keyModels, error: kmError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id")
    .eq("key_id", keyId);

  if (kmError) {
    throw new Error(kmError.message);
  }

  const currentKeyModelIds = new Set((keyModels ?? []).map((m: { id: string }) => m.id));
  const currentModelIds = new Set((keyModels ?? []).map((m: { model_id: string }) => m.model_id));

  // 2. 查询所有业务功能绑定
  const { data: allBindings, error: bError } = await supabase
    .from("ai_feature_bindings")
    .select("id, feature_key, label, model_id, provider_key_model_id, is_enabled, lifecycle_state")
    .eq("is_enabled", true)
    .neq("lifecycle_state", "archived");

  if (bError) {
    throw new Error(bError.message);
  }

  // 3. 找出所有正在运行并使用该 key 的功能
  const relevantBindings = (allBindings ?? []).filter((b: { provider_key_model_id: string | null; model_id: string | null }) => {
    if (b.provider_key_model_id && currentKeyModelIds.has(b.provider_key_model_id)) return true;
    if (b.model_id && currentModelIds.has(b.model_id)) return true;
    return false;
  });

  // 4. 查询全库其他已启用的 key_models，用来检查是否有备用模型
  const { data: otherKeyModels, error: okmError } = await supabase
    .from("ai_provider_key_models")
    .select(`
      id,
      model_id,
      is_enabled,
      key:ai_provider_keys!inner(id, is_enabled)
    `)
    .neq("key_id", keyId)
    .eq("is_enabled", true)
    .eq("key.is_enabled", true);

  if (okmError) {
    throw new Error(okmError.message);
  }

  const availableBackupModels = new Set(
    (otherKeyModels ?? []).map((m: { model_id: string }) => m.model_id)
  );

  const criticalBindings: KeyDependencyItem[] = [];
  const affectedBindings: KeyDependencyItem[] = [];

  for (const b of relevantBindings) {
    const modelToUse = b.model_id;
    const hasBackup = modelToUse ? availableBackupModels.has(modelToUse) : false;

    const item: KeyDependencyItem = {
      id: b.id,
      key: b.feature_key,
      label: b.label,
      modelId: b.model_id,
    };

    if (hasBackup) {
      affectedBindings.push(item);
    } else {
      criticalBindings.push(item);
    }
  }

  return {
    criticalBindings,
    affectedBindings,
  };
}

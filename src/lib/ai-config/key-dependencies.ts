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

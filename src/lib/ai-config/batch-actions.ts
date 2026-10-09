import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { discoverModelIds, syncModelsForKey } from "@/app/api/admin/ai-config/sync-models/route";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { toTrimmedString } from "@/lib/type-guards";

// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiConfigSupabase = any;

export type AiConfigKeyTestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
};

export type AiConfigMutationResult = {
  affectedCount?: number;
};

export type AiConfigKeyRow = {
  id: string;
  label: string;
};

export function parseModelIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((id) => toTrimmedString(id)).filter(Boolean))]
    : [];
}

export async function handleSyncKeyModels(
  supabase: AiConfigSupabase,
  data: Record<string, unknown>,
) {
  const keyId = toTrimmedString(data.key_id);
  if (!keyId) throw new Error("缺少 key_id");
  const result = await syncModelsForKey(supabase, { keyId });
  return {
    ok: true,
    count: result.newModels.length,
    models: result.newModels.map((model) => model.model_id),
  };
}

export async function handleSetKeyModelSelection(
  supabase: AiConfigSupabase,
  data: Record<string, unknown>,
) {
  const keyId = toTrimmedString(data.key_id);
  if (!keyId) throw new Error("缺少 key_id");
  const modelIds = parseModelIds(data.model_ids);

  const { data: existing, error: existErr } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, is_enabled")
    .eq("key_id", keyId);
  if (existErr) throw new Error(existErr.message);

  const existingRows = (existing ?? []) as Array<{ id: string; model_id: string; is_enabled: boolean }>;
  // gate:transient-map 请求级模型选择索引；调用结束释放，无外部缓存 TTL/容量。
  const existingByModel = new Map(existingRows.map((row) => [row.model_id, row.id]));
  const nowIso = new Date().toISOString();

  const toCreate = modelIds.filter((modelId) => !existingByModel.has(modelId));
  const toDisable = existingRows.filter((row) => !modelIds.includes(row.model_id));
  try {
    if (toCreate.length > 0) {
      const { error: insertErr } = await supabase.from("ai_provider_key_models").insert(
        toCreate.map((modelId) => ({ key_id: keyId, model_id: modelId, display_name: modelId, is_enabled: true, created_at: nowIso })),
      );
      if (insertErr) throw new Error(insertErr.message);
    }

    if (toDisable.length > 0) {
      const { error: disableErr } = await supabase
        .from("ai_provider_key_models")
        .update({ is_enabled: false })
        .in("id", toDisable.map((row) => row.id));
      if (disableErr) throw new Error(disableErr.message);
    }

    if (modelIds.length > 0) {
      const { error: enableErr } = await supabase
        .from("ai_provider_key_models")
        .update({ is_enabled: true })
        .eq("key_id", keyId)
        .in("model_id", modelIds);
      if (enableErr) throw new Error(enableErr.message);
    }
  } catch (error) {
    if (toCreate.length > 0) {
      await supabase
        .from("ai_provider_key_models")
        .delete()
        .eq("key_id", keyId)
        .in("model_id", toCreate);
    }
    await restoreModelShelfState(supabase, existingRows);
    throw error;
  }

  return { ok: true, created: toCreate.length, disabled: toDisable.length, removed: 0 };
}

export async function restoreModelShelfState(
  supabase: AiConfigSupabase,
  snapshot: Array<{ id: string; is_enabled: boolean }>,
) {
  for (const state of [true, false]) {
    const ids = snapshot.filter((row) => row.is_enabled === state).map((row) => row.id);
    if (ids.length === 0) continue;
    const { error } = await supabase
      .from("ai_provider_key_models")
      .update({ is_enabled: state })
      .in("id", ids);
    if (error) throw new Error(`模型上架状态回滚失败：${error.message}`);
  }
}

export async function handleCreateKey(
  supabase: AiConfigSupabase,
  data: Record<string, unknown>,
): Promise<AiConfigMutationResult> {
  const patch = buildAiKeyPatch(data, "create");
  const { data: duplicateRows, error: duplicateError } = await supabase
    .from("ai_provider_keys")
    .select("id")
    .eq("provider_id", patch.provider_id)
    .eq("label", patch.label)
    .limit(1);
  if (duplicateError) throw new Error(duplicateError.message);
  if (Array.isArray(duplicateRows) && duplicateRows.length > 0) {
    throw new Error("同一接入点下已有同名渠道，请换一个渠道显示名");
  }
  const selectedModelIds = parseModelIds(data.selectedModelIds ?? data.selected_model_ids);
  const hasSelectionPayload = Array.isArray(data.selectedModelIds) || Array.isArray(data.selected_model_ids);

  if (!hasSelectionPayload) {
    const { error } = await supabase.from("ai_provider_keys").insert(patch);
    if (error) throw new Error(error.message);
    return {};
  }

  const { data: previousSelectedRows, error: previousRowsError } = await supabase
    .from("ai_provider_key_models")
    .select("id, is_enabled, model_id")
    .in("model_id", selectedModelIds);
  if (previousRowsError) throw new Error(previousRowsError.message);
  const previousRows = (previousSelectedRows ?? []) as Array<{ id: string; is_enabled: boolean; model_id: string }>;

  let keyId: string | null = null;
  try {
    const { error: insertError } = await supabase.from("ai_provider_keys").insert(patch);
    if (insertError) throw new Error(insertError.message);
    const { data: insertedKey, error: keyReadError } = await supabase
      .from("ai_provider_keys")
      .select("id, api_key")
      .eq("provider_id", patch.provider_id)
      .eq("label", patch.label)
      .single();
    if (keyReadError || !insertedKey) throw new Error(keyReadError?.message || "新增 Key 后无法读取记录");
    keyId = (insertedKey as { id: string }).id;

    const { data: providerRow, error: providerError } = await supabase
      .from("ai_providers")
      .select("id, name, base_url")
      .eq("id", patch.provider_id)
      .single();
    if (providerError || !providerRow) throw new Error(providerError?.message || "供应商不存在");
    const provider = providerRow as { base_url?: string | null };
    const discoveredModelIds = await discoverModelIds(
      provider,
      (insertedKey as { api_key?: string }).api_key,
    );
    const allModelIds = [...new Set([...discoveredModelIds, ...selectedModelIds])];
    const { error: modelInsertError } = await supabase.from("ai_provider_key_models").insert(
      allModelIds.map((modelId) => ({
        key_id: keyId,
        model_id: modelId,
        display_name: getModelDisplayName(modelId),
        is_enabled: selectedModelIds.includes(modelId),
        created_at: new Date().toISOString(),
      })),
    );
    if (modelInsertError) throw new Error(modelInsertError.message);

    const { error: availableModelsError } = await supabase
      .from("ai_provider_keys")
      .update({ available_models: discoveredModelIds })
      .eq("id", keyId);
    if (availableModelsError) throw new Error(availableModelsError.message);

    if (selectedModelIds.length > 0) {
      const { error: shelfError } = await supabase
        .from("ai_provider_key_models")
        .update({ is_enabled: true })
        .eq("key_id", keyId)
        .in("model_id", selectedModelIds);
      if (shelfError) throw new Error(shelfError.message);
    }

    return { affectedCount: selectedModelIds.length };
  } catch (error) {
    if (keyId) {
      await supabase.from("ai_provider_keys").delete().eq("id", keyId);
    }
    try {
      await restoreModelShelfState(supabase, previousRows);
    } catch (rollbackError) {
      throw new Error(`${error instanceof Error ? error.message : "新增 Key 失败"}；${rollbackError instanceof Error ? rollbackError.message : "状态回滚失败"}`);
    }
    throw error;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => runWorker()));
  return results;
}

export async function handleSyncAllKeys(supabase: AiConfigSupabase) {
  const { data: keys, error } = await supabase
    .from("ai_provider_keys")
    .select("id, label")
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);

  const keyRows = (keys ?? []) as AiConfigKeyRow[];
  const results = await mapWithConcurrency(keyRows, 5, async (key) => {
    try {
      await syncModelsForKey(supabase, { keyId: key.id });
      return { ok: true as const, key };
    } catch (syncError) {
      return {
        ok: false as const,
        key,
        error: syncError instanceof Error ? syncError.message : "探测模型列表失败",
      };
    }
  });

  return {
    total: keyRows.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results
      .filter((result): result is { ok: false; key: AiConfigKeyRow; error: string } => !result.ok)
      .map((result) => ({ keyId: result.key.id, keyName: result.key.label, error: result.error })),
  };
}

export async function handleTestAllKeys(
  supabase: AiConfigSupabase,
  testKey: (supabase: AiConfigSupabase, data: Record<string, unknown>) => Promise<AiConfigKeyTestResult>,
) {
  const { data: keys, error } = await supabase
    .from("ai_provider_keys")
    .select("id, label")
    .eq("is_enabled", true)
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);

  const keyRows = (keys ?? []) as AiConfigKeyRow[];
  const results = await mapWithConcurrency(keyRows, 5, async (key) => {
    try {
      const result = await testKey(supabase, { key_id: key.id });
      return {
        keyId: key.id,
        keyName: key.label,
        ok: result.ok,
        latencyMs: result.ok ? result.latencyMs : null,
        ...(result.ok ? {} : { error: result.message }),
      };
    } catch (testError) {
      return {
        keyId: key.id,
        keyName: key.label,
        ok: false,
        latencyMs: null,
        error: testError instanceof Error ? testError.message : "连通测试失败",
      };
    }
  });

  return { total: keyRows.length, results };
}

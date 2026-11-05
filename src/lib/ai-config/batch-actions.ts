import { resolveChannelGroup } from "./channel-address";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { discoverModelIds, syncModelsForKey } from "@/app/api/admin/ai-config/sync-models/route";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { toTrimmedString } from "@/lib/type-guards";
import { buildDependencyPreview, requireDependencyConfirmation } from "@/lib/ai-config/key-dependencies";

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
  return result;
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
    .select("*")
    .eq("key_id", keyId);
  if (existErr) throw new Error(existErr.message);

  const existingRows = (existing ?? []) as Array<{ id: string; model_id: string; is_enabled: boolean; disabled_by_model?: boolean | null }>;
  // gate:transient-map 请求级模型选择索引；调用结束释放，无外部缓存 TTL/容量。
  const existingByModel = new Map(existingRows.map((row) => [row.model_id, row.id]));

  const toCreate = modelIds.filter((modelId) => !existingByModel.has(modelId));
  const toDisable = existingRows.filter((row) => !modelIds.includes(row.model_id));
  if (toDisable.length > 0) {
    const preview = await buildDependencyPreview(supabase, {
      scope: "key",
      id: keyId,
      disableSupplyIds: toDisable.map((row) => row.id),
    });
    requireDependencyConfirmation(preview, data.confirm_impact === true, "关闭渠道模型供应");
  }

  const hasModelDisableMarker = existingRows.some((row) => Object.prototype.hasOwnProperty.call(row, "disabled_by_model"));
  try {
    if (toCreate.length > 0) {
      const { error: insertErr } = await supabase.from("ai_provider_key_models").insert(
        toCreate.map((modelId) => ({ key_id: keyId, model_id: modelId, display_name: modelId, is_enabled: true, created_at: new Date().toISOString() })),
      );
      if (insertErr) throw new Error(insertErr.message);
    }

    if (toDisable.length > 0) {
      const { error: disableErr } = await supabase
        .from("ai_provider_key_models")
        .update({ is_enabled: false, ...(hasModelDisableMarker ? { disabled_by_model: false } : {}) })
        .in("id", toDisable.map((row) => row.id));
      if (disableErr) throw new Error(disableErr.message);
    }

    const selectedRows = existingRows.filter((row) => modelIds.includes(row.model_id));
    if (selectedRows.length > 0) {
      const { error: enableErr } = await supabase
        .from("ai_provider_key_models")
        .update({ is_enabled: true, ...(hasModelDisableMarker ? { disabled_by_model: false } : {}) })
        .in("id", selectedRows.map((row) => row.id));
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
  snapshot: Array<{ id: string; is_enabled: boolean; disabled_by_model?: boolean | null }>,
) {
  const groups = new Map<string, { patch: Record<string, boolean | null>; ids: string[] }>();
  for (const row of snapshot) {
    const patch = {
      is_enabled: row.is_enabled,
      ...(row.disabled_by_model !== undefined ? { disabled_by_model: row.disabled_by_model } : {}),
    };
    const key = `${patch.is_enabled}:${patch.disabled_by_model ?? "missing"}`;
    const group: { patch: Record<string, boolean | null>; ids: string[] } = groups.get(key) ?? { patch, ids: [] };
    group.ids.push(row.id);
    groups.set(key, group);
  }
  for (const { patch, ids } of groups.values()) {
    const { error } = await supabase.from("ai_provider_key_models").update(patch).in("id", ids);
    if (error) throw new Error(`模型上架状态回滚失败：${error.message}`);
  }
}

export async function handleCreateKey(
  supabase: AiConfigSupabase,
  data: Record<string, unknown>,
): Promise<AiConfigMutationResult> {
  data = await resolveChannelGroup(supabase,data);
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

    // 已在 insert 和前面的逻辑中设置了 is_enabled，这里的二次 update 是冗余且危险的（会污染其他渠道），直接删除
    // if (selectedModelIds.length > 0) {
    //   const { error: shelfError } = await supabase
    //     .from("ai_provider_key_models")
    //     .update({ is_enabled: true })
    //     .eq("key_id", keyId)
    //     .in("model_id", selectedModelIds);
    //   if (shelfError) throw new Error(shelfError.message);
    // }

    return { affectedCount: selectedModelIds.length };
  } catch (error) {
    if (keyId) {
      await supabase.from("ai_provider_keys").delete().eq("id", keyId);
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
    .select("id, label");
  if (error) throw new Error(error.message);

  const keyRows = (keys ?? []) as AiConfigKeyRow[];
  const results = await mapWithConcurrency(keyRows, 5, async (key) => {
    try {
      const sync = await syncModelsForKey(supabase, { keyId: key.id });
      return { ok: true as const, key, reconciliation: sync.reconciliation };
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
    reconciled: results.flatMap((result) => result.ok
      ? [{ keyId: result.key.id, keyName: result.key.label, reconciliation: result.reconciliation }]
      : []),
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
    .eq("is_enabled", true);
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

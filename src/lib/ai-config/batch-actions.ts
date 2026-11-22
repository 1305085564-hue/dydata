import { normalizeChannelAddress } from "./channel-address";
import { runAiConfigWrite } from "./atomic-write";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { discoverModelIds, syncModelsForKey } from "@/lib/ai-config/sync-models";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { toTrimmedString } from "@/lib/type-guards";
import { buildDependencyPreview, requireDependencyConfirmation } from "@/lib/ai-config/key-dependencies";
import { toCanonicalModelId } from "@/lib/ai-config/canonical-model";

// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiConfigSupabase = any;

export type AiConfigMutationResult = {
  affectedCount?: number;
};

export type AiConfigKeyRow = {
  id: string;
  label: string;
};

export function parseModelIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((id) => toTrimmedString(id)).filter(Boolean).map(toCanonicalModelId))]
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

  const existingRows = (existing ?? []) as Array<{ id: string; model_id: string; canonical_model_id?: string | null; is_enabled: boolean; disabled_by_model?: boolean | null }>;
  const toDisable = existingRows.filter((row) => !modelIds.includes(row.canonical_model_id ?? toCanonicalModelId(row.model_id)));
  if (toDisable.length > 0) {
    const preview = await buildDependencyPreview(supabase, {
      scope: "key",
      id: keyId,
      disableSupplyIds: toDisable.map((row) => row.id),
    });
    requireDependencyConfirmation(preview, data.confirm_impact === true, "关闭渠道模型供应");
  }

  return runAiConfigWrite(supabase,"set_ai_channel_model_selection",{
    p_key_id:keyId,p_model_ids:modelIds,
    p_display_names:Object.fromEntries(modelIds.map(id=>[id,getModelDisplayName(id)])),
  });
}

export async function handleCreateKey(supabase: AiConfigSupabase, data: Record<string, unknown>): Promise<AiConfigMutationResult> {
  let providerId=toTrimmedString(data.provider_id) || null;
  let baseUrl=toTrimmedString(data.base_url) ? normalizeChannelAddress(data.base_url) : null;
  if (baseUrl) {
    const {data: groups,error} = await supabase.from("ai_providers").select("id,base_url");
    if (error) throw new Error(error.message);
    providerId=(groups ?? []).find((group: {base_url:string})=>normalizeChannelAddress(group.base_url)===baseUrl)?.id ?? null;
  } else {
    if (!providerId) throw new Error("缺少渠道地址");
    const {data: provider,error} = await supabase.from("ai_providers").select("base_url").eq("id",providerId).single();
    if(error || !provider) throw new Error(error?.message || "地址分组不存在");
    baseUrl=provider.base_url;
  }
  const label=toTrimmedString(data.label) || new URL(baseUrl!).host;
  const patch=buildAiKeyPatch({...data,provider_id:providerId ?? "new-address-group",label},"create");
  if (providerId) {
    const {data:duplicates,error}=await supabase.from("ai_provider_keys").select("id").eq("provider_id",providerId).eq("label",label).limit(1);
    if(error) throw new Error(error.message);
    if(duplicates?.length) throw new Error("同一接入点下已有同名渠道，请换一个渠道显示名");
  }
  const selectedModelIds=parseModelIds(data.selectedModelIds ?? data.selected_model_ids);
  const selectedModelIdSet = new Set(selectedModelIds);
  const hasSelectionPayload=Array.isArray(data.selectedModelIds) || Array.isArray(data.selected_model_ids);
  // Discovery is read-only and happens before any write, so upstream failure leaves no orphan group/key.
  const discovered=hasSelectionPayload ? await discoverModelIds({base_url:baseUrl},String(patch.api_key)) : [];
  const allModels=[...new Set([...discovered,...selectedModelIds])];
  return runAiConfigWrite(supabase,"create_ai_config_channel",{
    p_provider_id:providerId,p_base_url:baseUrl,p_provider_name:toTrimmedString(data.provider_name) || baseUrl,
    p_label:label,p_api_key:patch.api_key,p_available_models:discovered,p_enabled:patch.is_enabled ?? true,
    p_models:allModels.map(model_id=>({
      model_id,
      display_name:getModelDisplayName(model_id),
      is_enabled:selectedModelIdSet.has(toCanonicalModelId(model_id)),
    })),
  });
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
      return {
        ok: true as const,
        key,
        newCount: sync.newCount,
        removedCount: sync.removedCount,
        removedModelIds: sync.removedModelIds,
        removedEnabledCount: sync.removedEnabledCount,
        removedEnabledModelIds: sync.removedEnabledModelIds,
      };
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
      ? [{
        keyId: result.key.id,
        keyName: result.key.label,
        newCount: result.newCount,
        removedCount: result.removedCount,
        removedModelIds: result.removedModelIds,
        removedEnabledCount: result.removedEnabledCount,
        removedEnabledModelIds: result.removedEnabledModelIds,
      }]
      : []),
    failed: results
      .filter((result): result is { ok: false; key: AiConfigKeyRow; error: string } => !result.ok)
      .map((result) => ({ keyId: result.key.id, keyName: result.key.label, error: result.error })),
  };
}
export async function handleSetModelEnabled(supabase: AiConfigSupabase, data: Record<string, unknown>) {
  const modelId = toTrimmedString(data.modelId ?? data.model_id);
  if (!modelId) throw new Error("缺少 modelId");
  const canonicalModelId = toCanonicalModelId(modelId);
  if (typeof data.is_enabled !== "boolean") throw new Error("缺少 is_enabled");
  const isEnabled = data.is_enabled;
  if (!isEnabled) {
    const preview = await buildDependencyPreview(supabase, { scope: "model", id: canonicalModelId });
    requireDependencyConfirmation(preview, data.confirm_impact === true, "停用模型");
  }
  const { data: currentRows, error: readError } = await supabase
    .from("ai_provider_key_models")
    .select("id, is_enabled, disabled_by_model")
    .eq("canonical_model_id", canonicalModelId);
  if (readError) {
    if (/disabled_by_model/i.test(readError.message ?? "")) {
      throw Object.assign(new Error("数据库尚未执行 AI 供应开关迁移，暂不能批量停用或恢复模型"), { status: 409 });
    }
    throw new Error(readError.message);
  }
  const snapshot = (currentRows ?? []) as Array<{ id: string; is_enabled: boolean; disabled_by_model: boolean | null }>;
  const changedRows = isEnabled
    ? snapshot.filter((row) => row.disabled_by_model === true)
    : snapshot.filter((row) => row.is_enabled);
  if (changedRows.length === 0) {
    return { modelId: canonicalModelId, is_enabled: isEnabled, affectedCount: snapshot.length, changedSupplyCount: 0 };
  }
  const { error: updateError } = await supabase
    .from("ai_provider_key_models")
    .update(isEnabled
      ? { is_enabled: true, disabled_by_model: false }
      : { is_enabled: false, disabled_by_model: true })
    .in("id", changedRows.map((row) => row.id));
  if (updateError) throw new Error(updateError.message);
  return { modelId: canonicalModelId, is_enabled: isEnabled, affectedCount: snapshot.length, changedSupplyCount: changedRows.length };
}

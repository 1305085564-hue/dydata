import { toTrimmedString } from "@/lib/admin/ai-channels";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { readCanonicalModelId, toCanonicalModelId } from "@/lib/ai-config/canonical-model";
import { groupModelIdAliases } from "@/lib/ai/model-discovery";
import { runAiConfigWrite } from "@/lib/ai-config/atomic-write";
import { sanitizeProviderErrorMessage } from "@/lib/ai/provider-health";
import {
  CLAIRIC_UPSTREAM_MODEL_ID,
  normalizeProviderProtocol,
  type AiProviderProtocol,
} from "@/lib/ai/provider-protocols";
import { probeClairicOcr } from "@/lib/clairic-ocr";

type SyncSupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type ProviderInfo = {
  name?: string | null;
  base_url?: string | null;
  protocol?: string | null;
};

type ExistingModelRow = {
  id: string;
  model_id: string;
  canonical_model_id?: string | null;
  display_name?: string | null;
  is_enabled?: boolean;
};

export type SyncError = Error & { status?: number };

function syncError(message: string, status = 400): SyncError {
  const error = new Error(message) as SyncError;
  error.status = status;
  return error;
}

function firstProvider(value: ProviderInfo | ProviderInfo[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function discoverModelIds(
  provider: ProviderInfo | null | undefined,
  apiKey: string | null | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!provider?.base_url || !apiKey?.trim()) {
    throw syncError("探测模型列表失败：渠道 URL 或 API Key 缺失", 502);
  }

  const protocol: AiProviderProtocol = normalizeProviderProtocol(provider.protocol);
  if (protocol === "cloudflare_clairic") {
    const probe = await probeClairicOcr({
      baseUrl: provider.base_url,
      apiKey: apiKey.trim(),
      fetchImpl: fetcher,
    });
    if (probe.ok) {
      return [CLAIRIC_UPSTREAM_MODEL_ID];
    }
    if (probe.status === 401 || probe.status === 403) {
      throw syncError(
        "Cloudflare Clairic 鉴权失败，请检查接口地址和 API Token（需 Workers AI 权限）",
        502,
      );
    }
    const safeMsg = sanitizeProviderErrorMessage(probe.message || "上游请求失败", [apiKey]);
    throw syncError(`探测 Clairic 失败：${safeMsg}`, 502);
  }

  const baseUrlClean = provider.base_url.replace(/\/+$/, "");
  const targetUrl = baseUrlClean.endsWith("/models") ? baseUrlClean : `${baseUrlClean}/models`;
  let response: Response;
  try {
    response = await fetcher(targetUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    const safeMsg = sanitizeProviderErrorMessage(
      error instanceof Error ? error.message : "上游请求失败",
      [apiKey],
    );
    throw syncError(`探测模型列表失败：${safeMsg}`, 502);
  }

  if (!response.ok) {
    const rawDetail = (await response.text().catch(() => "")).slice(0, 200);
    const safeDetail = rawDetail ? sanitizeProviderErrorMessage(rawDetail, [apiKey]) : "";
    throw syncError(`探测模型列表失败 HTTP ${response.status}${safeDetail ? `: ${safeDetail}` : ""}`, 502);
  }

  let payload: { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
  try {
    payload = (await response.json()) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
  } catch {
    throw syncError("探测模型列表失败：上游返回不是有效 JSON", 502);
  }

  const list = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const modelIds = [...new Set(list.map((item) => toTrimmedString(item?.id)).filter(Boolean))];
  if (modelIds.length === 0) {
    throw syncError("探测模型列表失败：上游未返回可用模型", 502);
  }
  return modelIds;
}

type SyncInput = {
  keyId: string;
  modelIds?: string[];
};

export async function syncModelsForKey(
  supabase: SyncSupabase,
  input: SyncInput,
  fetcher: typeof fetch = fetch,
) {
  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, api_key, provider_id, available_models, provider:ai_providers(id, name, base_url, protocol)")
    .eq("id", input.keyId)
    .single();

  if (keyErr || !keyData) {
    throw syncError(keyErr?.message || "密钥不存在", 404);
  }

  let provider = firstProvider((keyData as { provider?: ProviderInfo | ProviderInfo[] | null }).provider);
  if (!provider && (keyData as { provider_id?: string }).provider_id) {
    const { data: providerRow, error: providerError } = await supabase
      .from("ai_providers")
      .select("name, base_url, protocol")
      .eq("id", (keyData as { provider_id: string }).provider_id)
      .single();
    if (providerError) throw syncError(providerError.message);
    provider = providerRow as ProviderInfo | null;
  }
  const { data: existingModels, error: existingError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, canonical_model_id, display_name, is_enabled")
    .eq("key_id", input.keyId);
  if (existingError) throw syncError(existingError.message);

  const existingRows = (existingModels ?? []) as ExistingModelRow[];
  const hasClientModelIds = Boolean(input.modelIds && input.modelIds.length > 0);
  const discoveredModelIds = hasClientModelIds
    ? (input.modelIds ?? []).map((id) => toTrimmedString(id)).filter(Boolean)
    : await discoverModelIds(provider, (keyData as { api_key?: string }).api_key, fetcher);
  const targetCanonicalIds = [...new Set(discoveredModelIds.map(toCanonicalModelId))];
  const availableModels = ((keyData as { available_models?: unknown }).available_models ?? []) as unknown;
  const availableModelIds = Array.isArray(availableModels)
    ? availableModels.map((id) => toTrimmedString(id)).filter(Boolean)
    : [];
  // 调用名只认上游本次清单里真实存在的写法（同款有不带前缀的取不带前缀的）；
  // 本次清单没有该模型时，才沿用库里现有写法，绝不让旧记录的写法盖过上游现状。
  // gate:transient-map 请求级调用名索引；同步调用结束即释放，无外部缓存 TTL/容量。
  const rawModelIdByCanonical = new Map<string, string>();
  const pickRawModelId = (modelId: string, onlyIfMissing: boolean) => {
    const canonical = toCanonicalModelId(modelId);
    const current = rawModelIdByCanonical.get(canonical);
    if (!current) rawModelIdByCanonical.set(canonical, modelId);
    else if (!onlyIfMissing && current.includes("/") && !modelId.includes("/")) rawModelIdByCanonical.set(canonical, modelId);
  };
  for (const modelId of discoveredModelIds) pickRawModelId(modelId, false);
  const discoveredCanonicalIds = new Set(rawModelIdByCanonical.keys());
  for (const modelId of [...existingRows.map((row) => row.model_id), ...availableModelIds]) {
    if (!discoveredCanonicalIds.has(toCanonicalModelId(modelId))) pickRawModelId(modelId, true);
  }
  const targetModelIds = targetCanonicalIds.map((canonical) => rawModelIdByCanonical.get(canonical) ?? canonical);
  const verifiedFromUpstream = !hasClientModelIds;
  // gate:transient-map 请求级模型查重索引；调用结束释放，无外部缓存 TTL/容量。
  const existingMap = new Map(existingRows.map((model) => [readCanonicalModelId(model.model_id, model.canonical_model_id), model]));
  const toInsert = targetCanonicalIds.filter((modelId) => !existingMap.has(modelId));
  const insertedModelIds = new Set(toInsert);
  // 服务端真实取回上游清单时，只写清单内的模型；清单外旧记录由同一个数据库事务撤下。
  const modelIdsToWrite = verifiedFromUpstream
    ? targetModelIds
    : [...new Set([
      ...targetModelIds,
      ...existingRows.map((model) => model.model_id).filter((id) => !discoveredCanonicalIds.has(toCanonicalModelId(id))),
    ])];
  await runAiConfigWrite(supabase as Parameters<typeof runAiConfigWrite>[0], "sync_ai_config_models", {
    p_key_id: input.keyId,
    p_available_models: verifiedFromUpstream ? discoveredModelIds : targetModelIds,
    p_models: modelIdsToWrite.map((model_id) => ({
      model_id,
      display_name: getModelDisplayName(toCanonicalModelId(model_id)),
    })),
    p_verified: verifiedFromUpstream,
  });

  const { data: finalModels, error: finalModelsError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, canonical_model_id, display_name, is_enabled")
    .eq("key_id", input.keyId);
  if (finalModelsError) throw syncError(finalModelsError.message);

  const finalModelRows = (finalModels ?? []) as ExistingModelRow[];
  // 撤下结果按事务后的真实剩余记录计算；数据库未撤下时如实报告 0，不假装已清。
  const finalModelIds = [...new Set(finalModelRows.map((model) => readCanonicalModelId(model.model_id, model.canonical_model_id)))];
  const finalModelIdSet = new Set(finalModelIds);
  const removedRows = verifiedFromUpstream
    ? existingRows.filter((model) => !finalModelIdSet.has(readCanonicalModelId(model.model_id, model.canonical_model_id)))
    : [];
  const removedModelIds = removedRows.map((model) => readCanonicalModelId(model.model_id, model.canonical_model_id));
  const removedEnabledModelIds = removedRows.filter((model) => model.is_enabled).map((model) => readCanonicalModelId(model.model_id, model.canonical_model_id));
  const { data: globalActiveModels, error: globalActiveError } = finalModelIds.length > 0
    ? await supabase
      .from("ai_provider_key_models")
      .select("canonical_model_id")
      .eq("is_enabled", true)
      .in("canonical_model_id", finalModelIds)
    : { data: [], error: null };
  if (globalActiveError) throw syncError(globalActiveError.message);
  const globalActiveModelIds = new Set(
    ((globalActiveModels ?? []) as Array<{ canonical_model_id: string }>).map((model) => model.canonical_model_id),
  );

  return {
    keyId: input.keyId,
    allModels: finalModelRows.map((model) => ({
      modelId: readCanonicalModelId(model.model_id, model.canonical_model_id),
      displayName: model.display_name,
      isEnabled: model.is_enabled,
      isGlobalActive: globalActiveModelIds.has(readCanonicalModelId(model.model_id, model.canonical_model_id)),
      isNewlyDiscovered: insertedModelIds.has(readCanonicalModelId(model.model_id, model.canonical_model_id)),
    })),
    modelGroups: groupModelIdAliases(discoveredModelIds),
    newCount: insertedModelIds.size,
    removedCount: removedModelIds.length,
    removedModelIds,
    removedEnabledCount: removedEnabledModelIds.length,
    removedEnabledModelIds,
  };
}

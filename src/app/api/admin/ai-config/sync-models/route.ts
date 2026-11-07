import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "../../ai-channels/_shared";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { groupModelIdAliases } from "@/lib/ai/model-discovery";
import { runAiConfigWrite } from "@/lib/ai-config/atomic-write";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { createAdminClient } from "@/lib/supabase/admin";

type SyncSupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type ProviderInfo = {
  name?: string | null;
  base_url?: string | null;
};

type SyncError = Error & { status?: number };

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

  const baseUrlClean = provider.base_url.replace(/\/+$/, "");
  const targetUrl = baseUrlClean.endsWith("/models") ? baseUrlClean : `${baseUrlClean}/models`;
  let response: Response;
  try {
    response = await fetcher(targetUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    throw syncError(
      `探测模型列表失败：${error instanceof Error ? error.message : "上游请求失败"}`,
      502,
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw syncError(`探测模型列表失败 HTTP ${response.status}${detail ? `: ${detail}` : ""}`, 502);
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

export type SyncModelsDeps = {
  requireSystemActor: typeof requireSystemActor;
  createAdminClient?: typeof createAdminClient;
  fetcher?: typeof fetch;
};

export const defaultSyncModelsDeps: SyncModelsDeps = { requireSystemActor, createAdminClient };

export async function syncModelsForKey(
  supabase: SyncSupabase,
  input: SyncInput,
  fetcher: typeof fetch = fetch,
) {
  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, api_key, provider_id, provider:ai_providers(id, name, base_url)")
    .eq("id", input.keyId)
    .single();

  if (keyErr || !keyData) {
    throw syncError(keyErr?.message || "密钥不存在", 404);
  }

  let provider = firstProvider((keyData as { provider?: ProviderInfo | ProviderInfo[] | null }).provider);
  if (!provider && (keyData as { provider_id?: string }).provider_id) {
    const { data: providerRow, error: providerError } = await supabase
      .from("ai_providers")
      .select("name, base_url")
      .eq("id", (keyData as { provider_id: string }).provider_id)
      .single();
    if (providerError) throw syncError(providerError.message);
    provider = providerRow as ProviderInfo | null;
  }
  const hasClientModelIds = Boolean(input.modelIds && input.modelIds.length > 0);
  const targetModelIds = hasClientModelIds
    ? [...new Set((input.modelIds ?? []).map((id) => toTrimmedString(id)).filter(Boolean))]
    : await discoverModelIds(provider, (keyData as { api_key?: string }).api_key, fetcher);
  const verifiedFromUpstream = !hasClientModelIds;

  const { data: existingModels, error: existingError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, display_name, is_enabled")
    .eq("key_id", input.keyId);
  if (existingError) throw syncError(existingError.message);

  const existingRows = (existingModels ?? []) as Array<{
    id: string;
    model_id: string;
    display_name?: string | null;
    is_enabled?: boolean;
  }>;
  // gate:transient-map 请求级模型查重索引；调用结束释放，无外部缓存 TTL/容量。
  const existingMap = new Map(existingRows.map((model) => [model.model_id, model]));
  const toInsert = targetModelIds.filter((modelId) => !existingMap.has(modelId));
  const insertedModelIds = new Set(toInsert);
  // 服务端真实取回上游清单时，只写清单内的模型；清单外旧记录由同一个数据库事务撤下。
  const modelIdsToWrite = verifiedFromUpstream
    ? targetModelIds
    : [...new Set([...targetModelIds, ...existingMap.keys()])];
  await runAiConfigWrite(supabase as Parameters<typeof runAiConfigWrite>[0], "sync_ai_config_models", {
    p_key_id: input.keyId,
    p_available_models: targetModelIds,
    p_models: modelIdsToWrite.map((model_id) => ({ model_id, display_name: getModelDisplayName(model_id) })),
    p_verified: verifiedFromUpstream,
  });

  const { data: finalModels, error: finalModelsError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, display_name, is_enabled")
    .eq("key_id", input.keyId);
  if (finalModelsError) throw syncError(finalModelsError.message);

  const finalModelRows = (finalModels ?? []) as Array<{
    id: string;
    model_id: string;
    display_name: string | null;
    is_enabled: boolean;
  }>;
  // 撤下结果按事务后的真实剩余记录计算；数据库未撤下时如实报告 0，不假装已清。
  const finalModelIds = [...new Set(finalModelRows.map((model) => model.model_id))];
  const finalModelIdSet = new Set(finalModelIds);
  const removedRows = verifiedFromUpstream
    ? existingRows.filter((model) => !finalModelIdSet.has(model.model_id))
    : [];
  const removedModelIds = removedRows.map((model) => model.model_id);
  const removedEnabledModelIds = removedRows.filter((model) => model.is_enabled).map((model) => model.model_id);
  const { data: globalActiveModels, error: globalActiveError } = finalModelIds.length > 0
    ? await supabase
      .from("ai_provider_key_models")
      .select("model_id")
      .eq("is_enabled", true)
      .in("model_id", finalModelIds)
    : { data: [], error: null };
  if (globalActiveError) throw syncError(globalActiveError.message);
  const globalActiveModelIds = new Set(
    ((globalActiveModels ?? []) as Array<{ model_id: string }>).map((model) => model.model_id),
  );

  return {
    keyId: input.keyId,
    allModels: finalModelRows.map((model) => ({
      modelId: model.model_id,
      displayName: model.display_name,
      isEnabled: model.is_enabled,
      isGlobalActive: globalActiveModelIds.has(model.model_id),
      isNewlyDiscovered: insertedModelIds.has(model.model_id),
    })),
    modelGroups: groupModelIdAliases(targetModelIds),
    newCount: insertedModelIds.size,
    removedCount: removedModelIds.length,
    removedModelIds,
    removedEnabledCount: removedEnabledModelIds.length,
    removedEnabledModelIds,
  };
}

export async function buildSyncModelsResponse(
  request: NextRequest,
  deps: SyncModelsDeps = defaultSyncModelsDeps,
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const keyId = toTrimmedString(body.keyId || body.key_id);
  if (!keyId) return NextResponse.json({ error: "缺少 keyId" }, { status: 400 });

  const modelIds = Array.isArray(body.modelIds)
    ? [...new Set((body.modelIds as unknown[]).map((id) => toTrimmedString(id)).filter(Boolean))]
    : undefined;

  try {
    // Production POST uses a service client after the system-admin guard; custom auth deps may inject their test client.
    const supabase = deps.createAdminClient
      ? deps.createAdminClient()
      : deps.requireSystemActor === requireSystemActor
        ? createAdminClient()
        : auth.supabase;
    return NextResponse.json(await syncModelsForKey(supabase, { keyId, modelIds }, deps.fetcher ?? fetch));
  } catch (error) {
    const status = typeof (error as SyncError)?.status === "number" ? (error as SyncError).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步模型列表失败" }, { status });
  }
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/ai-config/sync-models", request, async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return appendObservedMutationResult(await buildSyncModelsResponse(request, defaultSyncModelsDeps), observation);
  });
}

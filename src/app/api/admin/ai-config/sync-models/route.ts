import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "../../ai-channels/_shared";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { observeMutation } from "@/lib/observed-mutation";

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
  const targetModelIds = input.modelIds && input.modelIds.length > 0
    ? [...new Set(input.modelIds.map((id) => toTrimmedString(id)).filter(Boolean))]
    : await discoverModelIds(provider, (keyData as { api_key?: string }).api_key, fetcher);

  const { data: existingModels, error: existingError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id")
    .eq("key_id", input.keyId);
  if (existingError) throw syncError(existingError.message);

  // gate:transient-map 请求级模型查重索引；调用结束释放，无外部缓存 TTL/容量。
  const existingMap = new Map(
    ((existingModels ?? []) as Array<{ id: string; model_id: string }>).map((model) => [model.model_id, model.id]),
  );
  const toInsert = targetModelIds.filter((modelId) => !existingMap.has(modelId));
  const insertedModelIds = new Set(toInsert);

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("ai_provider_key_models").insert(
      toInsert.map((modelId) => ({
        key_id: input.keyId,
        model_id: modelId,
        display_name: getModelDisplayName(modelId),
        is_enabled: false,
        created_at: new Date().toISOString(),
      })),
    );
    if (insertError) throw syncError(insertError.message);
  }

  const { error: availableModelsError } = await supabase
    .from("ai_provider_keys")
    .update({ available_models: targetModelIds })
    .eq("id", input.keyId);
  if (availableModelsError) throw syncError(availableModelsError.message);

  const { data: finalModels, error: finalModelsError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, display_name, is_enabled")
    .eq("key_id", input.keyId)
    .in("model_id", targetModelIds);
  if (finalModelsError) throw syncError(finalModelsError.message);

  return {
    ok: true,
    newModels: ((finalModels ?? []) as Array<{ id: string; model_id: string; display_name: string | null }>)
      .filter((model) => insertedModelIds.has(model.model_id))
      .map((model) => ({
      id: model.id,
      model_id: model.model_id,
      displayName: model.display_name || getModelDisplayName(model.model_id),
      })),
  };
}

export async function buildSyncModelsResponse(
  request: NextRequest,
  deps: { requireSystemActor: typeof requireSystemActor } = { requireSystemActor },
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
    return NextResponse.json(await syncModelsForKey(auth.supabase, { keyId, modelIds }));
  } catch (error) {
    const status = typeof (error as SyncError)?.status === "number" ? (error as SyncError).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步模型列表失败" }, { status });
  }
}

export async function POST(request: NextRequest) {
  return observeMutation("/api/admin/ai-config/sync-models", async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    const response = await buildSyncModelsResponse(request);
    observation.setDetail?.({ businessSucceeded: response.ok });
    if (response.ok) observation.mark("finalize");
    return response;
  });
}

import { extractJsonString, type AiMessage } from "@/lib/ai/client";
import { buildHaikuVisionBody,parseHaikuVisionResponse,usesHaikuNativeVision } from "@/lib/ai/haiku-vision-transport";
import { markProviderKeySuccess,markProviderKeyModelSuccess } from "@/lib/ai/provider-routing";
import { classifyProviderFailure,sanitizeProviderErrorMessage,type ProviderFailureScope } from "@/lib/ai/provider-health";
import { describeChannelFailure,type ChannelFailureDiagnostic } from "./failure-diagnostic";
import { toTrimmedString } from "@/lib/type-guards";
import { loadAiConfig,type AiConfigClient } from "./config-loader";

function firstOrNull<T>(value:T|T[]|null|undefined) {return Array.isArray(value) ? value[0] ?? null : value ?? null;}

export async function handleTestKey(supabase: AiConfigClient, data: Record<string, unknown>) {
  const keyId = toTrimmedString(data.key_id);
  const modelId = toTrimmedString(data.model_id);
  if (!keyId) throw new Error("缺少 key_id");

  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, api_key, provider_id, provider:ai_providers(id, name, base_url)")
    .eq("id", keyId)
    .single();

  if (keyErr || !keyData) throw new Error(keyErr?.message || "密钥不存在");

  const keyRow = keyData as unknown as {
    id: string;
    api_key: string;
    provider_id?: string;
    provider: { id: string; name: string; base_url: string } | Array<{ id: string; name: string; base_url: string }> | null;
  };

  let provider = firstOrNull(keyRow.provider);
  if (!provider && keyRow.provider_id) {
    const { data: providerRow, error: providerError } = await supabase
      .from("ai_providers")
      .select("id, name, base_url")
      .eq("id", keyRow.provider_id)
      .single();
    if (providerError || !providerRow) throw new Error(providerError?.message || "供应商不存在");
    provider = providerRow as { id: string; name: string; base_url: string };
  }
  if (!provider?.base_url) throw new Error("渠道 URL 不存在");

  let modelQuery = supabase
    .from("ai_provider_key_models")
    .select("id, model_id")
    .eq("key_id", keyId);
  if (modelId) modelQuery = modelQuery.eq("model_id", modelId);
  else modelQuery = modelQuery.limit(1);
  const { data: modelData, error: modelError } = await modelQuery.maybeSingle();
  if (modelError) throw new Error(modelError.message);
  const mounted = modelData as { id?: string; model_id?: string } | null;
  const testModel = modelId || mounted?.model_id || "gpt-3.5-turbo";

  const result = await probeProviderModel(
    keyRow.api_key,
    provider.base_url,
    testModel,
    toTrimmedString(data.test_mode) === "vision" ? "vision" : "text",
  );
  if (result.ok) {
    await markProviderKeySuccess(supabase, keyId);
    await clearLegacyManualSleep(supabase, keyId);
    if (mounted?.id) await markProviderKeyModelSuccess(supabase, mounted.id);
    return { ...result, errorScope: null };
  }


  return result;
}

export async function handleTestKeyModel(supabase: AiConfigClient, data: Record<string, unknown>) {
  const keyId = toTrimmedString(data.key_id);
  const modelId = toTrimmedString(data.model_id);
  if (!keyId) throw new Error("缺少 key_id");
  if (!modelId) throw new Error("缺少 model_id");

  // 检测范围＝该渠道全部挂载模型（含未勾选、已全站下架的），不按启用位过滤。
  const { data: modelData, error: modelError } = await supabase
    .from("ai_provider_key_models")
    .select("id, key_id, model_id")
    .eq("key_id", keyId)
    .eq("model_id", modelId)
    .maybeSingle();
  if (modelError || !modelData) throw new Error(modelError?.message || "该渠道未挂载此模型");

  const result = await loadKeyProvider(supabase, keyId);
  const probe = await probeProviderModel(result.key.api_key, result.provider.base_url, modelId);
  // 成功必须洗白，否则测通了界面还挂在故障上；失败一律不写计数，探测不得触发调度熔断。
  if (probe.ok) {
    await markProviderKeyModelSuccess(supabase, (modelData as { id: string }).id);
    await markProviderKeySuccess(supabase, keyId);
    await clearLegacyManualSleep(supabase, keyId);
  }
  return probe;
}

type MountedModelTestResult = {
  keyId: string;
  modelId: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  failureDiagnostic?: ChannelFailureDiagnostic | null;
};

export const MODEL_TEST_CONCURRENCY = 4;

export async function clearLegacyManualSleep(supabase: AiConfigClient, keyId: string) {
  const { error } = await supabase.from("ai_provider_keys").update({ manual_sleep_until: null }).eq("id", keyId);
  if (error) throw new Error(error.message);
}

// 单个模型的探测等待上限，也是「这个模型算不算能用」的产品判定线：
// 超过 15 秒才回话的模型，业务上等同于不可用。单测（测试连通）与批量检测共用这一条线，
// 避免同一个模型单独测通过、批量测却判超时（详见日志/2026-10-09.md）。
export const MODEL_PROBE_TIMEOUT_MS = 15_000;
const MODEL_PROBE_TIMEOUT_SECONDS = MODEL_PROBE_TIMEOUT_MS / 1000;

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
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
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => runWorker()),
  );
  return results;
}

export async function testMountedModel(
  supabase: AiConfigClient,
  target: { key_id: string; model_id: string },
): Promise<MountedModelTestResult> {
  try {
    const result = await handleTestKeyModel(supabase, {
      key_id: target.key_id,
      model_id: target.model_id,
    });
    return {
      keyId: target.key_id,
      modelId: target.model_id,
      ok: result.ok,
      latencyMs: result.ok ? result.latencyMs : null,
      error: result.ok ? null : result.message,
      failureDiagnostic: result.ok ? null : result.failureDiagnostic,
    };
  } catch (error) {
    return {
      keyId: target.key_id,
      modelId: target.model_id,
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "模型连通测试失败",
    };
  }
}

export async function handleCheckAllInUse(supabase: AiConfigClient) {
  const before = await loadAiConfig(supabase) as unknown as {
    featureControls: Array<{ group: string; isEnabled: boolean; lifecycleState: string; modelId: string | null }>;
    featureBindings: Array<{ feature_key: string; model_id?: string | null }>;
    keys: Array<{ id: string; provider_id: string; is_enabled: boolean }>;
    providers: Array<{ id: string; is_enabled: boolean }>;
    models: Array<{ key_id: string; model_id: string; is_enabled: boolean }>;
  };
  const modelIds = new Set(
    before.featureControls
      .filter((control) => control.group === "business" && control.isEnabled && control.lifecycleState === "active")
      .map((control) => control.modelId)
      .filter((modelId): modelId is string => Boolean(modelId)),
  );
  const defaultModelId = before.featureBindings.find((binding) => binding.feature_key === "default")?.model_id;
  if (defaultModelId) modelIds.add(defaultModelId);

  // gate:transient-map this key index is built for one check request and discarded with its response.
  const keyById = new Map(before.keys.map((key) => [key.id, key]));
  // gate:transient-map this provider index is built for one check request and discarded with its response.
  const providerById = new Map(before.providers.map((provider) => [provider.id, provider]));
  // gate:transient-map this deduplication index is built for one check request and discarded with its response.
  const targets = new Map<string, { key_id: string; model_id: string }>();
  for (const model of before.models) {
    if (!modelIds.has(model.model_id) || !model.is_enabled) continue;
    const key = keyById.get(model.key_id);
    const provider = key ? providerById.get(key.provider_id) : undefined;
    if (!key?.is_enabled || !provider?.is_enabled) continue;
    targets.set(`${model.key_id}\u0000${model.model_id}`, { key_id: model.key_id, model_id: model.model_id });
  }

  const results = await mapWithConcurrency(
    Array.from(targets.values()),
    MODEL_TEST_CONCURRENCY,
    (target) => testMountedModel(supabase, target),
  );
  const checkResult = {
    total: results.length,
    successCount: results.filter((result) => result.ok).length,
    failureCount: results.filter((result) => !result.ok).length,
    results: results.map(({ keyId, modelId, ok, latencyMs, error, failureDiagnostic }) => ({
      keyId, modelId, ok, latencyMs, message: error, failureDiagnostic: failureDiagnostic ?? null,
    })),
  };
  const latestBundle = await loadAiConfig(supabase);
  // 一次性、待删、勿参考：旧界面的结果字段适配；新界面只读 checkResult。
  // gate:transient-map this label index is built for one response and discarded when it returns.
  const names = new Map(latestBundle.keys.map(key=>[key.id,key.label]));
  const failures = checkResult.results.filter(result=>!result.ok).map(result=>({keyId:result.keyId,keyLabel:names.get(result.keyId) ?? "",modelId:result.modelId,error:result.message ?? "检测失败"}));
  return { ...latestBundle, checkResult,
    total:checkResult.total,results:checkResult.results.map(result=>({...result,keyName:names.get(result.keyId) ?? "",error:result.message})),
    totalKeys:new Set(checkResult.results.map(result=>result.keyId)).size,totalModels:checkResult.total,
    successCount:checkResult.successCount,failureCount:checkResult.failureCount,failures,
  };
}

type ProbeResult = { failureDiagnostic?: ChannelFailureDiagnostic | null } & (
  | { ok: true; latencyMs: number; status: number; message: string; errorScope: null }
  | { ok: false; latencyMs: number; status: number; message: string; errorScope: ProviderFailureScope });

export async function loadKeyProvider(supabase: AiConfigClient, keyId: string) {
  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, api_key, provider_id, provider:ai_providers(id, name, base_url)")
    .eq("id", keyId)
    .single();
  if (keyErr || !keyData) throw new Error(keyErr?.message || "密钥不存在");

  const key = keyData as unknown as {
    id: string;
    api_key: string;
    provider_id?: string;
    provider: { id: string; name: string; base_url: string } | Array<{ id: string; name: string; base_url: string }> | null;
  };
  let provider = firstOrNull(key.provider);
  if (!provider && key.provider_id) {
    const { data: providerRow, error: providerError } = await supabase
      .from("ai_providers")
      .select("id, name, base_url")
      .eq("id", key.provider_id)
      .single();
    if (providerError || !providerRow) throw new Error(providerError?.message || "供应商不存在");
    provider = providerRow as { id: string; name: string; base_url: string };
  }
  if (!provider?.base_url) throw new Error("渠道 URL 不存在");
  return { key, provider };
}

const VISION_PROBE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function isValidVisionProbeContent(content: string) {
  const json = extractJsonString(content);
  if (!json) return false;
  try {
    return (JSON.parse(json) as { color?: unknown }).color === "black";
  } catch {
    return false;
  }
}

export function buildProbeRequestBody(modelId: string, mode: "text" | "vision" = "text"): {
  model: string; messages: AiMessage[]; max_tokens: number; stream: boolean; response_format?: { type: "json_object" };
} {
  return {
    model: modelId,
    messages: [{
      role: "user",
      content: mode === "vision"
        ? [
            { type: "text", text: "请识别图片中单个像素的颜色。若是黑色，只返回 JSON：{\"color\":\"black\"}；否则返回 {\"color\":\"other\"}。" },
            { type: "image_url", image_url: { url: VISION_PROBE_IMAGE } },
          ]
        : "hi",
    }],
    max_tokens: 32,
    stream: false,
    ...(mode === "vision" ? { response_format: { type: "json_object" } } : {}),
  };
}

export async function probeProviderModel(
  apiKey: string,
  baseUrl: string,
  modelId: string,
  mode: "text" | "vision" = "text",
): Promise<ProbeResult> {
  const startedAt = Date.now();
  const probeBody = buildProbeRequestBody(modelId, mode);
  const probeOptions = { messages: probeBody.messages, jsonMode: mode === "vision", maxTokens: probeBody.max_tokens };
  const nativeVision = mode === "vision" && usesHaikuNativeVision(modelId, probeOptions);
  const targetUrl = `${baseUrl.replace(/\/+$/, "")}${nativeVision ? "/messages" : "/chat/completions"}`;
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(nativeVision ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(nativeVision ? buildHaikuVisionBody(modelId, probeOptions) : probeBody),
      signal: AbortSignal.timeout(MODEL_PROBE_TIMEOUT_MS),
    });
    const raw = response.ok ? "" : await response.text().catch(() => "");
    if (response.ok && nativeVision) {
      const parsed = await parseHaikuVisionResponse(response, probeOptions);
      if (!isValidVisionProbeContent(parsed.content)) {
        const message = "图片识别验证失败：没有识别出黑色测试像素";
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          status: response.status,
          message,
          errorScope: "model",
          failureDiagnostic: describeChannelFailure({ message, status: response.status, requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id"), secrets: [apiKey] }),
        };
      }
    }
    const message = response.ok
      ? "连通测试成功"
      : sanitizeProviderErrorMessage(`HTTP ${response.status}${raw ? `: ${raw}` : ""}`, [apiKey]);
    return {
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      status: response.status,
      message,
      errorScope: response.ok ? null : classifyProviderFailure({ status: response.status, message }),
      failureDiagnostic: response.ok ? null : describeChannelFailure({ message, status: response.status, requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id"), secrets: [apiKey] }),
    } as ProbeResult;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    const message = isTimeout
      ? `上游 ${MODEL_PROBE_TIMEOUT_SECONDS} 秒内没有返回任何响应（超时）`
      : sanitizeProviderErrorMessage(error instanceof Error ? error.message : "连接超时或失败", [apiKey]);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      status: 0,
      message,
      errorScope: classifyProviderFailure({ errorType: isTimeout ? "timeout" : "network", message }),
      failureDiagnostic: describeChannelFailure({ message, secrets: [apiKey] }),
    };
  }
}


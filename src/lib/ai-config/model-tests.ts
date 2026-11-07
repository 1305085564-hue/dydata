import { extractJsonString, type AiMessage } from "@/lib/ai/client";
import { buildHaikuVisionBody,parseHaikuVisionResponse,usesHaikuNativeVision } from "@/lib/ai/haiku-vision-transport";
import { markProviderKeySuccess,markProviderKeyModelSuccess } from "@/lib/ai/provider-routing";
import { classifyProviderFailure,isPermanentProviderFailure,sanitizeProviderErrorMessage,type ProviderFailureScope } from "@/lib/ai/provider-health";
import { describeChannelFailure,type ChannelFailureDiagnostic } from "./failure-diagnostic";
import { toTrimmedString } from "@/lib/type-guards";
import { loadAiConfig,type AiConfigClient } from "./config-loader";

function firstOrNull<T>(value:T|T[]|null|undefined) {return Array.isArray(value) ? value[0] ?? null : value ?? null;}

export async function recordManualProbeFailure(
  client: AiConfigClient,
  input: {
    keyModelId: string;
    errorScope?: ProviderFailureScope | null;
    status?: number;
    message: string;
  },
) {
  // 手动与真实调用共用同一永久失效规则：只有 Key 级明确鉴权失败才永久；模型级失败只休息。
  const permanentFailure = isPermanentProviderFailure({
    status: input.status,
    message: input.message,
  });
  const { error } = await client.rpc("record_ai_manual_supply_failure", {
    supply_id: input.keyModelId,
    failure_scope: input.errorScope ?? "unknown",
    permanent_failure: permanentFailure,
    error_message: input.message,
  });
  if (error) throw new Error(error.message);
}

export async function handleTestKey(
  supabase: AiConfigClient,
  data: Record<string, unknown>,
  options: { healthClient?: AiConfigClient } = {},
) {
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
    return { ...result, errorScope: null, stateWriteError: null };
  }

  let stateWriteError: string | null = null;
  if (mounted?.id) {
    try {
      await recordManualProbeFailure(options.healthClient ?? supabase, {
        keyModelId: mounted.id,
        errorScope: result.errorScope,
        status: result.status,
        message: result.message,
      });
    } catch (error) {
      stateWriteError = error instanceof Error ? error.message : "测试失败状态写入失败";
    }
  }
  return { ...result, stateWriteError };
}

export async function handleTestKeyModel(
  supabase: AiConfigClient,
  data: Record<string, unknown>,
  options: { recordFailure?: boolean; healthClient?: AiConfigClient } = {},
) {
  const keyId = toTrimmedString(data.key_id);
  const modelId = toTrimmedString(data.model_id);
  if (!keyId) throw new Error("缺少 key_id");
  if (!modelId) throw new Error("缺少 model_id");

  const { data: modelData, error: modelError } = await supabase
    .from("ai_provider_key_models")
    .select("id, key_id, model_id")
    .eq("key_id", keyId)
    .eq("model_id", modelId)
    .maybeSingle();
  if (modelError || !modelData) throw new Error(modelError?.message || "该渠道未挂载此模型");
  const supplyId = (modelData as { id: string }).id;

  const result = await loadKeyProvider(supabase, keyId);
  const probe = await probeProviderModel(result.key.api_key, result.provider.base_url, modelId);
  // 成功必须洗白，否则测通了界面还挂在故障上。
  if (probe.ok) {
    await markProviderKeyModelSuccess(supabase, supplyId);
    await markProviderKeySuccess(supabase, keyId);
    await clearLegacyManualSleep(supabase, keyId);
    return { ...probe, keyModelId: supplyId, stateWriteError: null };
  }

  let stateWriteError: string | null = null;
  if (options.recordFailure) {
    try {
      await recordManualProbeFailure(options.healthClient ?? supabase, {
        keyModelId: supplyId,
        errorScope: probe.errorScope,
        status: probe.status,
        message: probe.message,
      });
    } catch (error) {
      stateWriteError = error instanceof Error ? error.message : "测试失败状态写入失败";
    }
  }
  return { ...probe, keyModelId: supplyId, stateWriteError };
}

type MountedModelTestResult = {
  keyId: string;
  modelId: string;
  keyModelId: string | null;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  errorScope?: ProviderFailureScope | null;
  status?: number;
  failureDiagnostic?: ChannelFailureDiagnostic | null;
  stateWriteError?: string | null;
};

export type KeyFailureClaim = {
  claim: (keyId: string) => boolean;
};

/** 同一次批量检测内的 Key 级失败只认领一次；认领在异步写库前同步完成。 */
export function createKeyFailureClaim(): KeyFailureClaim {
  // gate:transient-map 仅在一次批量请求生命周期内使用，随请求返回释放。
  const claimed = new Set<string>();
  return {
    claim(keyId: string) {
      if (claimed.has(keyId)) return false;
      claimed.add(keyId);
      return true;
    },
  };
}

async function recordOneTestFailure(
  client: AiConfigClient,
  failure: {
    keyId: string;
    keyModelId: string;
    errorScope?: ProviderFailureScope | null;
    status?: number;
    message: string;
  },
  keyFailureClaim: KeyFailureClaim,
): Promise<string | null> {
  if (failure.errorScope === "key" && !keyFailureClaim.claim(failure.keyId)) {
    return null;
  }
  try {
    await recordManualProbeFailure(client, {
      keyModelId: failure.keyModelId,
      errorScope: failure.errorScope,
      status: failure.status,
      message: failure.message,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "测试失败状态写入失败";
  }
}

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
  options: { healthClient?: AiConfigClient; keyFailureClaim?: KeyFailureClaim } = {},
): Promise<MountedModelTestResult> {
  try {
    const result = await handleTestKeyModel(supabase, {
      key_id: target.key_id,
      model_id: target.model_id,
    });
    const keyModelId = "keyModelId" in result ? String(result.keyModelId) : null;
    let stateWriteError: string | null = null;
    if (!result.ok && keyModelId) {
      // 单条失败在本次工作结束前写库；Key 级失败同批只认领一次，不能等整批结束。
      stateWriteError = await recordOneTestFailure(
        options.healthClient ?? supabase,
        {
          keyId: target.key_id,
          keyModelId,
          errorScope: result.errorScope,
          status: result.status,
          message: result.message,
        },
        options.keyFailureClaim ?? createKeyFailureClaim(),
      );
    }
    return {
      keyId: target.key_id,
      modelId: target.model_id,
      keyModelId,
      ok: result.ok,
      latencyMs: result.ok ? result.latencyMs : null,
      error: result.ok ? null : result.message,
      errorScope: result.ok ? null : result.errorScope,
      status: result.ok ? undefined : result.status,
      failureDiagnostic: result.ok ? null : result.failureDiagnostic,
      stateWriteError,
    };
  } catch (error) {
    return {
      keyId: target.key_id,
      modelId: target.model_id,
      keyModelId: null,
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "模型连通测试失败",
      errorScope: null,
    };
  }
}

export async function handleCheckAllInUse(
  supabase: AiConfigClient,
  options: { healthClient?: AiConfigClient } = {},
) {
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

  const healthClient = options.healthClient ?? supabase;
  const keyFailureClaim = createKeyFailureClaim();
  const results = await mapWithConcurrency(
    Array.from(targets.values()),
    MODEL_TEST_CONCURRENCY,
    (target) => testMountedModel(supabase, target, { healthClient, keyFailureClaim }),
  );
  const stateWriteErrors = results
    .map((result) => result.stateWriteError)
    .filter((value): value is string => Boolean(value));
  const checkResult = {
    total: results.length,
    successCount: results.filter((result) => result.ok).length,
    failureCount: results.filter((result) => !result.ok).length,
    stateWriteError: stateWriteErrors.length > 0 ? stateWriteErrors.join("；") : null,
    results: results.map(({ keyId, modelId, ok, latencyMs, error, failureDiagnostic, stateWriteError }) => ({
      keyId, modelId, ok, latencyMs, message: error, failureDiagnostic: failureDiagnostic ?? null, stateWriteError: stateWriteError ?? null,
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

// 识图冒烟测试图：白底黑字 427。号码只放在图片里、不写进提示词，避免不读图的模型照抄提示词通过。
const VISION_PROBE_NUMBER = "427";
const VISION_PROBE_IMAGE = "data:image/png;base64,"
  + "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";

export function isValidVisionProbeContent(content: string) {
  const json = extractJsonString(content);
  if (!json) return false;
  try {
    const parsed = JSON.parse(json) as { number?: unknown };
    return String(parsed.number ?? "").replace(/\s+/g, "") === VISION_PROBE_NUMBER;
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
            { type: "text", text: "请识别图片中的三位数字，只返回 JSON 对象，字段 number 填图片里的数字；不要解释，不要 Markdown。" },
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
        const message = "图片识别验证失败：没有正确识别出测试图片中的数字";
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


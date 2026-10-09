import { NextRequest, NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import { getAiFeatureCatalogEntry } from "@/lib/ai/feature-catalog";
import { buildAiFeatureControls, type AiFeatureBindingControlRow } from "@/lib/ai-config/feature-controls";
import { changeAiFeatureLifecycle } from "@/lib/ai-config/feature-lifecycle";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { swapKeyPriority } from "@/lib/ai-config/swap-key-priority";
import { clearFeaturePromptCache } from "@/lib/ai/load-feature-prompt";
import {
  classifyProviderFailure,
  sanitizeProviderErrorMessage,
  type ProviderFailureScope,
} from "@/lib/ai/provider-health";
import {
  handleCreateKey,
  handleSetKeyModelSelection,
  handleSyncKeyModels,
  handleSyncAllKeys,
  handleTestAllKeys,
  restoreModelShelfState,
} from "@/lib/ai-config/batch-actions";
import {
  checkKeyDependencies,
  checkModelDependencies,
  checkProviderDependencies,
} from "@/lib/ai-config/key-dependencies";
import {
  requireSystemActor,
  toBoolean,
  toNullableString,
  toPriority,
  toTrimmedString,
} from "../ai-channels/_shared";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type AiConfigEntity =
  | "provider"
  | "key"
  | "model"
  | "feature_binding";
type AiConfigAction =
  | "create"
  | "update"
  | "delete"
  | "test_key"
  | "test_key_model"
  | "test_key_all_models"
  | "test_all_keys_all_models"
  | "swap_key_priority"
  | "save_feature_control"
  | "archive_feature"
  | "restore_feature"
  | "set_global_default_model"
  | "sync_key_models"
  | "set_key_model_selection"
  | "set_global_model_shelf_state"
  | "sync_all_keys"
  | "test_all_keys";

type AiConfigBody = {
  action?: unknown;
  entity?: unknown;
  data?: unknown;
};

type SupabaseClient = Awaited<ReturnType<typeof requireSystemActor>> extends infer T
  ? T extends { supabase: infer S }
    ? S
    : never
  : never;

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function maskApiKeyLast4(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return `***${text.slice(-4)}`;
}

function parseAction(value: unknown): AiConfigAction | null {
  const action = toTrimmedString(value);
  return action === "create" || action === "update" || action === "delete" || action === "test_key" || action === "test_key_model" || action === "test_key_all_models" || action === "test_all_keys_all_models" || action === "swap_key_priority" || action === "save_feature_control" || action === "archive_feature" || action === "restore_feature" || action === "set_global_default_model" || action === "sync_key_models" || action === "set_key_model_selection" || action === "set_global_model_shelf_state" || action === "sync_all_keys" || action === "test_all_keys" ? action : null;
}

function parseEntity(value: unknown): AiConfigEntity | null {
  const entity = toTrimmedString(value);
  return entity === "provider" || entity === "key" || entity === "model" || entity === "feature_binding" ? entity : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requireId(data: Record<string, unknown>) {
  const id = toTrimmedString(data.id);
  if (!id) throw new Error("缺少 id");
  return id;
}

function providerPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.name !== undefined) patch.name = toTrimmedString(data.name);
  if (mode === "create" || data.base_url !== undefined) patch.base_url = toTrimmedString(data.base_url);
  if (data.description !== undefined) patch.description = toNullableString(data.description);
  if (data.priority !== undefined) patch.priority = toPriority(data.priority, 100);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.name || !patch.base_url)) throw new Error("供应商缺少 name/base_url");
  return patch;
}

function modelPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.key_id !== undefined) patch.key_id = toTrimmedString(data.key_id);
  if (mode === "create" || data.model_id !== undefined) patch.model_id = toTrimmedString(data.model_id);
  if (data.display_name !== undefined) patch.display_name = toNullableString(data.display_name);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.key_id || !patch.model_id)) throw new Error("模型缺少 key_id/model_id");
  return patch;
}

async function loadAiConfig(supabase: SupabaseClient) {
  const [providersResult, keysResult, featureBindingsResult] = await Promise.all([
    supabase.from("ai_providers").select("id, name, base_url, description, priority, is_enabled, created_at, updated_at").order("priority", { ascending: true }),
    supabase.from("ai_provider_keys").select("id, provider_id, label, api_key, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, available_models, created_at, updated_at").order("priority", { ascending: true }),
    supabase.from("ai_feature_bindings").select("id, feature_key, label, provider_key_model_id, model_id, system_prompt, output_token_limit, context_message_limit, channel_settings, is_enabled, lifecycle_state, archived_at, archived_reason, created_at, updated_at").order("created_at", { ascending: true }),
  ]);

  let modelsResult = await supabase
    .from("ai_provider_key_models")
    .select("id, key_id, model_id, display_name, is_enabled, consecutive_failures, unhealthy_until, last_failure_at, last_success_at, last_error_message, last_failure_scope, created_at")
    .order("created_at", { ascending: true });
  if (modelsResult.error) {
    // migration 尚未执行时保留旧字段读取，避免新应用让旧数据库整页不可用。
    modelsResult = (await supabase
      .from("ai_provider_key_models")
      .select("id, key_id, model_id, display_name, is_enabled, created_at")
      .order("created_at", { ascending: true })) as typeof modelsResult;
  }

  const firstError =
    providersResult.error ??
    keysResult.error ??
    modelsResult.error ??
    featureBindingsResult.error;

  if (firstError) throw new Error(firstError.message);

  return {
    providers: providersResult.data ?? [],
    keys: (keysResult.data ?? []).map((row) => ({
      ...row,
      api_key: undefined,
      api_key_masked: maskApiKeyLast4((row as { api_key?: unknown }).api_key),
    })),
    models: modelsResult.data ?? [],
    featureBindings: featureBindingsResult.data ?? [],
    featureControls: buildAiFeatureControls((featureBindingsResult.data ?? []) as AiFeatureBindingControlRow[]),
  };
}

type MutationResult = {
  affectedCount?: number;
  cascade?: { keyCount: number; modelCount: number };
};
type MutationError = Error & { status?: number };

function mutationError(message: string, status = 400): MutationError {
  const error = new Error(message) as MutationError;
  error.status = status;
  return error;
}

async function handleSetGlobalModelShelfState(supabase: SupabaseClient, data: Record<string, unknown>) {
  const modelId = toTrimmedString(data.modelId ?? data.model_id);
  if (!modelId) throw new Error("缺少 modelId");
  if (typeof data.is_enabled !== "boolean") throw new Error("缺少 is_enabled");
  const isEnabled = data.is_enabled;

  if (!isEnabled) {
    const deps = await checkModelDependencies(supabase, modelId);
    if (deps.criticalBindings.length > 0) {
      const labels = deps.criticalBindings.map((binding) => binding.label).join("、");
      throw mutationError(`模型【${modelId}】仍被【${labels}】独占使用且无健康备用渠道，禁止下架`, 409);
    }
  }

  const { data: currentRows, error: readError } = await supabase
    .from("ai_provider_key_models")
    .select("id, is_enabled")
    .eq("model_id", modelId);
  if (readError) throw new Error(readError.message);
  const snapshot = (currentRows ?? []) as Array<{ id: string; is_enabled: boolean }>;

  const { error: updateError } = await supabase
    .from("ai_provider_key_models")
    .update({ is_enabled: isEnabled })
    .eq("model_id", modelId);
  if (updateError) {
    try {
      await restoreModelShelfState(supabase, snapshot);
    } catch (rollbackError) {
      throw new Error(`${updateError.message}；${rollbackError instanceof Error ? rollbackError.message : "状态回滚失败"}`);
    }
    throw new Error(updateError.message);
  }

  return { modelId, is_enabled: isEnabled, affectedCount: snapshot.length };
}

async function applyMutation(
  supabase: SupabaseClient,
  action: Extract<AiConfigAction, "create" | "update" | "delete">,
  entity: AiConfigEntity,
  data: Record<string, unknown>
): Promise<MutationResult> {
  if (entity === "feature_binding") {
    throw new Error("业务功能由 AI 总控统一管理，不能直接修改内部绑定");
  }

  const table = {
    provider: "ai_providers",
    key: "ai_provider_keys",
    model: "ai_provider_key_models",
    feature_binding: "ai_feature_bindings",
  }[entity];

  const targetId = action === "delete" || action === "update" ? requireId(data) : "";

  if (action === "delete") {
    if (entity === "provider") {
      const deps = await checkProviderDependencies(supabase, targetId);
      if (deps.criticalBindings.length > 0) {
        const labels = deps.criticalBindings.map((binding) => binding.label).join("、");
        throw mutationError(`该服务商正被【${labels}】独占使用且无健康备用渠道，禁止删除`, 409);
      }
      const { error } = await supabase.from("ai_providers").delete().eq("id", targetId);
      if (error) throw new Error(error.message);
      return { cascade: { keyCount: deps.keyCount, modelCount: deps.modelCount } };
    }
    if (entity === "key") {
      const deps = await checkKeyDependencies(supabase, targetId);
      if (deps.criticalBindings.length > 0) {
        const labels = deps.criticalBindings.map((b) => b.label).join("、");
        const error = new Error(`该密钥正被【${labels}】使用且无备用模型，禁止删除`);
        (error as { status?: number }).status = 409;
        throw error;
      }
      // 级联删除关联的 key_models
      await supabase.from("ai_provider_key_models").delete().eq("key_id", targetId);
    }
    const { error } = await supabase.from(table).delete().eq("id", targetId);
    if (error) throw new Error(error.message);
    return {};
  }

  if (action === "create" && entity === "key") {
    return handleCreateKey(supabase, data);
  }

  const patch =
    entity === "provider"
      ? providerPatch(data, action)
      : entity === "key"
        ? buildAiKeyPatch(data, action)
        : modelPatch(data, action);

  if (Object.keys(patch).length === 0) throw new Error("没有可写入字段");

  let affectedCount = 0;

  if (action === "create") {
    const { error } = await supabase.from(table).insert(patch);
    if (error) throw new Error(error.message);
  } else {
    let renameModelId: string | null = null;
    let previousDisplayName: string | null = null;
    if (entity === "model" && patch.display_name !== undefined) {
      const { data: currentModel, error: currentModelError } = await supabase
        .from("ai_provider_key_models")
        .select("model_id, display_name")
        .eq("id", targetId)
        .single();
      if (currentModelError || !currentModel) throw new Error(currentModelError?.message || "模型不存在");
      renameModelId = (currentModel as { model_id: string }).model_id;
      previousDisplayName = (currentModel as { display_name?: string | null }).display_name ?? null;
    }

    const { error } = await supabase.from(table).update(patch).eq("id", targetId);
    if (error) throw new Error(error.message);

    if (renameModelId) {
      const { error: renameError } = await supabase
        .from("ai_provider_key_models")
        .update({ display_name: patch.display_name })
        .eq("model_id", renameModelId);
      if (renameError) {
        await supabase.from("ai_provider_key_models").update({ display_name: previousDisplayName }).eq("id", targetId);
        throw new Error(renameError.message);
      }
    }

    // 级联处理：若禁用密钥，自动将该密钥下所有模型联动为禁用
    if (entity === "key" && patch.is_enabled === false) {
      const { error: keyModelsError } = await supabase
        .from("ai_provider_key_models")
        .update({ is_enabled: false })
        .eq("key_id", targetId);
      if (keyModelsError) throw new Error(keyModelsError.message);

      // 查询受影响的业务功能数量
      const { data: affectedKeyModels } = await supabase
        .from("ai_provider_key_models")
        .select("id, model_id")
        .eq("key_id", targetId);

      const affectedIds = (affectedKeyModels ?? []).map((m: { id: string }) => m.id);
      const affectedModelIds = (affectedKeyModels ?? []).map((m: { model_id: string }) => m.model_id);

      if (affectedIds.length > 0) {
        const { data: affectedBindings } = await supabase
          .from("ai_feature_bindings")
          .select("id, feature_key, model_id, provider_key_model_id")
          .or(`provider_key_model_id.in.(${affectedIds.join(",")}),model_id.in.(${affectedModelIds.map(m => `"${m}"`).join(",")})`);
        affectedCount = affectedBindings?.length ?? 0;
      }
    }
  }

  return { affectedCount };
}

function requireManageableBusinessFeature(data: Record<string, unknown>) {
  const featureKey = toTrimmedString(data.feature_key);
  const feature = getAiFeatureCatalogEntry(featureKey);
  if (!feature || feature.group !== "business" || feature.routing !== "binding") {
    throw new Error("该功能不支持在业务总控中调整");
  }
  return feature;
}

function parseOcrChannelSetting(value: unknown): "baidu" | "vision" {
  return value === "vision" ? "vision" : "baidu";
}

async function saveFeatureControl(supabase: SupabaseClient, data: Record<string, unknown>) {
  const feature = requireManageableBusinessFeature(data);
  const patch: Record<string, unknown> = {
    feature_key: feature.key,
    label: feature.label,
    provider_key_model_id: toNullableString(data.provider_key_model_id),
    model_id: toNullableString(data.model_id),
    system_prompt: toNullableString(data.system_prompt),
    output_token_limit: toPriority(data.output_token_limit, 3600),
    context_message_limit: toPriority(data.context_message_limit, 30),
    is_enabled: data.is_enabled === undefined ? true : toBoolean(data.is_enabled),
    lifecycle_state: "active",
    archived_at: null,
    archived_reason: null,
  };
  if (feature.key === "ocr_screenshot") {
    patch.channel_settings = {
      ocr_screenshot_channel: parseOcrChannelSetting(data.ocr_screenshot_channel),
    };
  }
  const { error } = await supabase.from("ai_feature_bindings").upsert(patch, { onConflict: "feature_key" });
  if (error) throw new Error(error.message);
  return feature;
}

async function changeFeatureLifecycle(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  action: "archive" | "restore",
) {
  const feature = requireManageableBusinessFeature(data);
  await changeAiFeatureLifecycle(supabase as never, {
    featureKey: feature.key,
    label: feature.label,
    action,
  });
  return feature;
}

export async function GET() {
  const auth = await requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    return NextResponse.json(await loadAiConfig(auth.supabase));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 AI 配置失败" }, { status: 500 });
  }
}

async function handleTestKey(supabase: SupabaseClient, data: Record<string, unknown>) {
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

  let testModel = modelId;
  let targetModelRow: { id: string; model_id: string } | null = null;
  if (!testModel) {
    const { data: modelData } = await supabase
      .from("ai_provider_key_models")
      .select("id, model_id")
      .eq("key_id", keyId)
      .limit(1)
      .maybeSingle();
    targetModelRow = (modelData as { id?: string; model_id?: string } | null)?.id && (modelData as { model_id?: string }).model_id
      ? { id: (modelData as { id: string }).id, model_id: (modelData as { model_id: string }).model_id }
      : null;
    testModel = targetModelRow?.model_id || "gpt-3.5-turbo";
  } else {
    const { data: modelData } = await supabase
      .from("ai_provider_key_models")
      .select("id, model_id")
      .eq("key_id", keyId)
      .eq("model_id", testModel)
      .maybeSingle();
    targetModelRow = modelData
      ? { id: (modelData as { id: string }).id, model_id: (modelData as { model_id: string }).model_id }
      : null;
  }

  const result = await probeProviderModel(
    keyRow.api_key,
    provider.base_url,
    testModel,
    toTrimmedString(data.test_mode) === "vision" ? "vision" : "text",
  );
  if (result.ok) {
    await updateKeyHealthSuccess(supabase, keyId);
    return { ...result, errorScope: null };
  }

  if (result.errorScope === "key") {
    await updateKeyHealthFailure(supabase, keyId, result.message);
  } else if (targetModelRow) {
    await updateModelHealthFailure(supabase, targetModelRow.id, result.message, result.errorScope);
  }

  return result;
}

async function updateKeyHealthSuccess(supabase: SupabaseClient, keyId: string) {
  const { error } = await supabase.from("ai_provider_keys").update({
    consecutive_failures: 0,
    unhealthy_until: null,
    last_success_at: new Date().toISOString(),
    last_error_message: null,
  }).eq("id", keyId);
  if (error) throw new Error(error.message);
}

async function updateKeyHealthFailure(supabase: SupabaseClient, keyId: string, message: string) {
  const { error } = await supabase.from("ai_provider_keys").update({
    last_failure_at: new Date().toISOString(),
    last_error_message: message,
  }).eq("id", keyId);
  if (error) throw new Error(error.message);
}

async function updateModelHealthSuccess(supabase: SupabaseClient, modelRowId: string) {
  const { error } = await supabase.from("ai_provider_key_models").update({
    consecutive_failures: 0,
    unhealthy_until: null,
    last_success_at: new Date().toISOString(),
    last_error_message: null,
    last_failure_scope: null,
  }).eq("id", modelRowId);
  if (error) throw new Error(error.message);
}

async function updateModelHealthFailure(supabase: SupabaseClient, modelRowId: string, message: string, scope: ProviderFailureScope) {
  const { data: row } = await supabase.from("ai_provider_key_models").select("consecutive_failures").eq("id", modelRowId).maybeSingle();
  const failures = Number((row as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;
  const { error } = await supabase.from("ai_provider_key_models").update({
    consecutive_failures: failures,
    last_failure_at: new Date().toISOString(),
    last_error_message: message,
    last_failure_scope: scope === "model" ? "model" : "unknown",
  }).eq("id", modelRowId);
  if (error) throw new Error(error.message);
}

async function handleTestKeyModel(supabase: SupabaseClient, data: Record<string, unknown>) {
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

  const result = await loadKeyProvider(supabase, keyId);
  const probe = await probeProviderModel(result.key.api_key, result.provider.base_url, modelId);
  if (probe.ok) {
    await updateModelHealthSuccess(supabase, (modelData as { id: string }).id);
  } else if (probe.errorScope === "key") {
    await updateKeyHealthFailure(supabase, keyId, probe.message);
  } else {
    await updateModelHealthFailure(supabase, (modelData as { id: string }).id, probe.message, probe.errorScope);
  }
  return probe;
}

type MountedModelTestResult = {
  keyId: string;
  modelId: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
};

const MODEL_TEST_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
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

async function testMountedModel(
  supabase: SupabaseClient,
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

type ProbeResult =
  | { ok: true; latencyMs: number; status: number; message: string; errorScope: null }
  | { ok: false; latencyMs: number; status: number; message: string; errorScope: ProviderFailureScope };

async function loadKeyProvider(supabase: SupabaseClient, keyId: string) {
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

export function buildProbeRequestBody(modelId: string, mode: "text" | "vision" = "text") {
  return {
    model: modelId,
    messages: [{
      role: "user",
      content: mode === "vision"
        ? [
            { type: "text", text: "请识别这张图片并只返回 JSON：{\"ok\":true}" },
            { type: "image_url", image_url: { url: VISION_PROBE_IMAGE } },
          ]
        : "hi",
    }],
    max_tokens: 32,
    stream: false,
    ...(mode === "vision" ? { response_format: { type: "json_object" } } : {}),
  };
}

async function probeProviderModel(
  apiKey: string,
  baseUrl: string,
  modelId: string,
  mode: "text" | "vision" = "text",
): Promise<ProbeResult> {
  const startedAt = Date.now();
  const targetUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildProbeRequestBody(modelId, mode)),
      signal: AbortSignal.timeout(10_000),
    });
    const raw = response.ok ? "" : await response.text().catch(() => "");
    const message = response.ok
      ? "连通测试成功"
      : sanitizeProviderErrorMessage(`HTTP ${response.status}${raw ? `: ${raw}` : ""}`, [apiKey]);
    return {
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      status: response.status,
      message,
      errorScope: response.ok ? null : classifyProviderFailure({ status: response.status, message }),
    } as ProbeResult;
  } catch (error) {
    const message = sanitizeProviderErrorMessage(error instanceof Error ? error.message : "连接超时或失败", [apiKey]);
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      status: 0,
      message,
      errorScope: classifyProviderFailure({ errorType: isTimeout ? "timeout" : "network", message }),
    };
  }
}

export async function buildAiConfigResponse(
  request: NextRequest,
  deps: { requireSystemActor: typeof requireSystemActor } = { requireSystemActor }
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: AiConfigBody;
  try {
    body = (await request.json()) as AiConfigBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const action = parseAction(body.action);
  if (!action) {
    return NextResponse.json({ error: "action 不正确" }, { status: 400 });
  }

  if (action === "sync_key_models") {
    try {
      const result = await handleSyncKeyModels(auth.supabase, asRecord(body.data));
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ syncResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "同步模型列表失败" }, { status: 400 });
    }
  }

  if (action === "set_key_model_selection") {
    try {
      const result = await handleSetKeyModelSelection(auth.supabase, asRecord(body.data));
      aiClientInternal.resetCache();
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ syncResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "保存模型勾选失败" }, { status: 400 });
    }
  }

  if (action === "set_global_model_shelf_state") {
    try {
      const result = await handleSetGlobalModelShelfState(auth.supabase, asRecord(body.data));
      aiClientInternal.resetCache();
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ ...bundle, shelfResult: result, affectedCount: result.affectedCount });
    } catch (error) {
      const status = typeof (error as MutationError)?.status === "number" ? (error as MutationError).status : 400;
      return NextResponse.json({ error: error instanceof Error ? error.message : "更新模型上架状态失败" }, { status });
    }
  }

  if (action === "sync_all_keys") {
    try {
      return NextResponse.json(await handleSyncAllKeys(auth.supabase));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "全池同步模型列表失败" }, { status: 400 });
    }
  }

  if (action === "test_all_keys") {
    try {
      return NextResponse.json(await handleTestAllKeys(auth.supabase, handleTestKey));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "全池连通测试失败" }, { status: 400 });
    }
  }

  if (action === "test_key") {
    try {
      const result = await handleTestKey(auth.supabase, asRecord(body.data));
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ testResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "连通性测试失败" }, { status: 400 });
    }
  }

  if (action === "test_key_model") {
    try {
      const result = await handleTestKeyModel(auth.supabase, asRecord(body.data));
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ testResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型连通测试失败" }, { status: 400 });
    }
  }

  if (action === "test_key_all_models" || action === "test_all_keys_all_models") {
    try {
      const data = asRecord(body.data);
      const keyId = toTrimmedString(data.key_id);
      if (action === "test_key_all_models" && !keyId) throw new Error("缺少 key_id");
      const modelsQuery = auth.supabase.from("ai_provider_key_models").select("key_id, model_id");
      const { data: rows, error } = keyId ? await modelsQuery.eq("key_id", keyId) : await modelsQuery;
      if (error) throw new Error(error.message);
      const targets = (rows ?? []) as Array<{ key_id: string; model_id: string }>;
      const modelResults = await mapWithConcurrency(
        targets,
        MODEL_TEST_CONCURRENCY,
        (target) => testMountedModel(auth.supabase, target),
      );
      const successCount = modelResults.filter((result) => result.ok).length;
      const failureCount = modelResults.length - successCount;

      if (action === "test_key_all_models") {
        return NextResponse.json({
          keyId,
          results: modelResults.map(({ modelId, ok, latencyMs, error: modelError }) => ({
            modelId,
            ok,
            latencyMs,
            error: modelError,
          })),
          total: modelResults.length,
          successCount,
          failureCount,
          failedModelIds: modelResults.filter((result) => !result.ok).map((result) => result.modelId),
        });
      }

      const { data: keyRows, error: keyError } = await auth.supabase
        .from("ai_provider_keys")
        .select("id, label");
      if (keyError) throw new Error(keyError.message);
      const keyLabels = new Map(
        ((keyRows ?? []) as Array<{ id: string; label: string }>).map((key) => [key.id, key.label]),
      );
      return NextResponse.json({
        totalKeys: keyLabels.size,
        totalModels: modelResults.length,
        successCount,
        failureCount,
        failures: modelResults
          .filter((result) => !result.ok)
          .map((result) => ({
            keyId: result.keyId,
            keyLabel: keyLabels.get(result.keyId) ?? "未知渠道",
            modelId: result.modelId,
            error: result.error,
          })),
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型连通测试失败" }, { status: 400 });
    }
  }

  if (action === "swap_key_priority") {
    try {
      await swapKeyPriority(auth.supabase as never, asRecord(body.data));
      aiClientInternal.resetCache();
      return NextResponse.json(await loadAiConfig(auth.supabase));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "交换 Key 顺位失败" }, { status: 400 });
    }
  }

  if (action === "set_global_default_model") {
    try {
      const data = asRecord(body.data);
      const modelId = toNullableString(data.model_id);
      if (!modelId) throw new Error("请选择默认兜底模型");
      const { error } = await auth.supabase
        .from("ai_feature_bindings")
        .upsert(
          { feature_key: "default", label: "全局默认 AI 模型", model_id: modelId },
          { onConflict: "feature_key" }
        );
      if (error) throw new Error(error.message);
      aiClientInternal.resetCache();
      return NextResponse.json(await loadAiConfig(auth.supabase));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "设置全局默认模型失败" }, { status: 400 });
    }
  }

  if (action === "save_feature_control" || action === "archive_feature" || action === "restore_feature") {
    try {
      const data = asRecord(body.data);
      const feature = action === "save_feature_control"
        ? await saveFeatureControl(auth.supabase, data)
        : await changeFeatureLifecycle(auth.supabase, data, action === "archive_feature" ? "archive" : "restore");
      clearFeaturePromptCache(feature.key);
      aiClientInternal.resetCache();
      return NextResponse.json(await loadAiConfig(auth.supabase));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "保存业务功能失败" }, { status: 400 });
    }
  }

  const entity = parseEntity(body.entity);
  if (!entity) {
    return NextResponse.json({ error: "entity 不正确" }, { status: 400 });
  }

  try {
    const mutationResult = await applyMutation(auth.supabase, action, entity, asRecord(body.data));
    aiClientInternal.resetCache();
    const bundle = await loadAiConfig(auth.supabase);
    return NextResponse.json({
      ...bundle,
      affectedCount: mutationResult.affectedCount,
      ...(mutationResult.cascade ? { cascade: mutationResult.cascade } : {}),
    });
  } catch (error) {
    const status =
      typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存 AI 配置失败" },
      { status }
    );
  }
}

export const defaultAiConfigDeps: { requireSystemActor: typeof requireSystemActor } = { requireSystemActor };

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/ai-config", request, async (observation) => {
    observation.mark("validate");
    return appendObservedMutationResult(await buildAiConfigResponse(request, defaultAiConfigDeps), observation);
  });
}

import { loadAiConfig } from "@/lib/ai-config/config-loader";
import { handleTestKey, handleTestKeyModel, handleCheckAllInUse, MODEL_TEST_CONCURRENCY, mapWithConcurrency, testMountedModel, createKeyFailureClaim, loadKeyProvider, probeProviderModel } from "@/lib/ai-config/model-tests";
export { buildProbeRequestBody } from "@/lib/ai-config/model-tests";
import { testOcrScreenshotFeature } from "@/lib/ai-config/ocr-feature-test";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { __internal as aiClientInternal, probeAiFeature } from "@/lib/ai/client";
import { getAiFeatureCatalogEntry } from "@/lib/ai/feature-catalog";
import { isModelAllowedForFeature, normalizeProtocolBaseUrl, normalizeProviderProtocol, parseProviderProtocol, type AiProviderProtocol } from "@/lib/ai/provider-protocols";
import { changeAiFeatureLifecycle } from "@/lib/ai-config/feature-lifecycle";
import { runAiConfigWrite } from "@/lib/ai-config/atomic-write";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { clearFeaturePromptCache } from "@/lib/ai/load-feature-prompt";
import { handleCreateKey, handleSetKeyModelSelection, handleSetModelEnabled, handleSyncKeyModels, handleSyncAllKeys } from "@/lib/ai-config/batch-actions";
import { discoverModelIds } from "@/lib/ai-config/sync-models";
import { findModelChannelCandidates, groupModelIdAliases, type ModelChannelDiscoveryInput } from "@/lib/ai/model-discovery";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { normalizeChannelAddress, requireSharedAddressConfirmation, type SharedAddressImpact } from "@/lib/ai-config/channel-address";
import { buildDependencyPreview, requireDependencyConfirmation } from "@/lib/ai-config/key-dependencies";
import { requireSystemActor, toBoolean, toNullableString, toTrimmedString } from "@/lib/admin/ai-channels";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { auditRollbackMessage } from "@/lib/audit-log";
import { toStringErrorResponse } from "@/lib/errors";
import { readCanonicalModelId, toCanonicalModelId } from "@/lib/ai-config/canonical-model";
import { probeClairicOcr } from "@/lib/clairic-ocr";
import { toSafeAiConfigErrorResponse } from "./_error-response";

type AiConfigEntity = "provider" | "key" | "model" | "feature_binding";
type AiConfigAction =
  | "create" | "update" | "delete" | "test_key" | "test_key_model" | "test_key_all_models"
  | "test_all_keys_all_models" | "check_all_in_use" | "swap_model_channel_order"
  | "save_feature_control" | "archive_feature" | "restore_feature" | "set_global_default_model"
  | "set_model_enabled" | "sync_key_models" | "set_key_model_selection"
  | "set_global_model_shelf_state" | "remove_key_model" | "sync_all_keys" | "test_all_keys"
  | "probe_provider_models" | "find_model_channels" | "enable_model_channel";

type AiConfigBody = { action?: unknown; entity?: unknown; data?: unknown };
type SupabaseClient = Awaited<ReturnType<typeof requireSystemActor>> extends infer T ? T extends { supabase: infer S } ? S : never : never;
const firstOrNull = <T>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const ALLOWED_ACTIONS = new Set<string>([
  "create", "update", "delete", "test_key", "test_key_model", "test_key_all_models", "test_all_keys_all_models",
  "check_all_in_use", "swap_model_channel_order", "save_feature_control", "archive_feature", "restore_feature",
  "set_global_default_model", "set_model_enabled", "sync_key_models", "set_key_model_selection",
  "set_global_model_shelf_state", "remove_key_model", "sync_all_keys", "test_all_keys",
  "probe_provider_models", "find_model_channels", "enable_model_channel",
]);
function parseAction(value: unknown): AiConfigAction | null {
  const action = toTrimmedString(value);
  return ALLOWED_ACTIONS.has(action) ? (action as AiConfigAction) : null;
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
  if (!id) throw mutationError("缺少 id");
  return id;
}

function providerPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.name !== undefined) patch.name = toTrimmedString(data.name);
  let explicitProtocol: AiProviderProtocol | undefined;
  if (data.protocol !== undefined && toTrimmedString(data.protocol) !== "") {
    const parsed = parseProviderProtocol(data.protocol);
    if (!parsed) throw mutationError("不支持的接入协议", 400);
    explicitProtocol = parsed;
  }
  if (mode === "create") {
    const protocol = explicitProtocol ?? "openai_compatible";
    patch.protocol = protocol;
    if (data.base_url !== undefined) patch.base_url = normalizeProtocolBaseUrl(protocol, data.base_url);
  } else if (data.base_url !== undefined) {
    patch.base_url = normalizeChannelAddress(data.base_url);
  }
  if (data.description !== undefined) patch.description = toNullableString(data.description);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.name || !patch.base_url)) throw mutationError("供应商缺少 name/base_url");
  return patch;
}

function modelPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.key_id !== undefined) patch.key_id = toTrimmedString(data.key_id);
  if (mode === "create") patch.model_id = toTrimmedString(data.model_id);
  else if (data.model_id !== undefined) throw mutationError("模型 ID 不可修改");
  if (data.display_name !== undefined) patch.display_name = toNullableString(data.display_name);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.key_id || !patch.model_id)) throw mutationError("模型缺少 key_id/model_id");
  return patch;
}

async function requireSelectableModel(supabase: SupabaseClient, modelId: string, currentModelId: string | null) {
  const canonicalModelId = toCanonicalModelId(modelId);
  if (canonicalModelId === (currentModelId ? toCanonicalModelId(currentModelId) : null)) return;
  const { availability } = await loadAiConfig(supabase);
  const family = availability.modelFamilies.find((item) => item.modelId === canonicalModelId);
  if (!family?.isSelectable) throw mutationError(`模型【${canonicalModelId}】当前没有可用渠道，不能新选`, 409);
}

type MutationResult = { affectedCount?: number; cascade?: { keyCount: number; modelCount: number }; sharedAddressImpact?: SharedAddressImpact };
type MutationError = Error & {
  status?: number; isPublic?: boolean; requiresConfirmation?: boolean; sharedAddressImpact?: SharedAddressImpact; unknownReasons?: string[];
  affectedBusinesses?: Array<{ key: string; label: string; selectedModelId: string | null; preferredModelId: string | null; defaultModelId: string | null }>;
};

function mutationError(message: string, status = 400): MutationError {
  return Object.assign(new Error(message), { status, isPublic: true });
}

export function boundedInteger(value: unknown, fieldLabel: string, min: number, max: number, fallback: number) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw mutationError(`${fieldLabel}必须是 ${min}-${max} 的整数`);
  return parsed;
}

async function handleRemoveKeyModel(supabase: SupabaseClient, data: Record<string, unknown>, actorId: string) {
  const keyModelId = toTrimmedString(data.key_model_id ?? data.id);
  const keyId = toTrimmedString(data.key_id);
  const modelId = toTrimmedString(data.model_id);
  if (!keyModelId && (!keyId || !modelId)) throw mutationError("缺少 key_model_id 或 key_id/model_id");

  const query = supabase.from("ai_provider_key_models").select("id, key_id, model_id, canonical_model_id, display_name, is_enabled, key:ai_provider_keys(label, provider_id, provider:ai_providers(name))");
  const { data: row, error: rowError } = keyModelId
    ? await query.eq("id", keyModelId).maybeSingle()
    : await query.eq("key_id", keyId).eq("canonical_model_id", toCanonicalModelId(modelId)).maybeSingle();
  if (rowError) throw new Error(rowError.message);
  if (!row) throw mutationError("渠道未挂载此模型", 404);

  const target = row as {
    id: string; key_id: string; model_id: string; canonical_model_id?: string | null; display_name?: string | null; is_enabled: boolean;
    key?: { label?: string | null; provider_id?: string | null; provider?: { name?: string | null } | Array<{ name?: string | null }> | null } | Array<{ label?: string | null; provider_id?: string | null; provider?: { name?: string | null } | Array<{ name?: string | null }> | null }> | null;
  };
  const preview = await buildDependencyPreview(supabase, { scope: "supply", id: target.id });
  requireDependencyConfirmation(preview, data.confirm_impact === true, "删除渠道模型供应");
  const bundle = await loadAiConfig(supabase);
  const targetCanonicalModelId = readCanonicalModelId(target.model_id, target.canonical_model_id);
  const remaining = bundle.availability.modelFamilies.find((f) => f.modelId === targetCanonicalModelId)?.channels
    .filter((c) => c.keyModelId !== target.id && c.isSchedulable) ?? [];

  const key = firstOrNull(target.key);
  const provider = firstOrNull(key?.provider);
  try {
    await runAiConfigWrite(supabase, "remove_ai_config_supply_with_audit", {
      p_supply_id: target.id, p_actor_id: actorId,
      p_audit_detail: JSON.stringify({ source: "admin_ai_config", keyId: target.key_id, keyName: key?.label ?? null, providerName: provider?.name ?? null, modelId: target.model_id, displayName: target.display_name ?? null, removedAt: new Date().toISOString() }),
    });
  } catch (error) {
    if ((error as MutationError).status === 409) throw error;
    throw mutationError(auditRollbackMessage("收走模型"), 500);
  }
  return { ok: true, removed: { keyModelId: target.id, keyId: target.key_id, modelId: targetCanonicalModelId }, remainingAvailableLineCount: remaining.length, auditStatus: "succeeded" };
}

async function applyMutation(
  supabase: SupabaseClient,
  action: Extract<AiConfigAction, "create" | "update" | "delete">,
  entity: AiConfigEntity,
  data: Record<string, unknown>,
  actorId?: string,
  fetcher?: typeof fetch,
): Promise<MutationResult> {
  if (entity === "feature_binding") throw mutationError("业务功能由 AI 总控统一管理，不能直接修改内部绑定");
  const table = { provider: "ai_providers", key: "ai_provider_keys", model: "ai_provider_key_models", feature_binding: "ai_feature_bindings" }[entity];
  const targetId = action === "delete" || action === "update" ? requireId(data) : "";

  if (action === "delete" && entity === "model") {
    if (!actorId) throw mutationError("缺少审计操作人");
    return handleRemoveKeyModel(supabase, { ...data, id: targetId }, actorId) as unknown as MutationResult;
  }
  if (action === "delete") {
    if (entity === "provider") {
      const preview = await buildDependencyPreview(supabase, { scope: "provider", id: targetId });
      requireDependencyConfirmation(preview, data.confirm_impact === true, "删除接入点");
      const { error } = await supabase.from("ai_providers").delete().eq("id", targetId);
      if (error) throw new Error(error.message);
      return { cascade: { keyCount: preview.channels.length, modelCount: preview.channels.reduce((c, ch) => c + ch.models.length, 0) } };
    }
    if (entity === "key") {
      const preview = await buildDependencyPreview(supabase, { scope: "key", id: targetId });
      requireDependencyConfirmation(preview, data.confirm_impact === true, "删除渠道");
    }
    const { error } = await supabase.from(table).delete().eq("id", targetId);
    if (error) throw new Error(error.message);
    return {};
  }
  if (action === "create" && entity === "key") return handleCreateKey(supabase, data, fetcher);

  const patch = entity === "provider" ? providerPatch(data, action) : entity === "key" ? buildAiKeyPatch(data, action) : modelPatch(data, action);
  if (Object.keys(patch).length === 0 && !(entity === "key" && data.base_url !== undefined)) {
    throw mutationError("没有可写入字段");
  }

  let sharedAddressImpact: SharedAddressImpact | undefined;
  let normalizedKeyBaseUrl: string | null = null;
  if (action === "create") {
    const { error } = await supabase.from(table).insert(patch);
    if (error) throw new Error(error.message);
  } else {
    if (entity === "provider" && patch.base_url !== undefined) {
      const { data: providerRow, error: providerError } = await supabase.from("ai_providers").select("protocol").eq("id", targetId).maybeSingle();
      if (providerError) throw new Error(providerError.message);
      patch.base_url = normalizeProtocolBaseUrl(normalizeProviderProtocol((providerRow as { protocol?: unknown } | null)?.protocol), data.base_url);
      sharedAddressImpact = await requireSharedAddressConfirmation(supabase, targetId, String(patch.base_url), data.confirm_shared_address === true);
    }
    if (entity === "key" && (data.provider_id !== undefined || data.base_url !== undefined)) {
      const { data: currentKey, error: keyError } = await supabase.from("ai_provider_keys").select("provider_id").eq("id", targetId).single();
      if (keyError) throw new Error(keyError.message);
      if (!currentKey) throw mutationError("渠道不存在", 404);
      if (data.provider_id !== undefined && toTrimmedString(data.provider_id) !== currentKey.provider_id) throw mutationError("渠道不能改换所属地址组，请新接入渠道");
      if (data.base_url !== undefined) {
        const { data: providerRow } = await supabase.from("ai_providers").select("protocol").eq("id", currentKey.provider_id).maybeSingle();
        normalizedKeyBaseUrl = normalizeProtocolBaseUrl(normalizeProviderProtocol((providerRow as { protocol?: unknown } | null)?.protocol), data.base_url);
        sharedAddressImpact = await requireSharedAddressConfirmation(supabase, currentKey.provider_id, normalizedKeyBaseUrl, data.confirm_shared_address === true);
      }
    }
    if (entity === "provider" && patch.is_enabled === false) {
      requireDependencyConfirmation(await buildDependencyPreview(supabase, { scope: "provider", id: targetId }), data.confirm_impact === true, "停用接入点");
    }
    if (entity === "key" && patch.is_enabled === false) {
      requireDependencyConfirmation(await buildDependencyPreview(supabase, { scope: "key", id: targetId }), data.confirm_impact === true, "停用渠道");
    }
    if (entity === "model" && patch.is_enabled === false) {
      requireDependencyConfirmation(await buildDependencyPreview(supabase, { scope: "supply", id: targetId }), data.confirm_impact === true, "关闭模型供应");
    }
    if (entity === "model") return await runAiConfigWrite(supabase, "update_ai_config_model", { p_supply_id: targetId, p_patch: patch });
    if (entity === "key") {
      await runAiConfigWrite(supabase, "update_ai_config_key", { p_key_id: targetId, p_patch: patch, p_base_url: normalizedKeyBaseUrl });
    } else {
      const { error } = await supabase.from(table).update(patch).eq("id", targetId);
      if (error) throw new Error(error.message);
    }
  }
  return { affectedCount: 0, sharedAddressImpact };
}

function requireManageableBusinessFeature(data: Record<string, unknown>) {
  const feature = getAiFeatureCatalogEntry(toTrimmedString(data.feature_key));
  if (!feature || feature.group !== "business" || feature.routing !== "binding") throw mutationError("该功能不支持在业务总控中调整");
  return feature;
}

async function saveFeatureControl(supabase: SupabaseClient, data: Record<string, unknown>) {
  const feature = requireManageableBusinessFeature(data);
  const patch: Record<string, unknown> = {
    feature_key: feature.key, label: feature.label, system_prompt: toNullableString(data.system_prompt),
    output_token_limit: boundedInteger(data.output_token_limit, "最大输出 Token", 1200, 8000, 3600),
    context_message_limit: boundedInteger(data.context_message_limit, "上下文轮数", 1, 50, 30),
    is_enabled: data.is_enabled === undefined ? true : toBoolean(data.is_enabled),
    lifecycle_state: "active", archived_at: null, archived_reason: null,
  };
  if (data.model_id !== undefined) {
    const nextModelId = toNullableString(data.model_id);
    if (nextModelId) {
      const capability = isModelAllowedForFeature(feature.key, nextModelId);
      if (!capability.allowed) throw mutationError(capability.reason, 400);
      const { data: current, error } = await supabase.from("ai_feature_bindings").select("model_id").eq("feature_key", feature.key).maybeSingle();
      if (error) throw new Error(error.message);
      await requireSelectableModel(supabase, nextModelId, toNullableString(current?.model_id));
    }
    patch.model_id = nextModelId ? toCanonicalModelId(nextModelId) : null;
  }
  const { error } = await supabase.from("ai_feature_bindings").upsert(patch, { onConflict: "feature_key" });
  if (error) throw new Error(error.message);
  return feature;
}

async function changeFeatureLifecycle(supabase: SupabaseClient, data: Record<string, unknown>, action: "archive" | "restore") {
  const feature = requireManageableBusinessFeature(data);
  await changeAiFeatureLifecycle(supabase as never, { featureKey: feature.key, label: feature.label, action });
  return feature;
}

export async function buildAiConfigGetResponse(
  request?: Request,
  deps: { requireSystemActor: typeof requireSystemActor } = { requireSystemActor },
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(await loadAiConfig(auth.supabase));
  } catch (error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/ai-config",
      operation: "load-ai-config",
      request,
      error,
      status: 500,
      message: "读取 AI 配置失败",
    });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireSystemActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return buildAiConfigGetResponse(request, { requireSystemActor: async () => auth });
}

export async function buildAiConfigResponse(
  request: NextRequest,
  deps: { requireSystemActor: typeof requireSystemActor; probeAiFeature?: typeof probeAiFeature; probeClairicOcr?: typeof probeClairicOcr; createAdminClient?: typeof createAdminClient; fetcher?: typeof fetch } = { requireSystemActor },
  requestId?: string | null,
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const fail = (error: unknown, fallbackMessage: string, operation: string, defaultStatus = 500) =>
    toSafeAiConfigErrorResponse({
      error,
      fallbackMessage,
      route: "/api/admin/ai-config",
      operation,
      request,
      requestId,
      defaultStatus,
    });

  let body: AiConfigBody;
  try { body = (await request.json()) as AiConfigBody; } catch { return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 }); }
  const action = parseAction(body.action);
  if (!action) return NextResponse.json({ error: "action 不正确" }, { status: 400 });

  if (action === "probe_provider_models") {
    const data = asRecord(body.data);
    const providerId = toTrimmedString(data.provider_id);
    const apiKey = toTrimmedString(data.api_key);
    if ((!providerId && !toTrimmedString(data.base_url)) || !apiKey) {
      return NextResponse.json({ error: "缺少渠道地址或 api_key" }, { status: 400 });
    }
    const rawProtocol = toTrimmedString(data.protocol);
    if (rawProtocol && !parseProviderProtocol(rawProtocol)) return NextResponse.json({ error: "不支持的接入协议" }, { status: 400 });
    const requestedProtocol: AiProviderProtocol = rawProtocol ? normalizeProviderProtocol(rawProtocol) : "openai_compatible";
    let effectiveProtocol: AiProviderProtocol = requestedProtocol;
    try {
      const { data: provider, error } = providerId
        ? await auth.supabase.from("ai_providers").select("id, name, base_url, protocol, is_enabled").eq("id", providerId).maybeSingle()
        : { data: { base_url: normalizeProtocolBaseUrl(requestedProtocol, data.base_url), protocol: requestedProtocol, is_enabled: true }, error: null };
      if (error) throw new Error(error.message);
      if (!provider) throw mutationError("接入点不存在", 404);
      if (!(provider as { is_enabled?: boolean }).is_enabled) throw mutationError("接入点已停用", 409);
      effectiveProtocol = normalizeProviderProtocol((provider as { protocol?: unknown }).protocol);
      const upstreamModelIds = await discoverModelIds(provider as { name?: string; base_url?: string; protocol?: string | null }, apiKey, deps.fetcher);
      const modelIds = [...new Set(upstreamModelIds.map(toCanonicalModelId))];
      return NextResponse.json({ modelIds, upstreamModelIds, modelGroups: groupModelIdAliases(upstreamModelIds) });
    } catch (error) {
      const fallback = effectiveProtocol === "cloudflare_clairic"
        ? "探测 Cloudflare Clairic 失败，请检查接口地址与 API Token"
        : "服务端探测模型列表失败，请检查接入点和 API Key";
      return fail(error, fallback, "probe-provider-models", 502);
    }
  }

  if (action === "find_model_channels" || action === "enable_model_channel") {
    try {
      const data = asRecord(body.data);
      const modelId = toTrimmedString(data.model_id);
      if (!modelId) throw mutationError("缺少 model_id");
      const canonicalModelId = toCanonicalModelId(modelId);
      const bundle = await loadAiConfig(auth.supabase);
      const candidates = findModelChannelCandidates(bundle as unknown as ModelChannelDiscoveryInput, canonicalModelId);
      if (action === "find_model_channels") return NextResponse.json({ modelId: canonicalModelId, candidates });
      const candidate = candidates.find((item) => item.keyId === toTrimmedString(data.key_id));
      if (!candidate) throw mutationError("该供应已经打开，或上游缓存未发现这个模型，请先同步");
      if (!candidate.keyEnabled || !candidate.providerEnabled) throw mutationError("请先打开渠道及其地址组，再开启模型供应");
      const target = await loadKeyProvider(auth.supabase, candidate.keyId);
      const testResult = await probeProviderModel(target.key.api_key, target.provider.base_url, candidate.upstreamModelId, "text", target.provider.protocol);
      if (!testResult.ok) return NextResponse.json({ error: "该渠道的模型测试未通过，供应仍关闭", testResult }, { status: 422 });
      const supplyId = await runAiConfigWrite((deps.createAdminClient ?? createAdminClient)(), "enable_ai_config_supply", {
        p_key_id: candidate.keyId, p_model_id: candidate.upstreamModelId, p_display_name: getModelDisplayName(canonicalModelId),
      });
      aiClientInternal.resetCache();
      return NextResponse.json({ ...await loadAiConfig(auth.supabase), enableResult: { keyId: candidate.keyId, modelId: canonicalModelId, supplyId, testResult } });
    } catch (error) {
      return fail(error, "模型供应操作失败", action);
    }
  }

  if (action === "sync_key_models") {
    try {
      const result = await handleSyncKeyModels((deps.createAdminClient ?? createAdminClient)(), asRecord(body.data));
      const bundle = await loadAiConfig(auth.supabase);
      const removedModelIds = new Set(result.removedModelIds);
      const lostBusinesses = bundle.availability.businessAssurances
        .filter((a) => a.routingStatus === "outage" && [a.selectedModelId, a.defaultModelId].some((id) => Boolean(id && removedModelIds.has(id))))
        .map((a) => ({ key: a.key, label: a.label, modelId: a.selectedModelId ?? a.defaultModelId }));
      return NextResponse.json({ syncResult: { ...result, lostBusinesses }, ...bundle });
    } catch (error) {
      return fail(error, "同步模型列表失败", "sync-key-models");
    }
  }

  if (action === "set_key_model_selection") {
    try {
      const result = await handleSetKeyModelSelection((deps.createAdminClient ?? createAdminClient)(), asRecord(body.data));
      aiClientInternal.resetCache();
      return NextResponse.json({ syncResult: result, ...await loadAiConfig(auth.supabase) });
    } catch (error) {
      return fail(error, "保存模型勾选失败", "set-key-model-selection");
    }
  }

  if (action === "set_model_enabled" || action === "set_global_model_shelf_state") {
    try {
      const result = await handleSetModelEnabled(auth.supabase, asRecord(body.data));
      aiClientInternal.resetCache();
      return NextResponse.json({ ...await loadAiConfig(auth.supabase), shelfResult: result, affectedCount: result.affectedCount });
    } catch (error) {
      return fail(error, "更新模型开关失败", "set-model-enabled");
    }
  }

  if (action === "remove_key_model") {
    try {
      const result = await handleRemoveKeyModel((deps.createAdminClient ?? createAdminClient)(), asRecord(body.data), auth.actor.userId);
      aiClientInternal.resetCache();
      return NextResponse.json({ ...await loadAiConfig(auth.supabase), removalResult: result });
    } catch (error) {
      return fail(error, "收走模型失败", "remove-key-model");
    }
  }

  if (action === "sync_all_keys") {
    try {
      return NextResponse.json(await handleSyncAllKeys((deps.createAdminClient ?? createAdminClient)()));
    } catch (error) {
      return fail(error, "全池同步模型列表失败", "sync-all-keys");
    }
  }

  if (action === "check_all_in_use" || action === "test_all_keys" || action === "test_all_keys_all_models") {
    try {
      return NextResponse.json(await handleCheckAllInUse(auth.supabase, { healthClient: (deps.createAdminClient ?? createAdminClient)() }));
    } catch (error) {
      return fail(error, "使用中模型检查失败", "check-all-in-use");
    }
  }

  if (action === "test_key") {
    try {
      const data = asRecord(body.data);
      if (data.feature_key === "ocr_screenshot") {
        const { bundle, testResult } = await testOcrScreenshotFeature(auth.supabase, deps);
        return NextResponse.json({ ...bundle, testResult });
      }
      const result = await handleTestKey(auth.supabase, data, { healthClient: (deps.createAdminClient ?? createAdminClient)() });
      return NextResponse.json({ testResult: result, ...await loadAiConfig(auth.supabase) });
    } catch (error) {
      return fail(error, "连通性测试失败", "test-key");
    }
  }

  if (action === "test_key_model") {
    try {
      const result = await handleTestKeyModel(auth.supabase, asRecord(body.data), { recordFailure: true, healthClient: (deps.createAdminClient ?? createAdminClient)() });
      return NextResponse.json({ testResult: result, ...await loadAiConfig(auth.supabase) });
    } catch (error) {
      return fail(error, "模型连通测试失败", "test-key-model");
    }
  }

  if (action === "test_key_all_models") {
    try {
      const data = asRecord(body.data);
      const keyId = toTrimmedString(data.key_id);
      if (!keyId) throw mutationError("缺少 key_id");
      const { data: rows, error } = await auth.supabase.from("ai_provider_key_models").select("key_id, model_id, is_enabled").eq("key_id", keyId);
      if (error) throw new Error(error.message);
      const { data: keyStateRows, error: keyStateError } = await auth.supabase.from("ai_provider_keys").select("id, is_enabled");
      if (keyStateError) throw new Error(keyStateError.message);
      const enabledKeyIds = new Set(((keyStateRows ?? []) as Array<{ id: string; is_enabled: boolean }>).filter((r) => r.is_enabled).map((r) => r.id));
      const targets = ((rows ?? []) as Array<{ key_id: string; model_id: string; is_enabled?: boolean }>)
        .filter((r) => (enabledKeyIds.size === 0 || enabledKeyIds.has(r.key_id)) && r.is_enabled === true)
        .map(({ key_id, model_id }) => ({ key_id, model_id }));
      const healthClient = (deps.createAdminClient ?? createAdminClient)();
      const keyFailureClaim = createKeyFailureClaim();
      const modelResults = await mapWithConcurrency(targets, MODEL_TEST_CONCURRENCY, (t) => testMountedModel(auth.supabase, t, { healthClient, keyFailureClaim }));
      const stateWriteErrors = modelResults.map((r) => r.stateWriteError).filter((v): v is string => Boolean(v));
      const successCount = modelResults.filter((r) => r.ok).length;
      const failureCount = modelResults.length - successCount;
      return NextResponse.json({
        ...await loadAiConfig(auth.supabase), keyId,
        results: modelResults.map(({ modelId, ok, latencyMs, error: modelError, failureDiagnostic, stateWriteError }) => ({
          modelId, ok, latencyMs, error: modelError, failureDiagnostic, stateWriteError: stateWriteError ?? null,
        })),
        total: modelResults.length, successCount, failureCount,
        stateWriteError: stateWriteErrors.length > 0 ? stateWriteErrors.join("；") : null,
        emptyResult: modelResults.length === 0, allPassed: modelResults.length > 0 && failureCount === 0,
        failedModelIds: modelResults.filter((r) => !r.ok).map((r) => r.modelId),
      });
    } catch (error) {
      return fail(error, "模型连通测试失败", "test-key-all-models");
    }
  }

  if (action === "swap_model_channel_order") {
    try {
      const data = asRecord(body.data);
      const modelId = toTrimmedString(data.model_id);
      const id = toTrimmedString(data.key_model_id);
      const targetId = toTrimmedString(data.target_key_model_id);
      if (!modelId || !id || !targetId || id === targetId) throw mutationError("顺位交换参数不合法");
      const canonicalModelId = toCanonicalModelId(modelId);
      const preloaded = await loadAiConfig(auth.supabase);
      const family = preloaded.availability.modelFamilies.find((f) => f.modelId === canonicalModelId);
      const current = family?.channels.find((c) => c.keyModelId === id);
      const target = family?.channels.find((c) => c.keyModelId === targetId);
      if (!family || !current || !target || !current.isSchedulable || !target.isSchedulable) {
        throw mutationError("渠道不存在、不属于同一模型或当前不可调度，请刷新后重试", 409);
      }
      const low = Math.min(current.sortOrder, target.sortOrder);
      const high = Math.max(current.sortOrder, target.sortOrder);
      if (family.channels.some((c) => c.isSchedulable && c.sortOrder > low && c.sortOrder < high)) {
        throw mutationError("两条渠道之间还有可用渠道，请刷新后重试", 409);
      }
      const { error } = await (deps.createAdminClient ?? createAdminClient)().rpc("swap_provider_key_model_order", {
        p_model_id: canonicalModelId, p_key_model_id: id, p_target_key_model_id: targetId,
      });
      if (error) throw new Error(error.message);
      aiClientInternal.resetCache();
      return NextResponse.json(await loadAiConfig(auth.supabase));
    } catch (error) {
      return fail(error, "渠道顺位调整失败，请刷新后重试", "swap-model-channel-order", 409);
    }
  }

  if (action === "set_global_default_model") {
    try {
      const data = asRecord(body.data);
      const modelId = toNullableString(data.model_id);
      if (!modelId) throw mutationError("还没有选择默认兜底模型");
      const canonicalModelId = toCanonicalModelId(modelId);
      const capability = isModelAllowedForFeature("default", canonicalModelId);
      if (!capability.allowed) throw mutationError(capability.reason, 400);
      const { data: current, error: currentError } = await auth.supabase.from("ai_feature_bindings").select("model_id").eq("feature_key", "default").maybeSingle();
      if (currentError) throw new Error(currentError.message);
      await requireSelectableModel(auth.supabase, canonicalModelId, toNullableString(current?.model_id));
      const { error } = await auth.supabase.from("ai_feature_bindings").upsert({ feature_key: "default", label: "全局默认 AI 模型", model_id: canonicalModelId }, { onConflict: "feature_key" });
      if (error) throw new Error(error.message);
      aiClientInternal.resetCache();
      return NextResponse.json(await loadAiConfig(auth.supabase));
    } catch (error) {
      return fail(error, "设置全局默认模型失败", "set-global-default-model");
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
      return fail(error, "保存业务功能失败", action);
    }
  }

  const entity = parseEntity(body.entity);
  if (!entity) return NextResponse.json({ error: "entity 不正确" }, { status: 400 });

  try {
    const mutationResult = await applyMutation((deps.createAdminClient ?? createAdminClient)(), action, entity, asRecord(body.data), auth.actor.userId, deps.fetcher);
    aiClientInternal.resetCache();
    const bundle = await loadAiConfig(auth.supabase);
    return NextResponse.json({
      ...bundle, affectedCount: mutationResult.affectedCount,
      ...(mutationResult.cascade ? { cascade: mutationResult.cascade } : {}),
      ...(mutationResult.sharedAddressImpact ? { sharedAddressImpact: mutationResult.sharedAddressImpact } : {}),
    });
  } catch (error) {
    return fail(error, "保存 AI 配置失败", `${action}-${entity}`);
  }
}

export const defaultAiConfigDeps: { requireSystemActor: typeof requireSystemActor } = { requireSystemActor };

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/ai-config", request, async (observation) => {
    observation.mark("validate");
    return appendObservedMutationResult(
      await buildAiConfigResponse(request, defaultAiConfigDeps, observation.requestId),
      observation,
    );
  });
}

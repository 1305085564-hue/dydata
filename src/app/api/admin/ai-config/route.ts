import {markProviderKeySuccess,markProviderKeyModelSuccess} from "@/lib/ai/provider-routing";
import { loadAiConfig } from "@/lib/ai-config/config-loader";
import { clearLegacyManualSleep,handleTestKey,handleTestKeyModel,handleCheckAllInUse,buildProbeRequestBody,isValidVisionProbeContent,MODEL_PROBE_TIMEOUT_MS,MODEL_TEST_CONCURRENCY,mapWithConcurrency,testMountedModel,createKeyFailureClaim,loadKeyProvider,probeProviderModel } from "@/lib/ai-config/model-tests";
export {buildProbeRequestBody} from "@/lib/ai-config/model-tests";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { __internal as aiClientInternal, probeAiFeature } from "@/lib/ai/client";
import { getAiFeatureCatalogEntry } from "@/lib/ai/feature-catalog";
import { changeAiFeatureLifecycle } from "@/lib/ai-config/feature-lifecycle";
import { runAiConfigWrite } from "@/lib/ai-config/atomic-write";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { describeChannelFailure } from "@/lib/ai-config/failure-diagnostic";
import { clearFeaturePromptCache } from "@/lib/ai/load-feature-prompt";
import {
  handleCreateKey,
  handleSetKeyModelSelection,
  handleSyncKeyModels,
  handleSyncAllKeys,
} from "@/lib/ai-config/batch-actions";
import { discoverModelIds } from "./sync-models/route";
import { findModelChannelCandidates, groupModelIdAliases, type ModelChannelDiscoveryInput } from "@/lib/ai/model-discovery";
import { getModelDisplayName } from "@/lib/ai/model-families";
import { normalizeChannelAddress, requireSharedAddressConfirmation, type SharedAddressImpact } from "@/lib/ai-config/channel-address";
import {
  buildDependencyPreview,
  requireDependencyConfirmation,
} from "@/lib/ai-config/key-dependencies";
import {
  requireSystemActor,
  toBoolean,
  toNullableString,
  toTrimmedString,
} from "../ai-channels/_shared";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { auditRollbackMessage } from "@/lib/audit-log";

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
  | "check_all_in_use"
  | "swap_model_channel_order"
  | "save_feature_control"
  | "archive_feature"
  | "restore_feature"
  | "set_global_default_model"
  | "set_model_enabled"
  | "sync_key_models"
  | "set_key_model_selection"
  | "set_global_model_shelf_state"
  | "remove_key_model"
  | "sync_all_keys"
  | "test_all_keys"
  | "probe_provider_models"
  | "find_model_channels"
  | "enable_model_channel";

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

function parseAction(value: unknown): AiConfigAction | null {
  const action = toTrimmedString(value);
  return action === "create" || action === "update" || action === "delete" || action === "test_key" || action === "test_key_model" || action === "test_key_all_models" || action === "test_all_keys_all_models" || action === "check_all_in_use" || action === "swap_model_channel_order" || action === "save_feature_control" || action === "archive_feature" || action === "restore_feature" || action === "set_global_default_model" || action === "set_model_enabled" || action === "sync_key_models" || action === "set_key_model_selection" || action === "set_global_model_shelf_state" || action === "remove_key_model" || action === "sync_all_keys" || action === "test_all_keys" || action === "probe_provider_models" || action === "find_model_channels" || action === "enable_model_channel" ? action : null;
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
  if (mode === "create" || data.base_url !== undefined) patch.base_url = normalizeChannelAddress(data.base_url);
  if (data.description !== undefined) patch.description = toNullableString(data.description);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.name || !patch.base_url)) throw new Error("供应商缺少 name/base_url");
  return patch;
}

function modelPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.key_id !== undefined) patch.key_id = toTrimmedString(data.key_id);
  if (mode === "create") patch.model_id = toTrimmedString(data.model_id);
  else if (data.model_id !== undefined) throw new Error("模型 ID 不可修改");
  if (data.display_name !== undefined) patch.display_name = toNullableString(data.display_name);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.key_id || !patch.model_id)) throw new Error("模型缺少 key_id/model_id");
  return patch;
}

async function requireSelectableModel(supabase: SupabaseClient, modelId: string, currentModelId: string | null) {
  if (modelId === currentModelId) return;
  const { availability } = await loadAiConfig(supabase);
  const family = availability.modelFamilies.find((item) => item.modelId === modelId);
  if (!family?.isSelectable) throw mutationError(`模型【${modelId}】当前没有可用渠道，不能新选`, 409);
}

type MutationResult = {
  affectedCount?: number;
  cascade?: { keyCount: number; modelCount: number };
  sharedAddressImpact?: SharedAddressImpact;
};
type MutationError = Error & {
  status?: number;
  requiresConfirmation?: boolean;
  affectedBusinesses?: Array<{ key: string; label: string; selectedModelId: string | null; preferredModelId: string | null; defaultModelId: string | null }>;
  unknownReasons?: string[];
  sharedAddressImpact?: SharedAddressImpact;
};

function mutationError(message: string, status = 400): MutationError {
  const error = new Error(message) as MutationError;
  error.status = status;
  return error;
}

function mutationErrorBody(error: unknown, fallback: string) {
  const cause = error as MutationError;
  return {
    error: error instanceof Error ? error.message : fallback,
    ...(typeof cause?.requiresConfirmation === "boolean" ? { requiresConfirmation: cause.requiresConfirmation } : {}),
    ...(Array.isArray(cause?.affectedBusinesses) ? { affectedBusinesses: cause.affectedBusinesses } : {}),
    ...(cause?.sharedAddressImpact ? { sharedAddressImpact: cause.sharedAddressImpact } : {}),
    ...(Array.isArray(cause?.unknownReasons) ? { unknownReasons: cause.unknownReasons } : {}),
  };
}

export function boundedInteger(
  value: unknown,
  fieldLabel: string,
  min: number,
  max: number,
  fallback: number,
) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw mutationError(`${fieldLabel}必须是 ${min}-${max} 的整数`);
  }
  return parsed;
}

async function handleRemoveKeyModel(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  actorId: string,
) {
  const keyModelId = toTrimmedString(data.key_model_id ?? data.id);
  const keyId = toTrimmedString(data.key_id);
  const modelId = toTrimmedString(data.model_id);
  if (!keyModelId && (!keyId || !modelId)) throw new Error("缺少 key_model_id 或 key_id/model_id");

  const query = supabase
    .from("ai_provider_key_models")
    .select("*, key:ai_provider_keys(label, provider_id, provider:ai_providers(name))");
  const { data: row, error: rowError } = keyModelId
    ? await query.eq("id", keyModelId).maybeSingle()
    : await query.eq("key_id", keyId).eq("model_id", modelId).maybeSingle();
  if (rowError || !row) throw new Error(rowError?.message || "渠道未挂载此模型");

  const target = row as {
    id: string;
    key_id: string;
    model_id: string;
    display_name?: string | null;
    is_enabled: boolean;
    key?: { label?: string | null; provider_id?: string | null; provider?: { name?: string | null } | Array<{ name?: string | null }> | null } | Array<{ label?: string | null; provider_id?: string | null; provider?: { name?: string | null } | Array<{ name?: string | null }> | null }> | null;
  };
  const preview = await buildDependencyPreview(supabase, { scope: "supply", id: target.id });
  requireDependencyConfirmation(preview, data.confirm_impact === true, "删除渠道模型供应");
  const bundle = await loadAiConfig(supabase);
  const remaining = bundle.availability.modelFamilies.find((family) => family.modelId === target.model_id)?.channels
    .filter((candidate) => candidate.keyModelId !== target.id && candidate.isSchedulable) ?? [];

  const key = firstOrNull(target.key);
  const provider = firstOrNull(key?.provider);
  try {
    await runAiConfigWrite(supabase,"remove_ai_config_supply_with_audit",{
      p_supply_id:target.id,p_actor_id:actorId,
      p_audit_detail:JSON.stringify({source:"admin_ai_config",keyId:target.key_id,keyName:key?.label ?? null,providerName:provider?.name ?? null,modelId:target.model_id,displayName:target.display_name ?? null,removedAt:new Date().toISOString()}),
    });
  } catch (error) {
    if ((error as MutationError).status===409) throw error;
    throw mutationError(auditRollbackMessage("收走模型"),500);
  }

  return {
    ok: true,
    removed: { keyModelId: target.id, keyId: target.key_id, modelId: target.model_id },
    remainingAvailableLineCount: remaining.length,
    auditStatus: "succeeded",
  };
}

async function handleSetModelEnabled(supabase: SupabaseClient, data: Record<string, unknown>) {
  const modelId = toTrimmedString(data.modelId ?? data.model_id);
  if (!modelId) throw new Error("缺少 modelId");
  if (typeof data.is_enabled !== "boolean") throw new Error("缺少 is_enabled");
  const isEnabled = data.is_enabled;

  if (!isEnabled) {
    const preview = await buildDependencyPreview(supabase, { scope: "model", id: modelId });
    requireDependencyConfirmation(preview, data.confirm_impact === true, "停用模型");
  }

  const { data: currentRows, error: readError } = await supabase
    .from("ai_provider_key_models")
    .select("id, is_enabled, disabled_by_model")
    .eq("model_id", modelId);
  if (readError) {
    if (/disabled_by_model/i.test(readError.message ?? "")) {
      throw mutationError("数据库尚未执行 AI 供应开关迁移，暂不能批量停用或恢复模型", 409);
    }
    throw new Error(readError.message);
  }
  const snapshot = (currentRows ?? []) as Array<{ id: string; is_enabled: boolean; disabled_by_model: boolean | null }>;
  const changedRows = isEnabled
    ? snapshot.filter((row) => row.disabled_by_model === true)
    : snapshot.filter((row) => row.is_enabled);
  if (changedRows.length === 0) {
    return { modelId, is_enabled: isEnabled, affectedCount: snapshot.length, changedSupplyCount: 0 };
  }

  const { error: updateError } = await supabase
    .from("ai_provider_key_models")
    .update(isEnabled
      ? { is_enabled: true, disabled_by_model: false }
      : { is_enabled: false, disabled_by_model: true })
    .in("id", changedRows.map((row) => row.id));
  if (updateError) throw new Error(updateError.message);

  return { modelId, is_enabled: isEnabled, affectedCount: snapshot.length, changedSupplyCount: changedRows.length };
}

async function applyMutation(
  supabase: SupabaseClient,
  action: Extract<AiConfigAction, "create" | "update" | "delete">,
  entity: AiConfigEntity,
  data: Record<string, unknown>,
  actorId?: string,
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

  if (action === "delete" && entity === "model") {
    if (!actorId) throw new Error("缺少审计操作人");
    return handleRemoveKeyModel(supabase, { ...data, id: targetId }, actorId) as unknown as MutationResult;
  }

  if (action === "delete") {
    if (entity === "provider") {
      const preview = await buildDependencyPreview(supabase, { scope: "provider", id: targetId });
      requireDependencyConfirmation(preview, data.confirm_impact === true, "删除接入点");
      const { error } = await supabase.from("ai_providers").delete().eq("id", targetId);
      if (error) throw new Error(error.message);
      return { cascade: { keyCount: preview.channels.length, modelCount: preview.channels.reduce((count, channel) => count + channel.models.length, 0) } };
    }
    if (entity === "key") {
      const preview = await buildDependencyPreview(supabase, { scope: "key", id: targetId });
      requireDependencyConfirmation(preview, data.confirm_impact === true, "删除渠道");
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

  if (Object.keys(patch).length === 0 && !(entity === "key" && data.base_url !== undefined)) {
    if (action === "update" && data.priority !== undefined) return {};
    throw new Error("没有可写入字段");
  }

  const affectedCount = 0;
  let sharedAddressImpact: SharedAddressImpact | undefined;

  if (action === "create") {
    const { error } = await supabase.from(table).insert(patch);
    if (error) throw new Error(error.message);
  } else {
    if (entity === "provider" && patch.base_url !== undefined) {
      sharedAddressImpact = await requireSharedAddressConfirmation(supabase,targetId,String(patch.base_url),data.confirm_shared_address === true);
    }
    if (entity === "key" && (data.provider_id !== undefined || data.base_url !== undefined)) {
      const {data: currentKey,error: keyError} = await supabase.from("ai_provider_keys").select("provider_id").eq("id",targetId).single();
      if (keyError || !currentKey) throw new Error(keyError?.message || "渠道不存在");
      if (data.provider_id !== undefined && toTrimmedString(data.provider_id) !== currentKey.provider_id) throw new Error("渠道不能改换所属地址组，请新接入渠道");
      if (data.base_url !== undefined) {
        const address = normalizeChannelAddress(data.base_url);
        sharedAddressImpact = await requireSharedAddressConfirmation(supabase,currentKey.provider_id,address,data.confirm_shared_address === true);
      }
    }
    if (entity === "provider" && patch.is_enabled === false) {
      const preview = await buildDependencyPreview(supabase, { scope: "provider", id: targetId });
      requireDependencyConfirmation(preview, data.confirm_impact === true, "停用接入点");
    }
    if (entity === "key" && patch.is_enabled === false) {
      const preview = await buildDependencyPreview(supabase, { scope: "key", id: targetId });
      requireDependencyConfirmation(preview, data.confirm_impact === true, "停用渠道");
    }
    if (entity === "model" && patch.is_enabled === false) {
      const preview = await buildDependencyPreview(supabase,{scope:"supply",id:targetId});
      requireDependencyConfirmation(preview,data.confirm_impact===true,"关闭模型供应");
    }
    if (entity === "model") {
      return await runAiConfigWrite(supabase,"update_ai_config_model",{p_supply_id:targetId,p_patch:patch});
    }
    if (entity === "key") {
      await runAiConfigWrite(supabase,"update_ai_config_key",{p_key_id:targetId,p_patch:patch,p_base_url:data.base_url === undefined ? null : normalizeChannelAddress(data.base_url)});
    } else {
      const {error}=await supabase.from(table).update(patch).eq("id",targetId);
      if(error) throw new Error(error.message);
    }

  }

  return { affectedCount, sharedAddressImpact };
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
    system_prompt: toNullableString(data.system_prompt),
    output_token_limit: boundedInteger(data.output_token_limit, "最大输出 Token", 1200, 8000, 3600),
    context_message_limit: boundedInteger(data.context_message_limit, "上下文轮数", 1, 50, 30),
    is_enabled: data.is_enabled === undefined ? true : toBoolean(data.is_enabled),
    lifecycle_state: "active",
    archived_at: null,
    archived_reason: null,
  };
  if (data.model_id !== undefined) {
    const nextModelId = toNullableString(data.model_id);
    if (nextModelId) {
      const { data: current, error } = await supabase
        .from("ai_feature_bindings")
        .select("model_id")
        .eq("feature_key", feature.key)
        .maybeSingle();
      if (error) throw new Error(error.message);
      await requireSelectableModel(supabase, nextModelId, toNullableString(current?.model_id));
    }
    patch.model_id = nextModelId;
  }
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

export async function buildAiConfigResponse(
  request: NextRequest,
  deps: { requireSystemActor: typeof requireSystemActor; probeAiFeature?: typeof probeAiFeature; createAdminClient?: typeof createAdminClient } = { requireSystemActor }
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

  if (action === "probe_provider_models") {
    const data = asRecord(body.data);
    const providerId = toTrimmedString(data.provider_id);
    const apiKey = toTrimmedString(data.api_key);
    if ((!providerId && !toTrimmedString(data.base_url)) || !apiKey) {
      return NextResponse.json({ error: "缺少渠道地址或 api_key" }, { status: 400 });
    }
    try {
      const { data: provider, error } = providerId ? await auth.supabase
        .from("ai_providers")
        .select("id, name, base_url, is_enabled")
        .eq("id", providerId)
        .maybeSingle() : {data:{base_url:normalizeChannelAddress(data.base_url),is_enabled:true},error:null};
      if (error || !provider) throw new Error(error?.message || "接入点不存在");
      if (!(provider as { is_enabled?: boolean }).is_enabled) throw new Error("接入点已停用");
      const modelIds = await discoverModelIds(provider as { name?: string; base_url?: string }, apiKey);
      return NextResponse.json({ modelIds, modelGroups: groupModelIdAliases(modelIds) });
    } catch {
      // 不把上游响应原文返回给浏览器，避免错误消息意外回显凭据。
      return NextResponse.json({ error: "服务端探测模型列表失败，请检查接入点和 API Key" }, { status: 502 });
    }
  }

  if (action === "find_model_channels" || action === "enable_model_channel") {
    try {
      const data = asRecord(body.data);
      const modelId = toTrimmedString(data.model_id);
      if (!modelId) throw new Error("缺少 model_id");
      const bundle = await loadAiConfig(auth.supabase);
      const candidates = findModelChannelCandidates(bundle as unknown as ModelChannelDiscoveryInput,modelId);
      if (action === "find_model_channels") return NextResponse.json({modelId,candidates});
      const candidate = candidates.find(item=>item.keyId === toTrimmedString(data.key_id));
      if (!candidate) throw new Error("该供应已经打开，或上游缓存未发现这个模型，请先同步");
      if (!candidate.keyEnabled || !candidate.providerEnabled) throw new Error("请先打开渠道及其地址组，再开启模型供应");
      const target = await loadKeyProvider(auth.supabase,candidate.keyId);
      const testResult = await probeProviderModel(target.key.api_key,target.provider.base_url,modelId);
      if (!testResult.ok) return NextResponse.json({error:"该渠道的模型测试未通过，供应仍关闭",testResult},{status:422});
      const supplyId = await runAiConfigWrite((deps.createAdminClient ?? createAdminClient)(),"enable_ai_config_supply",{
        p_key_id:candidate.keyId,p_model_id:modelId,p_display_name:getModelDisplayName(modelId),
      });
      aiClientInternal.resetCache();
      return NextResponse.json({...await loadAiConfig(auth.supabase),enableResult:{keyId:candidate.keyId,modelId,supplyId,testResult}});
    } catch (error) {
      return NextResponse.json(mutationErrorBody(error,"模型供应操作失败"),{status:(error as MutationError).status ?? 400});
    }
  }

  if (action === "sync_key_models") {
    try {
      const result = await handleSyncKeyModels((deps.createAdminClient ?? createAdminClient)(), asRecord(body.data));
      const bundle = await loadAiConfig(auth.supabase);
      // 撤下模型后，如果某个业务（含全局默认）从“有渠道”变成“完全没渠道”，要在同步结果里点名。
      const removedModelIds = new Set(result.removedModelIds);
      const lostBusinesses = bundle.availability.businessAssurances
        .filter((assurance) => assurance.routingStatus === "outage"
          && [assurance.selectedModelId, assurance.defaultModelId]
            .some((modelId) => Boolean(modelId && removedModelIds.has(modelId))))
        .map((assurance) => ({
          key: assurance.key,
          label: assurance.label,
          modelId: assurance.selectedModelId ?? assurance.defaultModelId,
        }));
      return NextResponse.json({ syncResult: { ...result, lostBusinesses }, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "同步模型列表失败" }, { status: 400 });
    }
  }

  if (action === "set_key_model_selection") {
    try {
      const result = await handleSetKeyModelSelection((deps.createAdminClient ?? createAdminClient)(), asRecord(body.data));
      aiClientInternal.resetCache();
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ syncResult: result, ...bundle });
    } catch (error) {
      const status = typeof (error as MutationError)?.status === "number" ? (error as MutationError).status : 400;
      return NextResponse.json(mutationErrorBody(error, "保存模型勾选失败"), { status });
    }
  }

  if (action === "set_model_enabled" || action === "set_global_model_shelf_state") {
    try {
      const result = await handleSetModelEnabled(auth.supabase, asRecord(body.data));
      aiClientInternal.resetCache();
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ ...bundle, shelfResult: result, affectedCount: result.affectedCount });
    } catch (error) {
      const status = typeof (error as MutationError)?.status === "number" ? (error as MutationError).status : 400;
      return NextResponse.json(mutationErrorBody(error, "更新模型开关失败"), { status });
    }
  }

  if (action === "remove_key_model") {
    try {
      const result = await handleRemoveKeyModel((deps.createAdminClient ?? createAdminClient)(), asRecord(body.data), auth.actor.userId);
      aiClientInternal.resetCache();
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ ...bundle, removalResult: result });
    } catch (error) {
      const status = typeof (error as MutationError)?.status === "number" ? (error as MutationError).status : 400;
      return NextResponse.json(mutationErrorBody(error, "收走模型失败"), { status });
    }
  }

  if (action === "sync_all_keys") {
    try {
      return NextResponse.json(await handleSyncAllKeys((deps.createAdminClient ?? createAdminClient)()));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "全池同步模型列表失败" }, { status: 400 });
    }
  }

  if (action === "check_all_in_use" || action === "test_all_keys" || action === "test_all_keys_all_models") {
    try {
      const healthClient = (deps.createAdminClient ?? createAdminClient)();
      return NextResponse.json(await handleCheckAllInUse(auth.supabase, { healthClient }));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "使用中模型检查失败" }, { status: 400 });
    }
  }

  if (action === "test_key") {
    try {
      const data = asRecord(body.data);
      if (data.feature_key === "ocr_screenshot") {
        const started = Date.now();
        let result: Awaited<ReturnType<typeof probeAiFeature>> | null = null;
        let message = "截图识别试跑失败";
        try {
          const sample = buildProbeRequestBody("", "vision");
          result = await (deps.probeAiFeature ?? probeAiFeature)("ocr_screenshot", {
            messages: sample.messages, jsonMode: true, maxTokens: 64,
            timeoutMs: MODEL_PROBE_TIMEOUT_MS, totalTimeoutMs: 30_000,
            validateContent: isValidVisionProbeContent,
          });
          if (result.providerKeyId) {
            await markProviderKeySuccess(auth.supabase, result.providerKeyId);
            await clearLegacyManualSleep(auth.supabase, result.providerKeyId);
            if (result.providerKeyModelId) await markProviderKeyModelSuccess(auth.supabase, result.providerKeyModelId);
          }
        } catch (error) {
          if (error instanceof Error) message = error.message;
        }
        const bundle = await loadAiConfig(auth.supabase);
        return NextResponse.json({ ...bundle, testResult: result ? {
          ok: true, latencyMs: Date.now() - started, model: result.model, channelName: result.channelName,
          channelLabel: bundle.keys.find((key) => key.id === result?.providerKeyId)?.label ?? result.channelName,
        } : { ok: false, latencyMs: Date.now() - started, message, failureDiagnostic: describeChannelFailure({ message }) } });
      }
      const healthClient = (deps.createAdminClient ?? createAdminClient)();
      const result = await handleTestKey(auth.supabase, asRecord(body.data), { healthClient });
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ testResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "连通性测试失败" }, { status: 400 });
    }
  }

  if (action === "test_key_model") {
    try {
      const healthClient = (deps.createAdminClient ?? createAdminClient)();
      const result = await handleTestKeyModel(auth.supabase, asRecord(body.data), { recordFailure: true, healthClient });
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ testResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型连通测试失败" }, { status: 400 });
    }
  }

  if (action === "test_key_all_models") {
    try {
      const data = asRecord(body.data);
      const keyId = toTrimmedString(data.key_id);
      if (action === "test_key_all_models" && !keyId) throw new Error("缺少 key_id");
      // 显式单渠道检查只测该渠道当前勾选在供的模型；不再盲抽第 1 个挂载模型。
      const modelsQuery = auth.supabase.from("ai_provider_key_models").select("key_id, model_id, is_enabled");
      const { data: rows, error } = keyId ? await modelsQuery.eq("key_id", keyId) : await modelsQuery;
      if (error) throw new Error(error.message);
      const { data: keyStateRows, error: keyStateError } = await auth.supabase.from("ai_provider_keys").select("id, is_enabled");
      if (keyStateError) throw new Error(keyStateError.message);
      const enabledKeyIds = new Set(((keyStateRows ?? []) as Array<{ id: string; is_enabled: boolean }>).filter((row) => row.is_enabled).map((row) => row.id));
      const targets = ((rows ?? []) as Array<{ key_id: string; model_id: string; is_enabled?: boolean }>)
        .filter((row) => enabledKeyIds.size === 0 || enabledKeyIds.has(row.key_id))
        .filter((row) => row.is_enabled === true)
        .map(({ key_id, model_id }) => ({ key_id, model_id }));
      const healthClient = (deps.createAdminClient ?? createAdminClient)();
      const keyFailureClaim = createKeyFailureClaim();
      const modelResults = await mapWithConcurrency(
        targets,
        MODEL_TEST_CONCURRENCY,
        (target) => testMountedModel(auth.supabase, target, { healthClient, keyFailureClaim }),
      );
      const stateWriteErrors = modelResults
        .map((result) => result.stateWriteError)
        .filter((value): value is string => Boolean(value));
      const successCount = modelResults.filter((result) => result.ok).length;
      const failureCount = modelResults.length - successCount;

      return NextResponse.json({
        ...await loadAiConfig(auth.supabase),
        keyId,
        results: modelResults.map(({ modelId, ok, latencyMs, error: modelError, failureDiagnostic, stateWriteError }) => ({
          modelId,
          ok,
          latencyMs,
          error: modelError,
          failureDiagnostic,
          stateWriteError: stateWriteError ?? null,
        })),
        total: modelResults.length,
        successCount,
        failureCount,
        stateWriteError: stateWriteErrors.length > 0 ? stateWriteErrors.join("；") : null,
        emptyResult: modelResults.length === 0,
        allPassed: modelResults.length > 0 && failureCount === 0,
        failedModelIds: modelResults.filter((result) => !result.ok).map((result) => result.modelId),
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型连通测试失败" }, { status: 400 });
    }
  }

  if (action === "swap_model_channel_order") {
    try {
      const data = asRecord(body.data);
      const modelId = toTrimmedString(data.model_id);
      const id = toTrimmedString(data.key_model_id);
      const targetId = toTrimmedString(data.target_key_model_id);
      if (!modelId || !id || !targetId || id === targetId) throw mutationError("顺位交换参数不合法");
      // 「可调度相邻」校验复用五态唯一真源：中间隔着失效/停用渠道不阻断交换，端点不可调度则拒绝。
      const preloaded = await loadAiConfig(auth.supabase);
      const family = preloaded.availability.modelFamilies.find((f) => f.modelId === modelId);
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
        p_model_id: modelId, p_key_model_id: id, p_target_key_model_id: targetId,
      });
      if (error) throw mutationError(error.message, 409);
      aiClientInternal.resetCache();
      return NextResponse.json(await loadAiConfig(auth.supabase));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "渠道处置失败" }, { status: (error as MutationError).status ?? 400 });
    }
  }

  if (action === "set_global_default_model") {
    try {
      const data = asRecord(body.data);
      const modelId = toNullableString(data.model_id);
      if (!modelId) throw new Error("还没有选择默认兜底模型");
      const { data: current, error: currentError } = await auth.supabase
        .from("ai_feature_bindings")
        .select("model_id")
        .eq("feature_key", "default")
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      await requireSelectableModel(auth.supabase, modelId, toNullableString(current?.model_id));
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
      const status = typeof (error as MutationError)?.status === "number" ? (error as MutationError).status : 400;
      return NextResponse.json(mutationErrorBody(error, "设置全局默认模型失败"), { status });
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
      const status = typeof (error as MutationError)?.status === "number" ? (error as MutationError).status : 400;
      return NextResponse.json(mutationErrorBody(error, "保存业务功能失败"), { status });
    }
  }

  const entity = parseEntity(body.entity);
  if (!entity) {
    return NextResponse.json({ error: "entity 不正确" }, { status: 400 });
  }

  try {
    const mutationResult = await applyMutation((deps.createAdminClient ?? createAdminClient)(), action, entity, asRecord(body.data), auth.actor.userId);
    aiClientInternal.resetCache();
    const bundle = await loadAiConfig(auth.supabase);
    return NextResponse.json({
      ...bundle,
      affectedCount: mutationResult.affectedCount,
      ...(mutationResult.cascade ? { cascade: mutationResult.cascade } : {}),
      ...(mutationResult.sharedAddressImpact ? { sharedAddressImpact: mutationResult.sharedAddressImpact } : {}),
    });
  } catch (error) {
    const status =
      typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 400;
    return NextResponse.json(mutationErrorBody(error, "保存 AI 配置失败"), { status });
  }
}

export const defaultAiConfigDeps: { requireSystemActor: typeof requireSystemActor } = { requireSystemActor };

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/ai-config", request, async (observation) => {
    observation.mark("validate");
    return appendObservedMutationResult(await buildAiConfigResponse(request, defaultAiConfigDeps), observation);
  });
}

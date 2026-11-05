import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { __internal as aiClientInternal, extractJsonString, probeAiFeature, type AiMessage } from "@/lib/ai/client";
import { buildHaikuVisionBody, parseHaikuVisionResponse, usesHaikuNativeVision } from "@/lib/ai/haiku-vision-transport";
import { getAiFeatureCatalogEntry } from "@/lib/ai/feature-catalog";
import { buildAiFeatureControls, type AiFeatureBindingControlRow } from "@/lib/ai-config/feature-controls";
import { changeAiFeatureLifecycle } from "@/lib/ai-config/feature-lifecycle";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { describeChannelFailure, type ChannelFailureDiagnostic } from "@/lib/ai-config/failure-diagnostic";
import { computeAvailability } from "@/lib/ai-config/availability";
import { markProviderKeySuccess, markProviderKeyModelSuccess } from "@/lib/ai/provider-routing";
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
  restoreModelShelfState,
} from "@/lib/ai-config/batch-actions";
import { discoverModelIds, cleanupStaleModelsForKey } from "./sync-models/route";
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
import { auditRollbackIncompleteMessage, auditRollbackMessage, writeAuditLog } from "@/lib/audit-log";

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
  | "enable_model_channel"
  | "cleanup_stale_models";

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
  return action === "create" || action === "update" || action === "delete" || action === "test_key" || action === "test_key_model" || action === "test_key_all_models" || action === "test_all_keys_all_models" || action === "check_all_in_use" || action === "swap_model_channel_order" || action === "save_feature_control" || action === "archive_feature" || action === "restore_feature" || action === "set_global_default_model" || action === "set_model_enabled" || action === "sync_key_models" || action === "set_key_model_selection" || action === "set_global_model_shelf_state" || action === "remove_key_model" || action === "sync_all_keys" || action === "test_all_keys" || action === "probe_provider_models" || action === "find_model_channels" || action === "enable_model_channel" || action === "cleanup_stale_models" ? action : null;
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

async function loadAiConfig(supabase: SupabaseClient) {
  const [providersResult, keysResult, featureBindingsResult] = await Promise.all([
    supabase.from("ai_providers").select("id, name, base_url, description, is_enabled, created_at, updated_at"),
    supabase.from("ai_provider_keys").select("id, provider_id, label, api_key, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, first_failure_at, invalidated_at, manual_sleep_until, available_models, created_at, updated_at"),
    supabase.from("ai_feature_bindings").select("id, feature_key, label, model_id, system_prompt, output_token_limit, context_message_limit, channel_settings, is_enabled, lifecycle_state, archived_at, archived_reason, created_at, updated_at"),
  ]);

  const modelsResult = await supabase
    .from("ai_provider_key_models")
    .select("*");

  const firstError =
    providersResult.error ??
    keysResult.error ??
    modelsResult.error ??
    featureBindingsResult.error;

  if (firstError) throw new Error(firstError.message);

  const rawModels = (modelsResult.data ?? []) as Array<Record<string, unknown>>;
  const modelsWithoutLegacyState = rawModels.map((row) => {
    const model = { ...row };
    delete model.global_is_enabled;
    return model;
  });
  const enabledModelIds = new Set(rawModels.filter((row) => row.is_enabled === true).map((row) => row.model_id));
  const secrets = (keysResult.data ?? []).map((key) => String(key.api_key ?? ""));
  const bundle = {
    providers: (providersResult.data ?? []).map((provider) => ({ ...provider, priority: 0 })),
    keys: (keysResult.data ?? []).map((row) => ({
      ...row,
      priority: 0,
      last_error_message: row.last_error_message ? sanitizeProviderErrorMessage(row.last_error_message, secrets) : null,
      failureDiagnostic: row.last_error_message ? describeChannelFailure({ message: String(row.last_error_message), secrets }) : null,
      api_key: undefined,
      api_key_masked: maskApiKeyLast4((row as { api_key?: unknown }).api_key),
    })),
    models: modelsWithoutLegacyState.map((row) => ({ ...row,
      global_is_enabled: enabledModelIds.has(row.model_id),
      last_error_message: row.last_error_message ? sanitizeProviderErrorMessage(row.last_error_message, secrets) : null,
      failureDiagnostic: row.last_error_message ? describeChannelFailure({ message: String(row.last_error_message), secrets }) : null,
    })),
    featureBindings: (featureBindingsResult.data ?? []).map((binding) => ({ ...binding, provider_key_model_id: null })),
    featureControls: buildAiFeatureControls((featureBindingsResult.data ?? []) as AiFeatureBindingControlRow[]),
  };
  return { ...bundle, availability: computeAvailability({
    providers: providersResult.data ?? [],
    keys: keysResult.data ?? [],
    models: modelsWithoutLegacyState as never,
    featureControls: bundle.featureControls,
    defaultBinding: bundle.featureBindings.find((binding) => binding.feature_key === "default") ?? null,
  }) };
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

  const snapshot = { ...row } as Record<string, unknown>;
  delete snapshot.key;
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

  const { error: deleteError } = await supabase.from("ai_provider_key_models").delete().eq("id", target.id);
  if (deleteError) throw new Error(deleteError.message);

  const key = firstOrNull(target.key);
  const provider = firstOrNull(key?.provider);
  const audit = await writeAuditLog(supabase as never, {
    userId: actorId,
    action: "ai_provider_model_remove",
    target: target.id,
    detail: JSON.stringify({
      source: "admin_ai_config",
      keyId: target.key_id,
      keyName: key?.label ?? null,
      providerName: provider?.name ?? null,
      modelId: target.model_id,
      displayName: target.display_name ?? null,
      removedAt: new Date().toISOString(),
    }),
  });
  if (!audit.ok) {
    try {
      const { error: restoreError } = await supabase.from("ai_provider_key_models").insert(snapshot);
      if (restoreError) throw restoreError;
    } catch {
      throw mutationError(auditRollbackIncompleteMessage("收走模型"), 500);
    }
    throw mutationError(auditRollbackMessage("收走模型"), 500);
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
  if (updateError) {
    try {
      await restoreModelShelfState(supabase, snapshot);
    } catch (rollbackError) {
      throw new Error(`${updateError.message}；${rollbackError instanceof Error ? rollbackError.message : "状态回滚失败"}`);
    }
    throw new Error(updateError.message);
  }

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
      const { error: modelsError } = await supabase.from("ai_provider_key_models").delete().eq("key_id", targetId);
      if (modelsError) throw new Error(modelsError.message);
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
        const {error} = await supabase.from("ai_providers").update({base_url:address}).eq("id",currentKey.provider_id);
        if (error) throw new Error(error.message);
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
    let renameModelId: string | null = null;
    let previousDisplayName: string | null = null;
    if (entity === "model" && (patch.display_name !== undefined || patch.is_enabled !== undefined)) {
      const { data: currentModel, error: currentModelError } = await supabase
        .from("ai_provider_key_models")
        .select("*")
        .eq("id", targetId)
        .single();
      if (currentModelError || !currentModel) throw new Error(currentModelError?.message || "模型不存在");
      if (patch.display_name !== undefined) {
        renameModelId = (currentModel as { model_id: string }).model_id;
        previousDisplayName = (currentModel as { display_name?: string | null }).display_name ?? null;
      }
      if (patch.is_enabled === false) {
        const preview = await buildDependencyPreview(supabase, { scope: "supply", id: targetId });
        requireDependencyConfirmation(preview, data.confirm_impact === true, "关闭模型供应");
      }
      if (Object.prototype.hasOwnProperty.call(currentModel, "disabled_by_model")) patch.disabled_by_model = false;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from(table).update(patch).eq("id", targetId);
      if (error) throw new Error(error.message);
    }

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

async function handleTestKeyModel(supabase: SupabaseClient, data: Record<string, unknown>) {
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

const MODEL_TEST_CONCURRENCY = 4;

async function clearLegacyManualSleep(supabase: SupabaseClient, keyId: string) {
  const { error } = await supabase.from("ai_provider_keys").update({ manual_sleep_until: null }).eq("id", keyId);
  if (error) throw new Error(error.message);
}

// 单个模型的探测等待上限，也是「这个模型算不算能用」的产品判定线：
// 超过 15 秒才回话的模型，业务上等同于不可用。单测（测试连通）与批量检测共用这一条线，
// 避免同一个模型单独测通过、批量测却判超时（详见日志/2026-10-09.md）。
const MODEL_PROBE_TIMEOUT_MS = 15_000;
const MODEL_PROBE_TIMEOUT_SECONDS = MODEL_PROBE_TIMEOUT_MS / 1000;

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

async function handleCheckAllInUse(supabase: SupabaseClient) {
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

  const keyById = new Map(before.keys.map((key) => [key.id, key]));
  const providerById = new Map(before.providers.map((provider) => [provider.id, provider]));
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
  return { ...latestBundle, checkResult };
}

type ProbeResult = { failureDiagnostic?: ChannelFailureDiagnostic | null } & (
  | { ok: true; latencyMs: number; status: number; message: string; errorScope: null }
  | { ok: false; latencyMs: number; status: number; message: string; errorScope: ProviderFailureScope });

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

function isValidVisionProbeContent(content: string) {
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

async function probeProviderModel(
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

  if (action === "find_model_channels" || action === "enable_model_channel" || action === "cleanup_stale_models") {
    try {
      const data = asRecord(body.data);
      if (action === "cleanup_stale_models") {
        const keyId = toTrimmedString(data.key_id);
        if (!keyId) throw new Error("缺少 key_id");
        const cleanupResult = await cleanupStaleModelsForKey(auth.supabase,{keyId,modelIds:Array.isArray(data.model_ids) ? data.model_ids.map(toTrimmedString).filter(Boolean) : []});
        aiClientInternal.resetCache();
        return NextResponse.json({...await loadAiConfig(auth.supabase),cleanupResult});
      }
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
      let supplyId = candidate.existingSupplyId;
      if (supplyId) {
        const {error} = await auth.supabase.from("ai_provider_key_models").update({is_enabled:true,disabled_by_model:false}).eq("id",supplyId);
        if (error) throw new Error(error.message);
      } else {
        const {data: created,error} = await auth.supabase.from("ai_provider_key_models").insert({key_id:candidate.keyId,model_id:modelId,display_name:getModelDisplayName(modelId),is_enabled:true}).select("id").single();
        if (error || !created) throw new Error(error?.message || "创建模型供应失败");
        supplyId = created.id;
      }
      await markProviderKeySuccess(auth.supabase,candidate.keyId);
      await clearLegacyManualSleep(auth.supabase,candidate.keyId);
      await markProviderKeyModelSuccess(auth.supabase,supplyId!);
      aiClientInternal.resetCache();
      return NextResponse.json({...await loadAiConfig(auth.supabase),enableResult:{keyId:candidate.keyId,modelId,supplyId,testResult}});
    } catch (error) {
      return NextResponse.json(mutationErrorBody(error,"模型供应操作失败"),{status:(error as MutationError).status ?? 400});
    }
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
      const result = await handleRemoveKeyModel(auth.supabase, asRecord(body.data), auth.actor.userId);
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
      return NextResponse.json(await handleSyncAllKeys(auth.supabase));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "全池同步模型列表失败" }, { status: 400 });
    }
  }

  if (action === "check_all_in_use" || action === "test_all_keys" || action === "test_all_keys_all_models") {
    try {
      return NextResponse.json(await handleCheckAllInUse(auth.supabase));
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

  if (action === "test_key_all_models") {
    try {
      const data = asRecord(body.data);
      const keyId = toTrimmedString(data.key_id);
      if (action === "test_key_all_models" && !keyId) throw new Error("缺少 key_id");
      // 显式单渠道检查测其全部挂载模型（含手动关闭的供应）；全局检查有独立的使用中范围。
      const modelsQuery = auth.supabase.from("ai_provider_key_models").select("key_id, model_id, is_enabled");
      const { data: rows, error } = keyId ? await modelsQuery.eq("key_id", keyId) : await modelsQuery;
      if (error) throw new Error(error.message);
      const { data: keyStateRows, error: keyStateError } = await auth.supabase.from("ai_provider_keys").select("id, is_enabled");
      if (keyStateError) throw new Error(keyStateError.message);
      const enabledKeyIds = new Set(((keyStateRows ?? []) as Array<{ id: string; is_enabled: boolean }>).filter((row) => row.is_enabled).map((row) => row.id));
      // 显式渠道检查要求渠道开启，但不按该模型供应开关过滤。
      const targets = ((rows ?? []) as Array<{ key_id: string; model_id: string; is_enabled?: boolean }>)
        .filter((row) => enabledKeyIds.size === 0 || enabledKeyIds.has(row.key_id))
        .map(({ key_id, model_id }) => ({ key_id, model_id }));
      const modelResults = await mapWithConcurrency(
        targets,
        MODEL_TEST_CONCURRENCY,
        (target) => testMountedModel(auth.supabase, target),
      );
      const successCount = modelResults.filter((result) => result.ok).length;
      const failureCount = modelResults.length - successCount;

      return NextResponse.json({
        keyId,
        results: modelResults.map(({ modelId, ok, latencyMs, error: modelError, failureDiagnostic }) => ({
          modelId,
          ok,
          latencyMs,
          error: modelError,
          failureDiagnostic,
        })),
        total: modelResults.length,
        successCount,
        failureCount,
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
    const mutationResult = await applyMutation(auth.supabase, action, entity, asRecord(body.data), auth.actor.userId);
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

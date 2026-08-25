import { NextRequest, NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import { getAiFeatureCatalogEntry } from "@/lib/ai/feature-catalog";
import { buildAiFeatureControls, type AiFeatureBindingControlRow } from "@/lib/ai-config/feature-controls";
import { changeAiFeatureLifecycle } from "@/lib/ai-config/feature-lifecycle";
import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { swapKeyPriority } from "@/lib/ai-config/swap-key-priority";
import { clearFeaturePromptCache } from "@/lib/ai/load-feature-prompt";
import {
  requireSystemActor,
  toBoolean,
  toNullableString,
  toPriority,
  toTrimmedString,
} from "../ai-channels/_shared";

type AiConfigEntity =
  | "provider"
  | "key"
  | "model"
  | "feature_binding"
  | "rewrite_model_view"
  | "rewrite_model_route";
type AiConfigAction =
  | "create"
  | "update"
  | "delete"
  | "test_key"
  | "swap_key_priority"
  | "save_feature_control"
  | "archive_feature"
  | "restore_feature"
  | "set_global_default_model"
  | "sync_key_models"
  | "set_key_model_selection";

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

type ProviderJoin = { id: string; name: string } | null;
type ProviderKeyJoin = { id: string; provider: ProviderJoin | ProviderJoin[] | null } | null;
type ProviderKeyModelJoin = {
  id: string;
  model_id: string;
  key: ProviderKeyJoin | ProviderKeyJoin[] | null;
};

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
  return action === "create" || action === "update" || action === "delete" || action === "test_key" || action === "swap_key_priority" || action === "save_feature_control" || action === "archive_feature" || action === "restore_feature" || action === "set_global_default_model" || action === "sync_key_models" || action === "set_key_model_selection" ? action : null;
}

function parseEntity(value: unknown): AiConfigEntity | null {
  const entity = toTrimmedString(value);
  return entity === "provider" ||
    entity === "key" ||
    entity === "model" ||
    entity === "feature_binding" ||
    entity === "rewrite_model_view" ||
    entity === "rewrite_model_route"
    ? entity
    : null;
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

function rewriteModelViewPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.key !== undefined) patch.key = toTrimmedString(data.key);
  if (mode === "create" || data.label !== undefined) patch.label = toTrimmedString(data.label);
  if (data.description !== undefined) patch.description = toNullableString(data.description);
  if (data.sort_order !== undefined) patch.sort_order = toPriority(data.sort_order, 100);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (data.is_default !== undefined) patch.is_default = toBoolean(data.is_default);
  if (mode === "create" && (!patch.key || !patch.label)) throw new Error("模型视图缺少 key/label");
  return patch;
}

async function resolveRouteChannelId(
  supabase: SupabaseClient,
  providerKeyModelId: string,
): Promise<{ channelId: string; actualModel: string } | null> {
  const { data, error } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, key:ai_provider_keys(id, provider:ai_providers(id, name))")
    .eq("id", providerKeyModelId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as ProviderKeyModelJoin;
  const key = firstOrNull(row.key);
  const provider = firstOrNull(key?.provider);
  const providerName = provider?.name?.trim() ?? "";

  if (providerName) {
    const { data: channel, error: channelError } = await supabase
      .from("ai_channels")
      .select("id")
      .eq("name", providerName)
      .maybeSingle();

    if (channelError) throw new Error(channelError.message);
    if (channel?.id) {
      return { channelId: channel.id as string, actualModel: row.model_id };
    }
  }

  const { data: fallbackChannel, error: fallbackError } = await supabase
    .from("ai_channels")
    .select("id")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .maybeSingle();

  if (fallbackError) throw new Error(fallbackError.message);
  if (!fallbackChannel?.id) return null;

  return { channelId: fallbackChannel.id as string, actualModel: row.model_id };
}

async function rewriteModelRoutePatch(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  mode: "create" | "update",
) {
  const patch: Record<string, unknown> = {};

  if (mode === "create" || data.model_view_id !== undefined) patch.model_view_id = toTrimmedString(data.model_view_id);
  if (data.workflow_step_id !== undefined) patch.workflow_step_id = toNullableString(data.workflow_step_id);
  if (data.provider_key_model_id !== undefined) {
    const providerKeyModelId = toNullableString(data.provider_key_model_id);
    if (!providerKeyModelId) throw new Error("路由缺少 provider_key_model_id");
    patch.provider_key_model_id = providerKeyModelId;
    const resolved = await resolveRouteChannelId(supabase, providerKeyModelId);
    if (!resolved) throw new Error("找不到对应的渠道或模型");
    patch.channel_id = resolved.channelId;
    if (data.actual_model === undefined) {
      patch.actual_model = resolved.actualModel;
    }
  }
  if (data.actual_model !== undefined) patch.actual_model = toTrimmedString(data.actual_model);
  if (data.priority !== undefined) patch.priority = toPriority(data.priority, 100);
  if (data.weight !== undefined) patch.weight = toPriority(data.weight, 100);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);

  if (mode === "create") {
    if (!patch.model_view_id) throw new Error("路由缺少 model_view_id");
    if (!patch.provider_key_model_id) throw new Error("路由缺少 provider_key_model_id");
    if (!patch.actual_model) throw new Error("路由缺少 actual_model");
  }

  return patch;
}

async function loadAiConfig(supabase: SupabaseClient) {
  const [
    providersResult,
    keysResult,
    modelsResult,
    featureBindingsResult,
    rewriteModelViewsResult,
    rewriteModelRoutesResult,
  ] = await Promise.all([
    supabase.from("ai_providers").select("id, name, base_url, description, priority, is_enabled, created_at, updated_at").order("priority", { ascending: true }),
    supabase.from("ai_provider_keys").select("id, provider_id, label, api_key, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, available_models, created_at, updated_at").order("priority", { ascending: true }),
    supabase.from("ai_provider_key_models").select("id, key_id, model_id, display_name, is_enabled, created_at").order("created_at", { ascending: true }),
    supabase.from("ai_feature_bindings").select("id, feature_key, label, provider_key_model_id, model_id, system_prompt, output_token_limit, context_message_limit, channel_settings, is_enabled, lifecycle_state, archived_at, archived_reason, created_at, updated_at").order("created_at", { ascending: true }),
    supabase.from("rewrite_model_views").select("id, key, label, description, sort_order, is_enabled, is_default, created_at, updated_at").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("rewrite_model_routes").select("id, model_view_id, workflow_step_id, channel_id, provider_key_model_id, actual_model, priority, weight, is_enabled, created_at, updated_at").order("priority", { ascending: true }).order("weight", { ascending: false }).order("created_at", { ascending: true }),
  ]);

  const firstError =
    providersResult.error ??
    keysResult.error ??
    modelsResult.error ??
    featureBindingsResult.error ??
    rewriteModelViewsResult.error ??
    rewriteModelRoutesResult.error;

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
    rewriteModelViews: rewriteModelViewsResult.data ?? [],
    rewriteModelRoutes: rewriteModelRoutesResult.data ?? [],
  };
}

async function applyMutation(
  supabase: SupabaseClient,
  action: Extract<AiConfigAction, "create" | "update" | "delete">,
  entity: AiConfigEntity,
  data: Record<string, unknown>
) {
  if (entity === "feature_binding") {
    throw new Error("业务功能由 AI 总控统一管理，不能直接修改内部绑定");
  }

  const table = {
    provider: "ai_providers",
    key: "ai_provider_keys",
    model: "ai_provider_key_models",
    feature_binding: "ai_feature_bindings",
    rewrite_model_view: "rewrite_model_views",
    rewrite_model_route: "rewrite_model_routes",
  }[entity];

  if (action === "delete") {
    const { error } = await supabase.from(table).delete().eq("id", requireId(data));
    if (error) throw new Error(error.message);
    return;
  }

  const patch =
    entity === "provider"
      ? providerPatch(data, action)
      : entity === "key"
        ? buildAiKeyPatch(data, action)
      : entity === "model"
        ? modelPatch(data, action)
        : entity === "rewrite_model_view"
            ? rewriteModelViewPatch(data, action)
            : await rewriteModelRoutePatch(supabase, data, action);

  if (Object.keys(patch).length === 0) throw new Error("没有可写入字段");

  if (action === "create") {
    const { error } = await supabase.from(table).insert(patch);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from(table).update(patch).eq("id", requireId(data));
    if (error) throw new Error(error.message);
  }

  if (entity === "rewrite_model_view" && patch.is_default === true) {
    const { error: clearError } = await supabase
      .from("rewrite_model_views")
      .update({ is_default: false })
      .neq("id", requireId(data))
      .eq("is_default", true);
    if (clearError) throw new Error(clearError.message);
  }
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

async function handleSyncKeyModels(supabase: SupabaseClient, data: Record<string, unknown>) {
  const keyId = toTrimmedString(data.key_id);
  if (!keyId) throw new Error("缺少 key_id");

  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, api_key, provider:ai_providers(id, name, base_url)")
    .eq("id", keyId)
    .single();
  if (keyErr || !keyData) throw new Error(keyErr?.message || "密钥不存在");

  const provider = firstOrNull(
    (keyData as unknown as { provider: { base_url: string } | Array<{ base_url: string }> | null }).provider,
  );
  if (!provider?.base_url) throw new Error("渠道 URL 不存在");

  const baseUrlClean = provider.base_url.replace(/\/+$/, "");
  const targetUrl = baseUrlClean.endsWith("/models") ? baseUrlClean : `${baseUrlClean}/models`;

  const res = await fetch(targetUrl, {
    headers: { Authorization: `Bearer ${(keyData as unknown as { api_key: string }).api_key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`拉取模型列表失败 HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const payload = (await res.json()) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string; name?: string }> };
  const rawList = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const modelIds = [...new Set(rawList.map((item) => toTrimmedString(item?.id)).filter(Boolean))].sort();

  const { error: updateErr } = await supabase
    .from("ai_provider_keys")
    .update({ available_models: modelIds })
    .eq("id", keyId);
  if (updateErr) throw new Error(updateErr.message);

  return { ok: true, count: modelIds.length, models: modelIds };
}

async function handleSetKeyModelSelection(supabase: SupabaseClient, data: Record<string, unknown>) {
  const keyId = toTrimmedString(data.key_id);
  if (!keyId) throw new Error("缺少 key_id");
  const modelIds = Array.isArray(data.model_ids)
    ? [...new Set(data.model_ids.map((id) => toTrimmedString(id)).filter(Boolean))]
    : [];
  if (modelIds.length === 0) throw new Error("勾选列表不能为空（如需清空请直接停用该 Key）");

  const { data: existing, error: existErr } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id")
    .eq("key_id", keyId);
  if (existErr) throw new Error(existErr.message);

  const existingByModel = new Map(
    ((existing ?? []) as Array<{ id: string; model_id: string }>).map((row) => [row.model_id, row.id]),
  );
  const nowIso = new Date().toISOString();

  const toCreate = modelIds.filter((modelId) => !existingByModel.has(modelId));
  if (toCreate.length > 0) {
    const { error: insertErr } = await supabase.from("ai_provider_key_models").insert(
      toCreate.map((modelId) => ({ key_id: keyId, model_id: modelId, display_name: modelId, is_enabled: true, created_at: nowIso })),
    );
    if (insertErr) throw new Error(insertErr.message);
  }

  const toRemove = [...existingByModel.entries()].filter(([modelId]) => !modelIds.includes(modelId));
  if (toRemove.length > 0) {
    const { error: deleteErr } = await supabase
      .from("ai_provider_key_models")
      .delete()
      .in("id", toRemove.map(([, id]) => id));
    if (deleteErr) throw new Error(deleteErr.message);
  }

  return { ok: true, created: toCreate.length, removed: toRemove.length };
}

async function handleTestKey(supabase: SupabaseClient, data: Record<string, unknown>) {
  const keyId = toTrimmedString(data.key_id);
  const modelId = toTrimmedString(data.model_id);
  if (!keyId) throw new Error("缺少 key_id");

  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, api_key, provider:ai_providers(id, name, base_url)")
    .eq("id", keyId)
    .single();

  if (keyErr || !keyData) throw new Error(keyErr?.message || "密钥不存在");

  const keyRow = keyData as unknown as {
    id: string;
    api_key: string;
    provider: { id: string; name: string; base_url: string } | Array<{ id: string; name: string; base_url: string }> | null;
  };

  const provider = firstOrNull(keyRow.provider);
  if (!provider?.base_url) throw new Error("渠道 URL 不存在");

  let testModel = modelId;
  if (!testModel) {
    const { data: modelData } = await supabase
      .from("ai_provider_key_models")
      .select("model_id")
      .eq("key_id", keyId)
      .limit(1)
      .maybeSingle();
    testModel = (modelData as { model_id?: string } | null)?.model_id || "gpt-3.5-turbo";
  }

  const startTime = Date.now();
  const baseUrlClean = provider.base_url.replace(/\/+$/, "");
  const targetUrl = baseUrlClean.endsWith("/chat/completions")
    ? baseUrlClean
    : `${baseUrlClean}/chat/completions`;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyRow.api_key}`,
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const elapsedMs = Date.now() - startTime;
    if (res.ok) {
      await supabase
        .from("ai_provider_keys")
        .update({
          consecutive_failures: 0,
          unhealthy_until: null,
          last_success_at: new Date().toISOString(),
          last_error_message: null,
        })
        .eq("id", keyId);

      return { ok: true, latencyMs: elapsedMs, status: res.status, message: "连通测试成功" };
    } else {
      const errText = await res.text().catch(() => "");
      const errMsg = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
      await supabase
        .from("ai_provider_keys")
        .update({
          last_failure_at: new Date().toISOString(),
          last_error_message: errMsg,
        })
        .eq("id", keyId);

      return { ok: false, latencyMs: elapsedMs, status: res.status, message: errMsg };
    }
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : "连接超时或失败";
    await supabase
      .from("ai_provider_keys")
      .update({
        last_failure_at: new Date().toISOString(),
        last_error_message: errMsg,
      })
      .eq("id", keyId);

    return { ok: false, latencyMs: elapsedMs, status: 0, message: errMsg };
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSystemActor();
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

  if (action === "test_key") {
    try {
      const result = await handleTestKey(auth.supabase, asRecord(body.data));
      const bundle = await loadAiConfig(auth.supabase);
      return NextResponse.json({ testResult: result, ...bundle });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "连通性测试失败" }, { status: 400 });
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
    await applyMutation(auth.supabase, action, entity, asRecord(body.data));
    aiClientInternal.resetCache();
    return NextResponse.json(await loadAiConfig(auth.supabase));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存 AI 配置失败" }, { status: 400 });
  }
}

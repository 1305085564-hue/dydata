import { NextRequest, NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import {
  requireOwnerActor,
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
type AiConfigAction = "create" | "update" | "delete";

type AiConfigBody = {
  action?: unknown;
  entity?: unknown;
  data?: unknown;
};

type SupabaseClient = Awaited<ReturnType<typeof requireOwnerActor>> extends infer T
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
  return action === "create" || action === "update" || action === "delete" ? action : null;
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

function keyPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.provider_id !== undefined) patch.provider_id = toTrimmedString(data.provider_id);
  if (mode === "create" || data.label !== undefined) patch.label = toTrimmedString(data.label);
  if (mode === "create" || data.api_key !== undefined) patch.api_key = toTrimmedString(data.api_key);
  if (data.priority !== undefined) patch.priority = toPriority(data.priority, 100);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.provider_id || !patch.label || !patch.api_key)) {
    throw new Error("Key 缺少 provider_id/label/api_key");
  }
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

function featureBindingPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.feature_key !== undefined) patch.feature_key = toTrimmedString(data.feature_key);
  if (mode === "create" || data.label !== undefined) patch.label = toTrimmedString(data.label);
  if (data.provider_key_model_id !== undefined) patch.provider_key_model_id = toNullableString(data.provider_key_model_id);
  if (data.system_prompt !== undefined) patch.system_prompt = toNullableString(data.system_prompt);
  if (data.output_token_limit !== undefined) patch.output_token_limit = toPriority(data.output_token_limit, 3600);
  if (data.context_message_limit !== undefined) patch.context_message_limit = toPriority(data.context_message_limit, 30);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.feature_key || !patch.label)) throw new Error("功能绑定缺少 feature_key/label");
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
    supabase.from("ai_provider_keys").select("id, provider_id, label, api_key, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, created_at, updated_at").order("priority", { ascending: true }),
    supabase.from("ai_provider_key_models").select("id, key_id, model_id, display_name, is_enabled, created_at").order("created_at", { ascending: true }),
    supabase.from("ai_feature_bindings").select("id, feature_key, label, provider_key_model_id, system_prompt, output_token_limit, context_message_limit, is_enabled, created_at, updated_at").order("created_at", { ascending: true }),
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
    rewriteModelViews: rewriteModelViewsResult.data ?? [],
    rewriteModelRoutes: rewriteModelRoutesResult.data ?? [],
  };
}

async function applyMutation(supabase: SupabaseClient, action: AiConfigAction, entity: AiConfigEntity, data: Record<string, unknown>) {
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
        ? keyPatch(data, action)
      : entity === "model"
        ? modelPatch(data, action)
        : entity === "feature_binding"
          ? featureBindingPatch(data, action)
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

export async function GET() {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    return NextResponse.json(await loadAiConfig(auth.supabase));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 AI 配置失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOwnerActor();
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
  const entity = parseEntity(body.entity);
  if (!action || !entity) {
    return NextResponse.json({ error: "action/entity 不正确" }, { status: 400 });
  }

  try {
    await applyMutation(auth.supabase, action, entity, asRecord(body.data));
    aiClientInternal.resetCache();
    return NextResponse.json(await loadAiConfig(auth.supabase));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存 AI 配置失败" }, { status: 400 });
  }
}

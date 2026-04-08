import { NextRequest, NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";

import { requireOwnerActor, toBoolean, toNullableString, toTrimmedString } from "../ai-channels/_shared";

type AiFeatureJoin = {
  name: string;
} | null;

type AiFeatureRow = {
  id: string;
  feature_key: string;
  label: string;
  channel_id: string | null;
  model: string | null;
  system_prompt: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  channel: AiFeatureJoin | AiFeatureJoin[] | null;
};

function buildSelect() {
  return "id, feature_key, label, channel_id, model, system_prompt, is_enabled, created_at, updated_at, channel:ai_channels(name)";
}

function normalizeFeatureRow(row: AiFeatureRow) {
  const channel = Array.isArray(row.channel) ? row.channel[0] : row.channel;

  return {
    id: row.id,
    feature_key: row.feature_key,
    label: row.label,
    channel_id: row.channel_id,
    channel_name: channel?.name ?? null,
    model: row.model,
    system_prompt: row.system_prompt,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET() {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("ai_feature_config")
    .select(buildSelect())
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    features: (data ?? []).map((row) => normalizeFeatureRow(row as unknown as AiFeatureRow)),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const id = toTrimmedString(body.id);
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.channel_id !== undefined) {
    patch.channel_id = toNullableString(body.channel_id);
  }
  if (body.model !== undefined) {
    patch.model = toNullableString(body.model);
  }
  if (body.system_prompt !== undefined) {
    patch.system_prompt = toNullableString(body.system_prompt);
  }
  if (body.is_enabled !== undefined) {
    patch.is_enabled = toBoolean(body.is_enabled);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "没有可更新字段" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_feature_config")
    .update(patch)
    .eq("id", id)
    .select(buildSelect())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "功能配置不存在" }, { status: 404 });
  }

  aiClientInternal.resetCache();

  return NextResponse.json({
    feature: normalizeFeatureRow(data as unknown as AiFeatureRow),
  });
}

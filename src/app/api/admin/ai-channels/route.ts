import { NextRequest, NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import { requireOwnerActor, normalizeBaseUrl, normalizeChannelRow, toBoolean, toNullableString, toPriority, toTrimmedString, type AiChannelRow } from "./_shared";

function buildSelect() {
  return "id, name, base_url, api_key, model, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, created_at, updated_at";
}

function buildSelectWithoutKey() {
  return "id, name, base_url, model, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, created_at, updated_at";
}

export async function GET() {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  const { data, error } = await supabase.from("ai_channels").select(buildSelectWithoutKey()).order("priority", { ascending: true }).order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    channels: (data ?? []).map((row) => {
      const { ...rest } = row as unknown as Omit<AiChannelRow, "api_key">;
      return { ...rest, api_key_masked: "***" };
    }),
  });
}

export async function POST(request: NextRequest) {
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

  const name = toTrimmedString(body.name);
  const baseUrl = normalizeBaseUrl(body.base_url);
  const apiKey = toTrimmedString(body.api_key);
  const model = toNullableString(body.model);
  const priority = toPriority(body.priority, 100);
  const isEnabled = toBoolean(body.is_enabled, true);

  if (!name) {
    return NextResponse.json({ error: "缺少名称" }, { status: 400 });
  }
  if (!baseUrl) {
    return NextResponse.json({ error: "地址格式不正确" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "缺少密钥" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_channels")
    .insert({
      name,
      base_url: baseUrl,
      api_key: apiKey,
      model,
      priority,
      is_enabled: isEnabled,
    })
    .select(buildSelect())
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "创建失败" }, { status: 500 });
  }

  aiClientInternal.resetCache();

  return NextResponse.json({ channel: normalizeChannelRow(data as unknown as AiChannelRow) });
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
  const name = toTrimmedString(body.name);
  const baseUrl = normalizeBaseUrl(body.base_url);
  const apiKey = toTrimmedString(body.api_key);
  const model = toNullableString(body.model);

  if (body.name !== undefined) {
    if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
    patch.name = name;
  }
  if (body.base_url !== undefined) {
    if (!baseUrl) return NextResponse.json({ error: "地址格式不正确" }, { status: 400 });
    patch.base_url = baseUrl;
  }
  if (body.api_key !== undefined) {
    if (!apiKey) return NextResponse.json({ error: "密钥不能为空" }, { status: 400 });
    patch.api_key = apiKey;
  }
  if (body.model !== undefined) {
    patch.model = model;
  }
  if (body.priority !== undefined) {
    patch.priority = toPriority(body.priority, 100);
  }
  if (body.is_enabled !== undefined) {
    patch.is_enabled = toBoolean(body.is_enabled);
  }
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "没有可更新字段" }, { status: 400 });
  }

  if (patch.is_enabled === false) {
    const { data: target, error: targetError } = await supabase
      .from("ai_channels")
      .select("id, is_enabled")
      .eq("id", id)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: targetError?.message ?? "渠道不存在" }, { status: 404 });
    }

    if (target.is_enabled) {
      const { count, error: countError } = await supabase
        .from("ai_channels")
        .select("id", { count: "exact", head: true })
        .eq("is_enabled", true);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "至少保留 1 个启用渠道" }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabase
    .from("ai_channels")
    .update(patch)
    .eq("id", id)
    .select(buildSelect())
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "更新失败" }, { status: 500 });
  }

  aiClientInternal.resetCache();

  return NextResponse.json({ channel: normalizeChannelRow(data as unknown as AiChannelRow) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  const { searchParams } = new URL(request.url);
  const id = toTrimmedString(searchParams.get("id"));

  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }

  const { data: target, error: targetError } = await supabase
    .from("ai_channels")
    .select("id, is_enabled")
    .eq("id", id)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: targetError?.message ?? "渠道不存在" }, { status: 404 });
  }

  if (target.is_enabled) {
    const { count, error: countError } = await supabase
      .from("ai_channels")
      .select("id", { count: "exact", head: true })
      .eq("is_enabled", true);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "至少保留 1 个启用渠道" }, { status: 400 });
    }
  }

  const { error } = await supabase.from("ai_channels").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  aiClientInternal.resetCache();

  return NextResponse.json({ ok: true });
}

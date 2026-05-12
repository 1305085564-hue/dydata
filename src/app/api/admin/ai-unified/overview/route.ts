import { NextResponse } from "next/server";

import { requireOwnerActor, normalizeChannelRow, type AiChannelRow } from "../../ai-channels/_shared";

function selectChannels() {
  return "id, name, base_url, api_key, model, priority, is_enabled, unhealthy_until, consecutive_failures, last_failure_at, last_success_at, last_error_message, created_at, updated_at";
}

export async function GET() {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  const [
    channelsResult,
    featuresResult,
    modelViewsResult,
    modesResult,
    lengthPresetsResult,
    workflowsResult,
    fixedModesResult,
  ] = await Promise.all([
    supabase.from("ai_channels").select(selectChannels()).order("priority", { ascending: true }),
    supabase
      .from("ai_feature_config")
      .select("id, feature_key, label, channel_id, model, system_prompt, is_enabled, created_at, updated_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_model_views")
      .select("id, key, label, description, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true }),
    supabase
      .from("rewrite_modes")
      .select("id, key, name, description, mode_prompt, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true }),
    supabase
      .from("rewrite_length_presets")
      .select("id, key, name, description, length_prompt, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true }),
    supabase
      .from("rewrite_workflows")
      .select("id, key, name, description, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true }),
    supabase
      .from("rewrite_fixed_modes")
      .select("id, key, name, description, fixed_prompt, model_view_id, length_preset_id, sort_order, is_enabled, created_at, updated_at")
      .order("sort_order", { ascending: true }),
  ]);

  const firstError =
    channelsResult.error ??
    featuresResult.error ??
    modelViewsResult.error ??
    modesResult.error ??
    lengthPresetsResult.error ??
    workflowsResult.error ??
    fixedModesResult.error;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({
    channels: (channelsResult.data ?? []).map((row) => normalizeChannelRow(row as unknown as AiChannelRow)),
    features: featuresResult.data ?? [],
    rewrite: {
      model_views: modelViewsResult.data ?? [],
      modes: modesResult.data ?? [],
      length_presets: lengthPresetsResult.data ?? [],
      workflows: workflowsResult.data ?? [],
      fixed_modes: fixedModesResult.data ?? [],
    },
  });
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import { clearFeaturePromptCache } from "@/lib/ai/load-feature-prompt";
import { requireOwnerActor, toNullableString } from "../../ai-channels/_shared";

type RouteContext = {
  params: Promise<{ feature_key: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { feature_key: rawFeatureKey } = await context.params;
  const featureKey = decodeURIComponent(rawFeatureKey ?? "").trim();
  if (!featureKey) {
    return NextResponse.json({ error: "缺少 feature_key" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  if (!("system_prompt" in body)) {
    return NextResponse.json({ error: "缺少 system_prompt" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("ai_feature_config")
    .update({ system_prompt: toNullableString(body.system_prompt) })
    .eq("feature_key", featureKey)
    .select("id, feature_key, label, channel_id, model, system_prompt, is_enabled, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "功能配置不存在" }, { status: 404 });
  }

  clearFeaturePromptCache(featureKey);
  aiClientInternal.resetCache();

  return NextResponse.json({ feature: data });
}

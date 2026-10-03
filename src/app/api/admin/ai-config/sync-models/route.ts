import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "../../ai-channels/_shared";
import { getModelDisplayName } from "@/lib/ai/model-families";

const DEFAULT_RECOMMENDED_MODELS: Record<string, string[]> = {
  claude: ["claude-3-5-sonnet-20241022", "claude-5-sonnet"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  gemini: ["gemini-3.6-flash", "gemini-2.5-flash"],
  qwen: ["qwen-3.8-max"],
};

export async function POST(req: NextRequest) {
  const auth = await requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = auth.supabase;

  const body = await req.json().catch(() => ({}));
  const keyId = toTrimmedString(body.keyId || body.key_id);

  if (!keyId) {
    return NextResponse.json({ error: "缺少 keyId" }, { status: 400 });
  }

  // 1. 获取该 key 及其关联的 provider
  const { data: keyData, error: keyErr } = await supabase
    .from("ai_provider_keys")
    .select("id, label, api_key, available_models, provider_id, provider:ai_providers(id, name, base_url)")
    .eq("id", keyId)
    .single();

  if (keyErr || !keyData) {
    return NextResponse.json({ error: keyErr?.message || "密钥不存在" }, { status: 404 });
  }

  const provider = Array.isArray(keyData.provider) ? keyData.provider[0] : keyData.provider;
  let targetModelIds: string[] = [];

  if (Array.isArray(body.modelIds) && body.modelIds.length > 0) {
    targetModelIds = Array.from(
      new Set(
        (body.modelIds as unknown[])
          .map((id: unknown) => toTrimmedString(id))
          .filter((id: string) => Boolean(id)),
      ),
    );
  } else {
    // 自动发现：尝试调用 /models
    if (provider?.base_url && keyData.api_key) {
      try {
        const baseUrlClean = provider.base_url.replace(/\/+$/, "");
        const targetUrl = baseUrlClean.endsWith("/models") ? baseUrlClean : `${baseUrlClean}/models`;
        const res = await fetch(targetUrl, {
          headers: { Authorization: `Bearer ${keyData.api_key}` },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const payload = (await res.json()) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
          const list = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
          targetModelIds = list.map((item) => toTrimmedString(item?.id)).filter(Boolean);
        }
      } catch {
        // 请求失败时走默认推荐
      }
    }

    // 若远程拉取为空，按 Provider 特征选取推荐模型
    if (targetModelIds.length === 0) {
      const pName = (provider?.name || "").toLowerCase();
      const pUrl = (provider?.base_url || "").toLowerCase();

      if (pName.includes("claude") || pUrl.includes("anthropic")) {
        targetModelIds = DEFAULT_RECOMMENDED_MODELS.claude;
      } else if (pName.includes("deepseek") || pUrl.includes("deepseek") || pName.includes("硅基流动") || pUrl.includes("siliconflow")) {
        targetModelIds = DEFAULT_RECOMMENDED_MODELS.deepseek;
      } else if (pName.includes("openai") || pUrl.includes("openai")) {
        targetModelIds = DEFAULT_RECOMMENDED_MODELS.openai;
      } else if (pName.includes("gemini") || pUrl.includes("google")) {
        targetModelIds = DEFAULT_RECOMMENDED_MODELS.gemini;
      } else {
        // 默认混合主流模型
        targetModelIds = [
          "claude-3-5-sonnet-20241022",
          "deepseek-chat",
          "gpt-4o-mini",
        ];
      }
    }
  }

  // 2. 将模型批量插入/更新到 ai_provider_key_models
  const { data: existingModels } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id")
    .eq("key_id", keyId);

  const existingMap = new Map((existingModels ?? []).map((m: { id: string; model_id: string }) => [m.model_id, m.id])); // gate:transient-map 请求处理内部临时查重索引，随请求生命周期释放
  const toInsert = targetModelIds.filter((mId) => !existingMap.has(mId));

  const nowIso = new Date().toISOString();
  if (toInsert.length > 0) {
    await supabase.from("ai_provider_key_models").insert(
      toInsert.map((mId) => ({
        key_id: keyId,
        model_id: mId,
        display_name: getModelDisplayName(mId),
        is_enabled: true,
        created_at: nowIso,
      }))
    );
  }

  // 更新已存在的模型为启用
  if (targetModelIds.length > 0) {
    await supabase
      .from("ai_provider_key_models")
      .update({ is_enabled: true })
      .eq("key_id", keyId)
      .in("model_id", targetModelIds);
  }

  // 同步更新 ai_provider_keys.available_models
  await supabase
    .from("ai_provider_keys")
    .update({ available_models: targetModelIds })
    .eq("id", keyId);

  // 3. 返回新启用的模型列表
  const { data: finalModels } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, display_name")
    .eq("key_id", keyId)
    .in("model_id", targetModelIds);

  const newModels = (finalModels ?? []).map((m: { id: string; model_id: string; display_name: string | null }) => ({
    id: m.id,
    model_id: m.model_id,
    displayName: m.display_name || getModelDisplayName(m.model_id),
  }));

  return NextResponse.json({
    ok: true,
    newModels,
  });
}

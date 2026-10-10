import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 临时 API：清理渠道的脏数据
 * 用于修复 DeepSeek 渠道挂载了不属于它的模型的问题
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 验证管理员权限
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { keyId, dryRun = true } = body;

  if (!keyId) {
    return NextResponse.json({ error: "缺少 keyId" }, { status: 400 });
  }

  // 查询渠道信息
  const { data: keyData, error: keyError } = await supabase
    .from("ai_provider_keys")
    .select("id, label")
    .eq("id", keyId)
    .single();

  if (keyError || !keyData) {
    return NextResponse.json({ error: "渠道不存在" }, { status: 404 });
  }

  // 查询该渠道的所有模型
  const { data: models, error: modelsError } = await supabase
    .from("ai_provider_key_models")
    .select("id, model_id, display_name, is_enabled")
    .eq("key_id", keyId);

  if (modelsError) {
    return NextResponse.json({ error: modelsError.message }, { status: 500 });
  }

  // 分类：属于该渠道的模型 vs 不属于的模型
  const channelName = (keyData as { label: string }).label.toLowerCase();
  const belongToChannel = (models || []).filter((m) => {
    const modelId = m.model_id.toLowerCase();
    // 如果渠道名包含某个品牌，只保留该品牌的模型
    if (channelName.includes("deepseek")) return modelId.includes("deepseek");
    if (channelName.includes("gemini")) return modelId.includes("gemini");
    if (channelName.includes("claude")) return modelId.includes("claude");
    if (channelName.includes("gpt") || channelName.includes("chatgpt"))
      return modelId.includes("gpt") || modelId.includes("chatgpt");
    // 如果渠道名不明确，保留所有模型（不自动删除）
    return true;
  });

  const notBelong = (models || []).filter(
    (m) => !belongToChannel.find((b) => b.id === m.id)
  );

  if (dryRun) {
    // 只读模式：返回分析结果
    return NextResponse.json({
      dryRun: true,
      keyId,
      keyLabel: (keyData as { label: string }).label,
      totalModels: models?.length || 0,
      belongToChannel: belongToChannel.length,
      notBelong: notBelong.length,
      toDelete: notBelong.map((m) => ({
        id: m.id,
        modelId: m.model_id,
        displayName: m.display_name,
        isEnabled: m.is_enabled,
      })),
    });
  }

  // 执行删除
  if (notBelong.length > 0) {
    const { error: deleteError } = await supabase
      .from("ai_provider_key_models")
      .delete()
      .in(
        "id",
        notBelong.map((m) => m.id)
      );

    if (deleteError) {
      return NextResponse.json(
        { error: `删除失败：${deleteError.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    keyId,
    keyLabel: (keyData as { label: string }).label,
    deleted: notBelong.length,
    remaining: belongToChannel.length,
  });
}

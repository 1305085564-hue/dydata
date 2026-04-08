import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { callStructuredAi, extractJsonString } from "@/lib/ai/shared";

const PROMPT_VERSION = "growth-daily-v1";

type GrowthInsightResult = {
  diagnosis: string;
  scene: string;
  cause: string;
  rewrite: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseInsight(jsonString: string): GrowthInsightResult | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (!isRecord(parsed)) return null;
    const { diagnosis, scene, cause, rewrite } = parsed;
    if (!isNonEmptyString(diagnosis) || !isNonEmptyString(scene) || !isNonEmptyString(cause) || !isNonEmptyString(rewrite)) return null;
    return {
      diagnosis: String(diagnosis).trim(),
      scene: String(scene).trim(),
      cause: String(cause).trim(),
      rewrite: String(rewrite).trim(),
    };
  } catch {
    return null;
  }
}

function buildPrompt(bundle: Record<string, unknown>): string {
  return [
    "你是抖音增长教练。根据以下昨日视频数据，输出单视频复盘洞察。",
    "说话直接、短句、基于证据，不要安慰，不要鸡汤，不要正确的废话。",
    "",
    "硬性要求：",
    "1. 只输出 JSON 对象，不要 Markdown，不要代码块，不要额外说明。",
    '2. JSON 格式固定为 {"diagnosis":"...","scene":"...","cause":"...","rewrite":"..."}',
    "3. diagnosis：一句话定位核心问题，20字以内，必须点名最差指标。",
    "4. scene：案发现场，说明数据异常的具体位置和表现，引用具体数字。",
    "5. cause：归因，结合文案内容和曲线描述分析为什么会这样。",
    "6. rewrite：针对文案给出具体段落的改写示例，要有前后对比，直接可用。",
    "",
    "昨日视频数据：",
    JSON.stringify(bundle, null, 2),
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!isRecord(body) || !isNonEmptyString(body.date)) {
    return NextResponse.json({ error: "缺少 date 参数" }, { status: 400 });
  }

  const targetDate = String(body.date).trim();
  const userId = user.id;

  // 使用 service role 绕过 RLS 读写 AI 表
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 缓存检查：同用户同日期已有成功结果则直接返回
  const { data: cached } = await serviceClient
    .from("ai_insight_result")
    .select("result_json, rendered_text")
    .eq("insight_type", "growth_edit")
    .eq("result_status", "success")
    .contains("result_json", { meta_user_id: userId, meta_date: targetDate })
    .order("created_at", { ascending: false })
    .limit(1);

  if (cached && cached.length > 0 && cached[0].result_json) {
    const r = cached[0].result_json as Record<string, unknown>;
    const insight = parseInsight(JSON.stringify(r));
    if (insight) return NextResponse.json({ insight, cached: true });
  }

  // 查昨日数据报告
  const { data: reports } = await serviceClient
    .from("daily_reports")
    .select("play_count, likes, comments, shares, favorites, follower_gain, completion_rate, completion_rate_5s, content, account_id")
    .eq("user_id", userId)
    .eq("report_date", targetDate)
    .limit(1);

  if (!reports || reports.length === 0) {
    return NextResponse.json({ insight: null, reason: "no_data" });
  }

  const report = reports[0];

  // 查 content_item → script_document 获取文案和曲线描述
  const { data: contentItems } = await serviceClient
    .from("content_item")
    .select("id, account_id")
    .eq("owner_user_id", userId)
    .eq("biz_date", targetDate)
    .limit(1);

  let rawText: string | null = null;
  let trafficCurveDesc: string | null = null;
  let retentionCurveDesc: string | null = null;

  if (contentItems && contentItems.length > 0) {
    const contentItemId = contentItems[0].id;

    const { data: scriptDocs } = await serviceClient
      .from("script_document")
      .select("raw_text")
      .eq("content_item_id", contentItemId)
      .limit(1);

    rawText = scriptDocs?.[0]?.raw_text ?? null;

    // 尝试从 ocr_result 表获取曲线图描述（若表存在）
    // 如不存在则跳过，不影响主流程
    try {
      const { data: ocrAssets } = await serviceClient
        .from("content_asset")
        .select("asset_role, ocr_result_json")
        .eq("content_item_id", contentItemId)
        .in("asset_role", ["traffic_curve", "retention_curve"]);

      if (ocrAssets) {
        trafficCurveDesc = ocrAssets.find((a: { asset_role: string }) => a.asset_role === "traffic_curve")?.ocr_result_json?.text ?? null;
        retentionCurveDesc = ocrAssets.find((a: { asset_role: string }) => a.asset_role === "retention_curve")?.ocr_result_json?.text ?? null;
      }
    } catch {
      // content_asset 查询失败，跳过
    }
  }

  const inputBundle: Record<string, unknown> = {
    meta_user_id: userId,
    meta_date: targetDate,
    metrics: {
      play_count: report.play_count,
      follower_gain: report.follower_gain,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
      completion_rate: report.completion_rate,
      completion_rate_5s: report.completion_rate_5s,
    },
    script_raw_text: rawText ?? report.content ?? null,
    traffic_curve_description: trafficCurveDesc,
    retention_curve_description: retentionCurveDesc,
  };

  // 写入 ai_input_bundle
  const { data: bundleRow, error: bundleError } = await serviceClient
    .from("ai_input_bundle")
    .insert({
      insight_scope: "single_video",
      scope_entity_id: report.account_id ?? null,
      input_version: 1,
      data_quality_state: rawText ? "sufficient" : "partial",
      input_json: inputBundle,
    })
    .select("id")
    .single();

  if (bundleError || !bundleRow) {
    return NextResponse.json({ error: "写入输入包失败" }, { status: 500 });
  }

  const inputBundleId: string = bundleRow.id;

  try {
    const prompt = buildPrompt(inputBundle);
    const aiResult = await callStructuredAi({ prompt, maxTokens: 1200, featureKey: "growth_insight" });
    const insight = parseInsight(aiResult.jsonString);

    if (!insight) {
      await serviceClient.from("ai_insight_result").insert({
        input_bundle_id: inputBundleId,
        insight_type: "growth_edit",
        model_name: aiResult.model,
        prompt_version: PROMPT_VERSION,
        result_status: "failed",
        result_json: { error: "解析失败", raw: aiResult.rawContent },
        rendered_text: "AI 返回内容解析失败",
      });
      return NextResponse.json({ error: "AI 返回内容解析失败" }, { status: 500 });
    }

    const resultJson = { ...insight, meta_user_id: userId, meta_date: targetDate };

    await serviceClient.from("ai_insight_result").insert({
      input_bundle_id: inputBundleId,
      insight_type: "growth_edit",
      model_name: aiResult.model,
      prompt_version: PROMPT_VERSION,
      result_status: "success",
      result_json: resultJson,
      rendered_text: Object.values(insight).join(" | "),
    });

    return NextResponse.json({ insight, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";
    await serviceClient.from("ai_insight_result").insert({
      input_bundle_id: inputBundleId,
      insight_type: "growth_edit",
      model_name: process.env.AI_MODEL || "claude-sonnet-4-6",
      prompt_version: PROMPT_VERSION,
      result_status: "failed",
      result_json: { error: message },
      rendered_text: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

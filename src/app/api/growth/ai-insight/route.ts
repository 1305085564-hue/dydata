import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { callStructuredAi } from "@/lib/ai/shared";
import { buildGrowthInsightPrompt, GROWTH_INSIGHT_PROMPT_VERSION } from "@/lib/ai/growth-prompts";

type GrowthInsightResult = {
  diagnosis: string;
  scene: string;
  cause: string;
  rewrite: string;
};

type GrowthInsightCacheRow = {
  prompt_version?: string | null;
  result_json?: unknown;
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

export function canReuseGrowthInsightCache(
  row: GrowthInsightCacheRow | null | undefined,
  promptVersion: string = GROWTH_INSIGHT_PROMPT_VERSION,
) {
  if (!row || row.prompt_version !== promptVersion || !isRecord(row.result_json)) {
    return null;
  }

  return parseInsight(JSON.stringify(row.result_json));
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "服务端配置缺失" }, { status: 500 });
  }
  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  // 缓存检查：同用户同日期已有成功结果则直接返回
  const { data: cached } = await serviceClient
    .from("ai_insight_result")
    .select("prompt_version, result_json, rendered_text")
    .eq("insight_type", "growth_edit")
    .eq("result_status", "success")
    .eq("prompt_version", GROWTH_INSIGHT_PROMPT_VERSION)
    .contains("result_json", { meta_user_id: userId, meta_date: targetDate })
    .order("created_at", { ascending: false })
    .limit(1);

  if (cached && cached.length > 0) {
    const insight = canReuseGrowthInsightCache(cached[0]);
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

    // TODO: content_asset 表尚未包含 asset_role/ocr_result_json 列，等 migration 补上后再启用 OCR 曲线描述
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
    const prompt = buildGrowthInsightPrompt(inputBundle);
    const aiResult = await callStructuredAi({ prompt, maxTokens: 1200, featureKey: "growth_insight" });
    const insight = parseInsight(aiResult.jsonString);

    if (!insight) {
      await serviceClient.from("ai_insight_result").insert({
        input_bundle_id: inputBundleId,
        insight_type: "growth_edit",
        model_name: aiResult.model,
        prompt_version: GROWTH_INSIGHT_PROMPT_VERSION,
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
      prompt_version: GROWTH_INSIGHT_PROMPT_VERSION,
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
      prompt_version: GROWTH_INSIGHT_PROMPT_VERSION,
      result_status: "failed",
      result_json: { error: message },
      rendered_text: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

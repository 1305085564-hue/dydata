import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeAiTagSuggestions, type RawAiTagSuggestion } from "@/lib/video-tags";
import type { SubmissionAssetMeta } from "@/types";

type VideoSubmitRequestBody = {
  account_id?: string;
  video_url?: string | null;
  video_title?: string | null;
  content?: string | null;
  published_at?: string | null;
  published_at_text?: string | null;
  biz_date?: string | null;
  anomaly_status?: string | null;
  topic_tag?: string | null;
  content_keywords?: string[];
  assets?: SubmissionAssetMeta[];
  metrics?: {
    play_count?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    favorites?: number;
    follower_gain?: number;
    follower_loss?: number;
    follower_convert?: number;
    avg_play_duration?: number;
    bounce_rate_2s?: number;
    completion_rate_5s?: number;
    completion_rate?: number;
  };
};

type UpstreamSuccessResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type OpenAICompatibleMessageContentBlock = {
  type?: string;
  text?: string;
};

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDateOnly(value: unknown, fallback = getTodayDateString()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }

  return value;
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTodayDateString(now: Date = new Date()) {
  return now.toISOString().split("T")[0];
}

function buildUpstreamUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

function safeJsonParse(rawText: string): JsonObject | null {
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = (content as OpenAICompatibleMessageContentBlock[])
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text?.trim() || "")
      .filter(Boolean)
      .join("\n");

    return text || null;
  }

  return null;
}

function extractJson(content: string): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return content.slice(start, end + 1);
}

function parseAiTagContent(content: unknown): RawAiTagSuggestion[] {
  const normalizedContent = normalizeMessageContent(content);
  if (!normalizedContent) {
    return [];
  }

  const jsonText = extractJson(normalizedContent);
  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText) as { tags?: RawAiTagSuggestion[] };
    return Array.isArray(parsed.tags) ? parsed.tags : [];
  } catch {
    return [];
  }
}

function buildTagPrompt(content: string) {
  return [
    "你是抖音视频标签助手。",
    "请根据视频文案，为该视频选择 3 个标签维度。",
    "只能从给定枚举中选择，不允许自由发挥，不允许新增标签。",
    "返回 JSON，对象结构固定为 { \"tags\": [...] }。",
    "每个标签对象都必须包含 tag_dimension、tag_value、confidence、reason。",
    "confidence 为 0 到 1 的数字。",
    "可选维度与枚举：",
    "1. 题材：大盘复盘 / 板块机会 / 个股拆解 / 情绪周期 / 战法教学 / 风险提醒 / 热点追踪 / 盘前预判",
    "2. 表达形式：结论先行 / 问答式 / 清单式 / 案例拆解 / 情绪点评 / 故事引入 / 观点输出",
    "3. CTA类型：关注 / 评论 / 私信 / 看主页 / 进群 / 无明显CTA",
    "必须且仅返回这 3 个维度，每个维度只返回 1 个标签。",
    "只返回 JSON，不要 markdown，不要额外解释。",
    "示例：",
    JSON.stringify({
      tags: [
        { tag_dimension: "题材", tag_value: "大盘复盘", confidence: 0.92, reason: "围绕指数走势与盘面总结展开" },
        { tag_dimension: "表达形式", tag_value: "结论先行", confidence: 0.83, reason: "开头先给出核心观点" },
        { tag_dimension: "CTA类型", tag_value: "无明显CTA", confidence: 0.71, reason: "文案中未见明确引导动作" },
      ],
    }),
    "视频文案：",
    content,
  ].join("\n");
}

async function generateAiTags(content: string) {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "claude-sonnet-4-6";

  if (!baseUrl || !apiKey) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const aiRes = await fetch(buildUpstreamUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildTagPrompt(content) }],
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!aiRes.ok) {
      return [];
    }

    const rawText = await aiRes.text();
    const aiData = safeJsonParse(rawText) as UpstreamSuccessResponse | null;
    const contentBlocks = aiData?.choices?.[0]?.message?.content;
    return normalizeAiTagSuggestions(parseAiTagContent(contentBlocks));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: VideoSubmitRequestBody;

  try {
    body = (await request.json()) as VideoSubmitRequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const account_id = typeof body.account_id === "string" ? body.account_id : "";

  if (!account_id) {
    return NextResponse.json({ error: "account_id 为必填项" }, { status: 400 });
  }

  const metrics = body.metrics ?? {};
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const bizDate = normalizeDateOnly(body.biz_date);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const submitter = profile?.name ?? "未知";
  const anomaly_status = normalizeOptionalText(body.anomaly_status) ?? "正常";

  const videoPayload = {
    account_id,
    user_id: user.id,
    video_url: normalizeOptionalText(body.video_url),
    video_title: normalizeOptionalText(body.video_title),
    content: normalizeOptionalText(body.content),
    published_at: normalizeOptionalDate(body.published_at),
    anomaly_status,
  };

  const { data: newVideo, error: videoError } = await supabase
    .from("videos")
    .insert(videoPayload)
    .select("*")
    .single();

  if (videoError || !newVideo) {
    return NextResponse.json({ error: videoError?.message || "视频记录创建失败" }, { status: 500 });
  }

  const screenshotUrls = assets
    .filter((asset) => asset.role === "overview" || asset.role === "engagement_extra" || asset.role === "other")
    .map((asset) => asset.url);
  const curveScreenshotUrl = assets.find((asset) => asset.role === "traffic_curve")?.url ?? null;
  const retentionScreenshotUrl = assets.find((asset) => asset.role === "retention_curve")?.url ?? null;

  const snapshotPayload = {
    video_id: newVideo.id,
    snapshot_type: "24h",
    play_count: normalizeNumber(metrics.play_count),
    likes: normalizeNumber(metrics.likes),
    comments: normalizeNumber(metrics.comments),
    shares: normalizeNumber(metrics.shares),
    favorites: normalizeNumber(metrics.favorites),
    follower_gain: normalizeNumber(metrics.follower_gain),
    follower_loss: normalizeNumber(metrics.follower_loss),
    follower_convert: normalizeNumber(metrics.follower_convert),
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: normalizeNumber(metrics.avg_play_duration),
    completion_rate: normalizeNumber(metrics.completion_rate),
    bounce_rate_2s: normalizeNumber(metrics.bounce_rate_2s),
    completion_rate_5s: normalizeNumber(metrics.completion_rate_5s),
    avg_play_ratio: null,
    vs_previous: body.published_at_text ? { published_at_text: body.published_at_text } : null,
    screenshot_urls: screenshotUrls.length ? screenshotUrls : null,
    curve_screenshot_url: curveScreenshotUrl,
    retention_screenshot_url: retentionScreenshotUrl,
  };

  const { error: snapshotError } = await supabase
    .from("video_metrics_snapshots")
    .insert(snapshotPayload);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 500 });
  }

  const dailyReportPayload = {
    user_id: user.id,
    report_date: bizDate,
    title: videoPayload.video_title || "视频提交",
    submitter,
    play_count: normalizeNumber(metrics.play_count),
    likes: normalizeNumber(metrics.likes),
    comments: normalizeNumber(metrics.comments),
    shares: normalizeNumber(metrics.shares),
    favorites: normalizeNumber(metrics.favorites),
    follower_gain: normalizeNumber(metrics.follower_gain),
    follower_convert: normalizeNumber(metrics.follower_convert),
    completion_rate: metrics.completion_rate == null ? null : `${normalizeNumber(metrics.completion_rate)}%`,
    avg_play_duration:
      metrics.avg_play_duration == null ? null : `${normalizeNumber(metrics.avg_play_duration)}秒`,
    bounce_rate_2s:
      metrics.bounce_rate_2s == null ? null : `${normalizeNumber(metrics.bounce_rate_2s)}%`,
    completion_rate_5s:
      metrics.completion_rate_5s == null ? null : `${normalizeNumber(metrics.completion_rate_5s)}%`,
    content: videoPayload.content,
    published_at: videoPayload.published_at,
    uploaded_at: new Date().toISOString(),
    account_id,
  };

  const { error: dailyReportError } = await supabase
    .from("daily_reports")
    .insert(dailyReportPayload);

  if (dailyReportError) {
    return NextResponse.json({ error: dailyReportError.message }, { status: 500 });
  }

  const aiTags = videoPayload.content ? await generateAiTags(videoPayload.content) : [];

  if (aiTags.length) {
    await supabase.from("video_tags").upsert(
      aiTags.map((tag) => ({
        video_id: newVideo.id,
        tag_dimension: tag.tag_dimension,
        tag_value: tag.tag_value,
        source: "ai" as const,
        confidence: tag.confidence,
        reason: tag.reason,
        reviewed_by: null,
      })),
      { onConflict: "video_id,tag_dimension" }
    );
  }

  const manualTags: Array<{ video_id: string; tag_dimension: string; tag_value: string; source: string; confidence: null; reason: null; reviewed_by: null }> = [];

  if (body.topic_tag) {
    manualTags.push({
      video_id: newVideo.id,
      tag_dimension: "话题",
      tag_value: body.topic_tag,
      source: "manual",
      confidence: null,
      reason: null,
      reviewed_by: null,
    });
  }

  if (Array.isArray(body.content_keywords)) {
    for (const kw of body.content_keywords.slice(0, 3)) {
      if (typeof kw === "string" && kw.trim()) {
        manualTags.push({
          video_id: newVideo.id,
          tag_dimension: "关键词",
          tag_value: kw.trim(),
          source: "manual",
          confidence: null,
          reason: null,
          reviewed_by: null,
        });
      }
    }
  }

  if (manualTags.length) {
    await supabase.from("video_tags").upsert(manualTags, { onConflict: "video_id,tag_dimension" });
  }

  return NextResponse.json({ ok: true, video: newVideo, ai_tags: aiTags });
}

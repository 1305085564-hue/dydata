import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiJson } from "@/lib/ai/client";
import { normalizeAiTagSuggestions, type RawAiTagSuggestion } from "@/lib/video-tags";
import { replaceDailyReportUsageRecord } from "@/lib/conversion-hub/service";
import { buildManualTagPayload, dedupeTagPayloads } from "./tag-payload";
import { validateVideoSubmitPayload } from "./validation";
import { buildSubmissionRecordId } from "./stability";

type RollbackAction = () => Promise<void>;

function stripId<T extends Record<string, unknown>>(row: T) {
  const rest = { ...row };
  delete rest.id;
  return rest;
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
  try {
    const result = await callAiJson(buildTagPrompt(content), { maxTokens: 1200, timeoutMs: 12000, featureKey: "video_tag" });
    const jsonText = extractJsonFromContent(result.content);
    if (!jsonText) return [];
    const parsed = JSON.parse(jsonText) as { tags?: RawAiTagSuggestion[] };
    return normalizeAiTagSuggestions(Array.isArray(parsed.tags) ? parsed.tags : []);
  } catch {
    return [];
  }
}

function extractJsonFromContent(content: string): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1);
}

async function rollbackSafely(actions: RollbackAction[]) {
  for (const action of [...actions].reverse()) {
    try {
      await action();
    } catch {
      // 回滚失败不覆盖主错误，尽量回收剩余已知状态。
    }
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const validationResult = validateVideoSubmitPayload(body);
  if (!validationResult.ok) {
    return NextResponse.json({ error: validationResult.error }, { status: 400 });
  }

  const normalized = validationResult.normalized;

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, profile_id")
    .eq("id", normalized.account_id)
    .single();

  if (accountError || !account || account.profile_id !== user.id) {
    return NextResponse.json({ error: "账号不存在或无权限提交" }, { status: 403 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const submitter = profile?.name ?? "未知";
  const submissionVideoId = buildSubmissionRecordId(normalized);
  const nowIso = new Date().toISOString();
  const rollbackActions: RollbackAction[] = [];

  const videoPayload = {
    id: submissionVideoId,
    account_id: normalized.account_id,
    user_id: user.id,
    video_url: normalized.video_url,
    video_title: normalized.video_title,
    content: normalized.content,
    published_at: normalized.published_at,
    uploaded_at: nowIso,
    anomaly_status: normalized.anomaly_status,
    punish_type: normalized.punish_type,
    platform_notice: normalized.platform_notice,
    appeal: normalized.appeal,
    topic_id: normalized.topic_id,
  };

  const { data: existingVideo, error: existingVideoError } = await supabase
    .from("videos")
    .select("id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, punish_type, platform_notice, appeal, topic_id, created_at")
    .eq("id", submissionVideoId)
    .maybeSingle();

  if (existingVideoError) {
    return NextResponse.json({ error: existingVideoError.message }, { status: 500 });
  }

  if (existingVideo) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("videos").update(stripId(existingVideo)).eq("id", existingVideo.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("videos").delete().eq("id", submissionVideoId);
      if (error) throw error;
    });
  }

  const { data: persistedVideo, error: videoError } = existingVideo
    ? await supabase.from("videos").update(stripId(videoPayload)).eq("id", submissionVideoId).select("*").single()
    : await supabase.from("videos").insert(videoPayload).select("*").single();

  if (videoError || !persistedVideo) {
    await rollbackSafely(rollbackActions);
    return NextResponse.json({ error: videoError?.message || "视频记录创建失败" }, { status: 500 });
  }

  const screenshotUrls = normalized.assets.map((asset) => asset.url);
  const ocrSummary = normalized.assets.reduce<Record<string, unknown>>((acc, asset) => {
    const fields = asset.recognized_fields;
    if (fields) {
      acc[asset.role] = fields;
    }
    return acc;
  }, {});
  const ocrAssets = normalized.assets.map((asset) => ({
    role: asset.role,
    screenshot_type: asset.screenshot_type ?? null,
    confidence_score: asset.confidence_score ?? null,
    confirmed: Boolean(asset.confirmed),
    recognized_fields: asset.recognized_fields ?? null,
  }));

  const curveScreenshotUrl = normalized.assets.find((asset) => asset.role === "screenshot_2")?.url ?? null;
  const retentionScreenshotUrl = normalized.assets.find((asset) => asset.role === "screenshot_2")?.url ?? null;

  const snapshotPayload = {
    video_id: persistedVideo.id,
    snapshot_type: "24h",
    play_count: normalized.metrics.play_count,
    likes: normalized.metrics.likes,
    comments: normalized.metrics.comments,
    shares: normalized.metrics.shares,
    favorites: normalized.metrics.favorites,
    follower_gain: normalized.metrics.follower_gain,
    follower_loss: normalized.metrics.follower_loss,
    follower_convert: normalized.metrics.follower_convert,
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: normalized.metrics.avg_play_duration,
    completion_rate: normalized.metrics.completion_rate,
    bounce_rate_2s: normalized.metrics.bounce_rate_2s,
    completion_rate_5s: normalized.metrics.completion_rate_5s,
    avg_play_ratio: null,
    vs_previous: normalized.published_at_text || Object.keys(ocrSummary).length || ocrAssets.length
      ? {
          published_at_text: normalized.published_at_text ?? null,
          ocr_summary: Object.keys(ocrSummary).length ? ocrSummary : null,
          ocr_assets: ocrAssets.length ? ocrAssets : null,
        }
      : null,
    screenshot_urls: screenshotUrls.length ? screenshotUrls : null,
    curve_screenshot_url: curveScreenshotUrl,
    retention_screenshot_url: retentionScreenshotUrl,
  };

  const { data: existingSnapshot, error: existingSnapshotError } = await supabase
    .from("video_metrics_snapshots")
    .select(
      "id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url, captured_at"
    )
    .eq("video_id", persistedVideo.id)
    .eq("snapshot_type", "24h")
    .maybeSingle();

  if (existingSnapshotError) {
    await rollbackSafely(rollbackActions);
    return NextResponse.json({ error: existingSnapshotError.message }, { status: 500 });
  }

  if (existingSnapshot) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("video_metrics_snapshots").update(stripId(existingSnapshot)).eq("id", existingSnapshot.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      const { error } = await supabase
        .from("video_metrics_snapshots")
        .delete()
        .eq("video_id", persistedVideo.id)
        .eq("snapshot_type", "24h");
      if (error) throw error;
    });
  }

  const { data: persistedSnapshot, error: snapshotError } = existingSnapshot
    ? await supabase.from("video_metrics_snapshots").update(snapshotPayload).eq("id", existingSnapshot.id).select("*").single()
    : await supabase.from("video_metrics_snapshots").insert(snapshotPayload).select("*").single();

  if (snapshotError || !persistedSnapshot) {
    await rollbackSafely(rollbackActions);
    return NextResponse.json({ error: snapshotError?.message || "视频快照创建失败" }, { status: 500 });
  }

  const dailyReportPayload = {
    user_id: user.id,
    report_date: normalized.biz_date,
    title: normalized.video_title || "视频提交",
    submitter,
    play_count: normalized.metrics.play_count,
    likes: normalized.metrics.likes,
    comments: normalized.metrics.comments,
    shares: normalized.metrics.shares,
    favorites: normalized.metrics.favorites,
    follower_gain: normalized.metrics.follower_gain,
    follower_convert: normalized.metrics.follower_convert,
    completion_rate: `${normalized.metrics.completion_rate}%`,
    avg_play_duration: `${normalized.metrics.avg_play_duration}秒`,
    bounce_rate_2s: `${normalized.metrics.bounce_rate_2s}%`,
    completion_rate_5s: `${normalized.metrics.completion_rate_5s}%`,
    content: normalized.content,
    published_at: normalized.published_at,
    uploaded_at: nowIso,
    account_id: normalized.account_id,
  };

  const { data: existingReport, error: existingReportError } = await supabase
    .from("daily_reports")
    .select(
      "id, user_id, account_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
    )
    .eq("account_id", normalized.account_id)
    .eq("report_date", normalized.biz_date)
    .maybeSingle();

  if (existingReportError) {
    await rollbackSafely(rollbackActions);
    return NextResponse.json({ error: existingReportError.message }, { status: 500 });
  }

  if (existingReport) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("daily_reports").update(stripId(existingReport)).eq("id", existingReport.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      const { error } = await supabase
        .from("daily_reports")
        .delete()
        .eq("account_id", normalized.account_id)
        .eq("report_date", normalized.biz_date);
      if (error) throw error;
    });
  }

  const { data: persistedReport, error: dailyReportError } = existingReport
    ? await supabase.from("daily_reports").update(dailyReportPayload).eq("id", existingReport.id).select("*").single()
    : await supabase.from("daily_reports").insert(dailyReportPayload).select("*").single();

  if (dailyReportError || !persistedReport) {
    await rollbackSafely(rollbackActions);
    return NextResponse.json({ error: dailyReportError?.message || "日报记录创建失败" }, { status: 500 });
  }

  const previousTagsResult = await supabase
    .from("video_tags")
    .select("id, video_id, tag_dimension, tag_value, source, confidence, reason, reviewed_by, created_at")
    .eq("video_id", persistedVideo.id);

  if (previousTagsResult.error) {
    await rollbackSafely(rollbackActions);
    return NextResponse.json({ error: previousTagsResult.error.message }, { status: 500 });
  }

  const previousTags = previousTagsResult.data ?? [];
  rollbackActions.push(async () => {
    const { error: deleteError } = await supabase.from("video_tags").delete().eq("video_id", persistedVideo.id);
    if (deleteError) throw deleteError;

    if (!previousTags.length) {
      return;
    }

    const { error: insertError } = await supabase.from("video_tags").insert(previousTags);
    if (insertError) throw insertError;
  });

  const aiTags = await generateAiTags(normalized.content);

  if (aiTags.length) {
    const aiTagPayload = dedupeTagPayloads(
      aiTags.map((tag) => ({
        video_id: persistedVideo.id,
        tag_dimension: tag.tag_dimension,
        tag_value: tag.tag_value,
        source: "ai" as const,
        confidence: tag.confidence,
        reason: tag.reason,
        reviewed_by: null,
      }))
    );

    const aiDimensions = [...new Set(aiTagPayload.map((tag) => tag.tag_dimension))];
    const { error: deleteAiTagError } = await supabase
      .from("video_tags")
      .delete()
      .eq("video_id", persistedVideo.id)
      .in("tag_dimension", aiDimensions);

    if (deleteAiTagError) {
      await rollbackSafely(rollbackActions);
      return NextResponse.json({ error: deleteAiTagError.message }, { status: 500 });
    }

    const { error: insertAiTagError } = await supabase.from("video_tags").insert(aiTagPayload);

    if (insertAiTagError) {
      await rollbackSafely(rollbackActions);
      return NextResponse.json({ error: insertAiTagError.message }, { status: 500 });
    }
  }

  const manualTags = buildManualTagPayload({
    videoId: persistedVideo.id,
    topicTag: normalized.topic_tag,
    videoForm: normalized.video_form,
    contentKeywords: normalized.content_keywords,
  });

  if (manualTags.length) {
    const { error: deleteManualTagError } = await supabase
      .from("video_tags")
      .delete()
      .eq("video_id", persistedVideo.id)
      .in("tag_dimension", ["话题", "表达形式", "关键词"]);

    if (deleteManualTagError) {
      await rollbackSafely(rollbackActions);
      return NextResponse.json({ error: deleteManualTagError.message }, { status: 500 });
    }

    const { error: insertManualTagError } = await supabase.from("video_tags").insert(manualTags);
    if (insertManualTagError) {
      await rollbackSafely(rollbackActions);
      return NextResponse.json({ error: insertManualTagError.message }, { status: 500 });
    }
  }

  if (normalized.metrics.follower_convert > 0 && normalized.script_text) {
    const usageRecordResult = await replaceDailyReportUsageRecord(createAdminClient(), user.id, {
      case_id: null,
      script_text: normalized.script_text,
      script_format: normalized.script_format,
      account_id: normalized.account_id,
      used_at: normalized.biz_date,
      views: normalized.metrics.play_count,
      follows: normalized.metrics.follower_convert,
      source: "daily_report",
      daily_report_id: persistedReport.id,
      note: null,
    });

    if (!usageRecordResult.ok) {
      await rollbackSafely(rollbackActions);
      return NextResponse.json({ error: usageRecordResult.message }, { status: usageRecordResult.status });
    }
  }

  return NextResponse.json({
    ok: true,
    video_id: persistedVideo.id,
    anomaly_status: normalized.anomaly_status,
    video: persistedVideo,
    ai_tags: aiTags,
    idempotent_video_id: submissionVideoId,
  });
}

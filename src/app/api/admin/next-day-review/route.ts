import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isAdminLevel } from "@/lib/permissions";
import { callStructuredAi } from "@/lib/ai/shared";
import {
  buildAccountBaseline,
  buildNextDayReviewPrompt,
  buildPeerBaselinePlaceholder,
  buildStructuredReviewResult,
  getAnomalyNotice,
  getSampleCredibility,
  parseNextDayReviewResult,
  type ReviewSegmentInput,
} from "@/lib/next-day-review";
import type { NextDayReviewComparison, NextDayReviewMetrics, NextDayReviewResult } from "@/types";

const PROMPT_VERSION = "next-day-review-v1";

type RequestBody = { video_id?: string; force_refresh?: boolean };

type SnapshotLite = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStructuredReview(v: unknown): v is NextDayReviewResult {
  if (!isRecord(v)) return false;
  return v.ok === true && typeof v.video_id === "string" && typeof v.review_status === "string";
}

function errorResponse(message: string, code: string, status = 422) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile || !isAdminLevel(profile.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const videoId = typeof body.video_id === "string" && body.video_id.trim() ? body.video_id.trim() : null;
  if (!videoId) return NextResponse.json({ error: "缺少 video_id" }, { status: 400 });

  const forceRefresh = body.force_refresh === true;

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (!forceRefresh) {
    const { data: cached } = await serviceClient
      .from("ai_insight_result")
      .select("result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success")
      .contains("result_json", { video_id: videoId })
      .order("created_at", { ascending: false })
      .limit(1);

    const cachedJson = cached?.[0]?.result_json;
    if (isStructuredReview(cachedJson)) {
      return NextResponse.json({ ...cachedJson, cached: true });
    }
  }

  const { data: video, error: videoError } = await serviceClient
    .from("videos")
    .select("id, content, anomaly_status, account_id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }

  const { data: snapshots } = await serviceClient
    .from("video_metrics_snapshots")
    .select(
      "play_count,bounce_rate_2s,completion_rate_5s,completion_rate,avg_play_duration,follower_gain,likes,comments,shares",
    )
    .eq("video_id", videoId)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false })
    .limit(1);

  const snapshot = (snapshots?.[0] as SnapshotLite | undefined) ?? null;

  if (!snapshot) {
    return errorResponse("缺少24h数据，暂不能复盘", "NO_24H_SNAPSHOT");
  }

  const content = typeof video.content === "string" ? video.content.trim() : "";
  if (!content) {
    return errorResponse("文案为空，暂不能复盘", "NO_CONTENT");
  }

  const { data: segmentsRaw } = await serviceClient
    .from("video_content_segments")
    .select("segment_order,segment_type,segment_text,estimated_start_sec,estimated_end_sec")
    .eq("video_id", videoId)
    .order("segment_order", { ascending: true });

  const segmentInputs: ReviewSegmentInput[] = (segmentsRaw ?? []).map((s) => ({
    segment_order: s.segment_order ?? 0,
    segment_type: s.segment_type ?? "其他",
    segment_text: s.segment_text ?? "",
    estimated_start_sec: s.estimated_start_sec ?? null,
    estimated_end_sec: s.estimated_end_sec ?? null,
  }));

  if (!segmentInputs.length) {
    return errorResponse("请先完成文案拆段", "NO_SEGMENTS");
  }

  const anomalyStatus = video.anomaly_status;
  const sample = getSampleCredibility(snapshot.play_count, anomalyStatus);
  const anomalyNotice = getAnomalyNotice(anomalyStatus);

  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - 30);

  const { data: accountVideos } = await serviceClient
    .from("videos")
    .select("id")
    .eq("account_id", video.account_id)
    .neq("id", videoId)
    .gte("created_at", since.toISOString())
    .limit(500);

  const accountVideoIds = (accountVideos ?? []).map((row) => row.id).filter(Boolean);

  let baselineRows: SnapshotLite[] = [];
  if (accountVideoIds.length) {
    const { data } = await serviceClient
      .from("video_metrics_snapshots")
      .select("play_count,bounce_rate_2s,completion_rate_5s,completion_rate,avg_play_duration")
      .eq("snapshot_type", "24h")
      .in("video_id", accountVideoIds);
    baselineRows = (data ?? []) as SnapshotLite[];
  }

  const accountBaseline = buildAccountBaseline(baselineRows);
  const comparison: NextDayReviewComparison = {
    account_baseline: accountBaseline,
    peer_baseline: buildPeerBaselinePlaceholder(),
  };

  const metrics: NextDayReviewMetrics = {
    play_count: snapshot.play_count,
    bounce_rate_2s: snapshot.bounce_rate_2s,
    completion_rate_5s: snapshot.completion_rate_5s,
    completion_rate: snapshot.completion_rate,
    avg_play_duration: snapshot.avg_play_duration,
  };

  const prompt = buildNextDayReviewPrompt({
    sample_level: sample.level,
    play_count: snapshot.play_count,
    bounce_rate_2s: snapshot.bounce_rate_2s,
    completion_rate_5s: snapshot.completion_rate_5s,
    completion_rate: snapshot.completion_rate,
    avg_play_duration: snapshot.avg_play_duration,
    follower_gain: snapshot.follower_gain,
    likes: snapshot.likes,
    comments: snapshot.comments,
    shares: snapshot.shares,
    anomaly_status: anomalyStatus,
    script_raw_text: content,
    segments: segmentInputs,
    account_baseline: accountBaseline,
    peer_baseline: comparison.peer_baseline,
    anomaly_notice: anomalyNotice,
  });

  const inputBundle: Record<string, unknown> = {
    video_id: videoId,
    force_refresh: forceRefresh,
    sample_level: sample.level,
    sample_status: sample.label,
    anomaly_status: anomalyStatus,
    metrics,
    comparison,
    segment_count: segmentInputs.length,
  };

  const { data: bundleRow, error: bundleError } = await serviceClient
    .from("ai_input_bundle")
    .insert({
      insight_scope: "single_video",
      scope_entity_id: videoId,
      input_version: 1,
      data_quality_state: sample.level === "full" ? "sufficient" : sample.level === "partial" ? "partial" : "insufficient",
      input_json: inputBundle,
    })
    .select("id")
    .single();

  if (bundleError || !bundleRow) {
    return NextResponse.json({ error: "写入 ai_input_bundle 失败" }, { status: 500 });
  }

  const inputBundleId: string = bundleRow.id;

  try {
    const aiResult = await callStructuredAi({ prompt });
    const rawJson = aiResult.jsonString;
    if (!rawJson) throw new Error("AI 返回内容无法解析为 JSON");

    const aiReview = parseNextDayReviewResult(rawJson);
    if (!aiReview) throw new Error("AI 返回结构不符合预期");

    const finalResult = buildStructuredReviewResult({
      videoId,
      sample,
      metrics,
      comparison,
      anomalyNotice,
      segmentInputs,
      aiReview,
      cached: false,
    });

    await serviceClient.from("ai_insight_result").insert({
      input_bundle_id: inputBundleId,
      insight_type: "next_day_review",
      model_name: aiResult.model,
      prompt_version: PROMPT_VERSION,
      result_status: "success",
      result_json: finalResult,
      rendered_text: finalResult.summary.one_line,
    });

    return NextResponse.json(finalResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";

    await serviceClient.from("ai_insight_result").insert({
      input_bundle_id: inputBundleId,
      insight_type: "next_day_review",
      model_name: process.env.AI_MODEL ?? "claude-sonnet-4-6",
      prompt_version: PROMPT_VERSION,
      result_status: "failed",
      result_json: { error: message, video_id: videoId },
      rendered_text: message,
    });

    return NextResponse.json(
      {
        error: message,
        code: "REVIEW_FAILED",
        metrics,
        sample_status: sample.label,
      },
      { status: 500 },
    );
  }
}

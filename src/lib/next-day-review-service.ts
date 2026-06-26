import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";
import { callStructuredAi } from "@/lib/ai/shared";
import {
  buildContentFeedbackCardDetail,
  CONTENT_FEEDBACK_CARD_SELECT,
} from "@/lib/content-feedback-cards";
import { ensureContentSegments } from "@/lib/content-segment-service";
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
import type {
  ContentFeedbackCard,
  ContentFeedbackCardDetail,
  NextDayReviewComparison,
  NextDayReviewMetrics,
  NextDayReviewResult,
} from "@/types";

export const NEXT_DAY_REVIEW_PROMPT_VERSION = "next-day-review-v1";

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

export class NextDayReviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 422,
  ) {
    super(message);
  }
}

type GeneratedNextDayReview = NextDayReviewResult & {
  auto_segmented: boolean;
  feedback_card: ContentFeedbackCardDetail;
};

type DraftSyncMode = "ensure" | "refresh";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStructuredReview(v: unknown): v is NextDayReviewResult {
  if (!isRecord(v)) return false;
  return v.ok === true && typeof v.video_id === "string" && typeof v.review_status === "string";
}

async function loadFeedbackCard(supabase: Pick<SupabaseClient, "from">, videoId: string) {
  const { data } = await supabase
    .from("content_feedback_cards")
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .eq("video_id", videoId)
    .maybeSingle();

  return (data as ContentFeedbackCard | null) ?? null;
}

export function resolveNextDayReviewDraftSyncMode(forceRefresh: boolean): DraftSyncMode {
  return forceRefresh ? "refresh" : "ensure";
}

export async function syncDraftFeedbackCard(params: {
  supabase: Pick<SupabaseClient, "from">;
  videoId: string;
  targetUserId: string;
  targetAccountId: string | null;
  sourceResultId: string;
  draftPayload: NextDayReviewResult;
  mode: DraftSyncMode;
}) {
  const { supabase, videoId, targetUserId, targetAccountId, sourceResultId, draftPayload, mode } = params;
  const now = new Date().toISOString();
  const existing = await loadFeedbackCard(supabase, videoId);

  if (!existing) {
    const { data } = await supabase
      .from("content_feedback_cards")
      .insert({
        video_id: videoId,
        target_user_id: targetUserId,
        target_account_id: targetAccountId,
        source_result_id: sourceResultId,
        card_status: "draft",
        draft_payload: draftPayload,
        confirmed_payload: null,
        draft_generated_at: now,
      })
      .select(CONTENT_FEEDBACK_CARD_SELECT)
      .single();

    return (data as ContentFeedbackCard | null) ?? null;
  }

  if (mode === "ensure" && (existing.card_status === "confirmed" || existing.card_status === "sent" || existing.card_status === "viewed")) {
    return existing;
  }

  const payload =
    mode === "refresh"
      ? {
          source_result_id: sourceResultId,
          card_status: "draft",
          draft_payload: draftPayload,
          confirmed_payload: null,
          draft_generated_at: now,
          confirmed_by: null,
          confirmed_at: null,
          sent_by: null,
          sent_at: null,
          viewed_at: null,
        }
      : {
          source_result_id: sourceResultId,
          draft_payload: draftPayload,
          draft_generated_at: now,
        };

  const { data } = await supabase
    .from("content_feedback_cards")
    .update(payload)
    .eq("id", existing.id)
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .single();

  return (data as ContentFeedbackCard | null) ?? existing;
}

export async function generateNextDayReviewForAccess(
  access: ScopedAdminVideoAccess,
  forceRefresh: boolean,
): Promise<GeneratedNextDayReview> {
  const serviceClient = access.supabase;
  const video = access.video;
  const videoId = video.id;

  if (!forceRefresh) {
    const { data: cached } = await serviceClient
      .from("ai_insight_result")
      .select("id, result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success")
      .contains("result_json", { video_id: videoId })
      .order("created_at", { ascending: false })
      .limit(1);

    const cachedRow = cached?.[0] ?? null;
    const cachedJson = cachedRow?.result_json;
    if (isStructuredReview(cachedJson)) {
      const feedbackCard = cachedRow?.id
        ? await syncDraftFeedbackCard({
            supabase: serviceClient,
            videoId,
            targetUserId: video.user_id,
            targetAccountId: video.account_id,
            sourceResultId: cachedRow.id,
            draftPayload: { ...cachedJson, cached: true },
            mode: "ensure",
          })
        : await loadFeedbackCard(serviceClient, videoId);

      return {
        ...cachedJson,
        cached: true,
        auto_segmented: false,
        feedback_card: buildContentFeedbackCardDetail(videoId, feedbackCard),
      };
    }
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
    throw new NextDayReviewError("缺少24h数据，暂不能复盘", "NO_24H_SNAPSHOT");
  }

  const content = typeof video.content === "string" ? video.content.trim() : "";
  if (!content) {
    throw new NextDayReviewError("文案为空，暂不能复盘", "NO_CONTENT");
  }

  let segmentsResult;
  try {
    segmentsResult = await ensureContentSegments({
      supabase: serviceClient,
      videoId,
      content,
      forceRefresh,
    });
  } catch (error) {
    throw new NextDayReviewError(
      error instanceof Error ? error.message : "请先完成文案拆段",
      "NO_SEGMENTS",
      502,
    );
  }

  const segmentInputs: ReviewSegmentInput[] = segmentsResult.segments;
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
    auto_segmented: segmentsResult.generated,
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
    throw new NextDayReviewError("写入 ai_input_bundle 失败", "INPUT_BUNDLE_FAILED", 500);
  }

  const inputBundleId: string = bundleRow.id;

  try {
    const aiResult = await callStructuredAi({ prompt, featureKey: "next_day_review" });
    const aiReview = parseNextDayReviewResult(aiResult.jsonString);
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

    const { data: savedResult, error: savedResultError } = await serviceClient
      .from("ai_insight_result")
      .insert({
        input_bundle_id: inputBundleId,
        insight_type: "next_day_review",
        model_name: aiResult.model,
        prompt_version: NEXT_DAY_REVIEW_PROMPT_VERSION,
        result_status: "success",
        result_json: finalResult,
        rendered_text: finalResult.summary.one_line,
      })
      .select("id")
      .single();

    if (savedResultError || !savedResult) {
      throw new Error("写入复盘结果失败");
    }

    const feedbackCard = await syncDraftFeedbackCard({
      supabase: serviceClient,
      videoId,
      targetUserId: video.user_id,
      targetAccountId: video.account_id,
      sourceResultId: savedResult.id,
      draftPayload: finalResult,
      mode: resolveNextDayReviewDraftSyncMode(forceRefresh),
    });

    if (!feedbackCard) {
      throw new Error("同步反馈卡失败");
    }

    return {
      ...finalResult,
      auto_segmented: segmentsResult.generated,
      feedback_card: buildContentFeedbackCardDetail(videoId, feedbackCard),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";

    await serviceClient.from("ai_insight_result").insert({
      input_bundle_id: inputBundleId,
      insight_type: "next_day_review",
      model_name: process.env.AI_MODEL ?? "claude-sonnet-4-6",
      prompt_version: NEXT_DAY_REVIEW_PROMPT_VERSION,
      result_status: "failed",
      result_json: { error: message, video_id: videoId },
      rendered_text: message,
    });

    throw new NextDayReviewError(message, "REVIEW_FAILED", 500);
  }
}

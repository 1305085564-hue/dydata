import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";
import { callStructuredAi } from "@/lib/ai/shared";
import { loadContentSegments, type ContentSegmentRow } from "@/lib/content-segment-service";

export const CONTENT_ANALYSIS_PROMPT_VERSION = "content-analysis-v1";

type SnapshotLite = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  screenshot_urls?: string[] | null;
  curve_screenshot_url?: string | null;
  retention_screenshot_url?: string | null;
};

type ObservationLite = {
  traffic_peak_level: string | null;
  post_peak_trend: string | null;
  traffic_retention_quality: string | null;
  drop_off_stage: string | null;
  suspected_problem_stage: string | null;
  note: string | null;
};

type PreviousVideoLite = {
  id: string;
  video_title: string | null;
  content: string | null;
  published_at: string | null;
};

export type ContentAnalysisStage =
  | "opening"
  | "middle_content"
  | "traffic_retention"
  | "topic_mismatch"
  | "weak_interaction"
  | "weak_conversion";

export type ContentAnalysisResult = {
  data_summary: string;
  suspected_stage: ContentAnalysisStage[];
  key_metric_evidence: string[];
  copywriting_reason: string;
  abnormal_points: string[];
  reusable_experience: string;
  feedback_draft: {
    main_issues: string;
    improvement_feedback: string;
  };
};

export type ContentAnalysisResponse = ContentAnalysisResult & {
  ok: true;
  video_id: string;
  insight_result_id: string;
  input_bundle_id: string;
  cached: boolean;
};

export class ContentAnalysisError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 422,
  ) {
    super(message);
  }
}

const ALLOWED_STAGES: ContentAnalysisStage[] = [
  "opening",
  "middle_content",
  "traffic_retention",
  "topic_mismatch",
  "weak_interaction",
  "weak_conversion",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanStringArray(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[；;\n]+/) : [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeContentAnalysisResult(value: unknown): ContentAnalysisResult | null {
  if (!isRecord(value)) return null;

  const feedbackRaw = isRecord(value.feedback_draft) ? value.feedback_draft : {};
  const suspectedStage = (Array.isArray(value.suspected_stage) ? value.suspected_stage : [])
    .filter((stage): stage is ContentAnalysisStage =>
      typeof stage === "string" && ALLOWED_STAGES.includes(stage as ContentAnalysisStage),
    )
    .slice(0, 6);

  return {
    data_summary: cleanString(value.data_summary, "数据不足，建议人工复核后再下结论。"),
    suspected_stage: suspectedStage,
    key_metric_evidence: cleanStringArray(value.key_metric_evidence),
    copywriting_reason: cleanString(value.copywriting_reason, "暂未形成明确文案归因。"),
    abnormal_points: cleanStringArray(value.abnormal_points),
    reusable_experience: cleanString(value.reusable_experience, "暂无可复用经验。"),
    feedback_draft: {
      main_issues: cleanString(feedbackRaw.main_issues, ""),
      improvement_feedback: cleanString(feedbackRaw.improvement_feedback, ""),
    },
  };
}

export function parseContentAnalysisResult(jsonString: string): ContentAnalysisResult | null {
  try {
    return normalizeContentAnalysisResult(JSON.parse(jsonString));
  } catch {
    return null;
  }
}

function average(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function buildPlayChangeSignal(current: SnapshotLite, previous: SnapshotLite | null) {
  const currentPlay = current.play_count;
  const previousPlay = previous?.play_count;
  if (currentPlay == null || previousPlay == null || previousPlay <= 0) {
    return { previous_play_count: previousPlay ?? null, play_count_change_pct: null, play_change_signal: null };
  }

  const pct = ((currentPlay - previousPlay) / previousPlay) * 100;
  return {
    previous_play_count: previousPlay,
    play_count_change_pct: pct,
    play_change_signal: pct >= 100 ? "surge" : pct <= -50 ? "halve" : null,
  };
}

export function buildSnapshotBaseline(snapshots: SnapshotLite[]) {
  return {
    sample_count: snapshots.length,
    play_count: average(snapshots.map((item) => item.play_count)),
    bounce_rate_2s: average(snapshots.map((item) => item.bounce_rate_2s)),
    completion_rate_5s: average(snapshots.map((item) => item.completion_rate_5s)),
    completion_rate: average(snapshots.map((item) => item.completion_rate)),
    avg_play_duration: average(snapshots.map((item) => item.avg_play_duration)),
    likes: average(snapshots.map((item) => item.likes)),
    comments: average(snapshots.map((item) => item.comments)),
    shares: average(snapshots.map((item) => item.shares)),
    favorites: average(snapshots.map((item) => item.favorites)),
    follower_gain: average(snapshots.map((item) => item.follower_gain)),
  };
}

export function buildContentAnalysisPrompt(input: Record<string, unknown>) {
  return [
    "你是抖音内容批改台的内部分析助手。",
    "只输出 JSON，不要 Markdown。",
    "输出字段必须严格包含：data_summary、suspected_stage、key_metric_evidence、copywriting_reason、abnormal_points、reusable_experience、feedback_draft。",
    "suspected_stage 只能从 opening、middle_content、traffic_retention、topic_mismatch、weak_interaction、weak_conversion 中选择。",
    "feedback_draft 必须包含 main_issues 和 improvement_feedback，供管理者引用到反馈，但不要替管理者做最终结论。",
    "只能使用疑似、可能、倾向于、建议复核等保守措辞。",
    "禁止输出平台权重、算法判罚等绝对判断。",
    "如果所有数据只是常规齐涨齐跌，明确提示无需重点复盘。",
    "",
    "输入数据：",
    JSON.stringify(input),
  ].join("\n");
}

async function loadLatestSnapshot(supabase: Pick<SupabaseClient, "from">, videoId: string): Promise<SnapshotLite | null> {
  const { data } = await supabase
    .from("video_metrics_snapshots")
    .select(
      "play_count,bounce_rate_2s,completion_rate_5s,completion_rate,avg_play_duration,likes,comments,shares,favorites,follower_gain,screenshot_urls,curve_screenshot_url,retention_screenshot_url",
    )
    .eq("video_id", videoId)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false })
    .limit(1);

  return (data?.[0] as SnapshotLite | undefined) ?? null;
}

async function loadPreviousVideoAndSnapshot(
  supabase: Pick<SupabaseClient, "from">,
  params: { videoId: string; accountId: string | null; publishedAt: string | null },
) {
  if (!params.accountId || !params.publishedAt) {
    return { previousVideo: null, previousSnapshot: null };
  }

  const { data } = await supabase
    .from("videos")
    .select("id, video_title, content, published_at")
    .eq("account_id", params.accountId)
    .lt("published_at", params.publishedAt)
    .neq("id", params.videoId)
    .order("published_at", { ascending: false })
    .limit(1);

  const previousVideo = (data?.[0] as PreviousVideoLite | undefined) ?? null;
  if (!previousVideo) return { previousVideo: null, previousSnapshot: null };

  return {
    previousVideo,
    previousSnapshot: await loadLatestSnapshot(supabase, previousVideo.id),
  };
}

async function loadThirtyDayBaseline(
  supabase: Pick<SupabaseClient, "from">,
  params: { videoId: string; accountId: string | null; publishedAt: string | null },
) {
  if (!params.accountId) return buildSnapshotBaseline([]);

  const end = params.publishedAt ? new Date(params.publishedAt) : new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 30);

  const { data: videos } = await supabase
    .from("videos")
    .select("id")
    .eq("account_id", params.accountId)
    .neq("id", params.videoId)
    .gte("published_at", start.toISOString())
    .lt("published_at", end.toISOString())
    .limit(500);

  const ids = (videos ?? []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return buildSnapshotBaseline([]);

  const { data: snapshots } = await supabase
    .from("video_metrics_snapshots")
    .select("play_count,bounce_rate_2s,completion_rate_5s,completion_rate,avg_play_duration,likes,comments,shares,favorites,follower_gain")
    .eq("snapshot_type", "24h")
    .in("video_id", ids);

  return buildSnapshotBaseline((snapshots ?? []) as SnapshotLite[]);
}

async function loadObservation(
  supabase: Pick<SupabaseClient, "from">,
  videoId: string,
  observerId: string,
): Promise<ObservationLite | null> {
  const { data } = await supabase
    .from("content_observations")
    .select("traffic_peak_level,post_peak_trend,traffic_retention_quality,drop_off_stage,suspected_problem_stage,note")
    .eq("video_id", videoId)
    .eq("observer_id", observerId)
    .maybeSingle();

  return (data as ObservationLite | null) ?? null;
}

export async function generateContentAnalysisForAccess(
  access: ScopedAdminVideoAccess,
): Promise<ContentAnalysisResponse> {
  const supabase = access.supabase;
  const video = access.video;
  const videoId = video.id;

  const snapshot = await loadLatestSnapshot(supabase, videoId);
  if (!snapshot) {
    throw new ContentAnalysisError("缺少24h数据，暂不能生成辅助分析", "NO_24H_SNAPSHOT");
  }

  const [previous, baseline, observation, segments] = await Promise.all([
    loadPreviousVideoAndSnapshot(supabase, {
      videoId,
      accountId: video.account_id,
      publishedAt: video.published_at,
    }),
    loadThirtyDayBaseline(supabase, {
      videoId,
      accountId: video.account_id,
      publishedAt: video.published_at,
    }),
    loadObservation(supabase, videoId, access.actor.userId),
    loadContentSegments(supabase, videoId),
  ]);

  const inputBundle: Record<string, unknown> = {
    video_id: videoId,
    generated_by: access.actor.userId,
    video: {
      id: video.id,
      account_id: video.account_id,
      account_name: video.accounts?.name ?? null,
      owner_user_id: video.user_id,
      owner_name: video.profiles?.name ?? null,
      video_title: video.video_title,
      video_url: video.video_url,
      published_at: video.published_at,
      content: video.content,
      anomaly_status: video.anomaly_status,
    },
    current_snapshot: snapshot,
    previous_video: previous.previousVideo,
    previous_snapshot: previous.previousSnapshot,
    account_30d_baseline: baseline,
    observation,
    abnormal_state: buildPlayChangeSignal(snapshot, previous.previousSnapshot),
    segments: segments satisfies ContentSegmentRow[],
    screenshot_urls: {
      data: snapshot.screenshot_urls ?? [],
      curve: snapshot.curve_screenshot_url ?? null,
      retention: snapshot.retention_screenshot_url ?? null,
    },
  };

  const prompt = buildContentAnalysisPrompt(inputBundle);

  const { data: bundleRow, error: bundleError } = await supabase
    .from("ai_input_bundle")
    .insert({
      insight_scope: "single_video",
      scope_entity_id: videoId,
      input_version: 1,
      data_quality_state: baseline.sample_count > 0 ? "sufficient" : "partial",
      input_json: inputBundle,
    })
    .select("id")
    .single();

  if (bundleError || !bundleRow) {
    throw new ContentAnalysisError("写入 ai_input_bundle 失败", "INPUT_BUNDLE_FAILED", 500);
  }

  const inputBundleId = String(bundleRow.id);

  try {
    const aiResult = await callStructuredAi({ prompt, featureKey: "content_analysis", maxTokens: 2000 });
    const normalized = parseContentAnalysisResult(aiResult.jsonString);
    if (!normalized) throw new Error("AI 返回结构不符合预期");

    const resultJson = {
      ok: true,
      video_id: videoId,
      ...normalized,
    };

    const { data: saved, error: saveError } = await supabase
      .from("ai_insight_result")
      .insert({
        input_bundle_id: inputBundleId,
        insight_type: "content_analysis",
        model_name: aiResult.model,
        prompt_version: CONTENT_ANALYSIS_PROMPT_VERSION,
        result_status: "success",
        result_json: resultJson,
        rendered_text: normalized.data_summary,
      })
      .select("id")
      .single();

    if (saveError || !saved) {
      throw new Error(saveError?.message || "写入分析结果失败");
    }

    return {
      ok: true,
      video_id: videoId,
      insight_result_id: String(saved.id),
      input_bundle_id: inputBundleId,
      cached: false,
      ...normalized,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";
    await supabase.from("ai_insight_result").insert({
      input_bundle_id: inputBundleId,
      insight_type: "content_analysis",
      model_name: process.env.AI_MODEL ?? "claude-sonnet-4-6",
      prompt_version: CONTENT_ANALYSIS_PROMPT_VERSION,
      result_status: "failed",
      result_json: { error: message, video_id: videoId },
      rendered_text: message,
    });

    throw new ContentAnalysisError(message, "CONTENT_ANALYSIS_FAILED", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { callAiJson, extractJsonString } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

type TagItem = {
  tag_dimension: string;
  tag_value: string;
};

type SnapshotMetrics = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
};

type RetentionAnalysis = {
  bounce_peak_time: string | null;
  replay_peak_time: string | null;
  segment_summary: Array<{ segment: string; performance: string }>;
};

type VideoPromptInput = {
  video: {
    id: string;
    content: string | null;
    tags: TagItem[];
    curve_pattern: string | null;
    retention_analysis: RetentionAnalysis | null;
    snapshot: SnapshotMetrics | null;
    published_at: string | null;
    account_name: string | null;
  };
  marketContext: {
    context_date: string;
    market_sentiment: string | null;
    hot_sectors: string[] | null;
    market_change: JsonRecord | null;
  } | null;
  baseline: {
    totalVideos: number;
    avgPlayCount: number;
    avgLikeRate: number;
    bestPlayCount: number;
  };
};

type DiagnosisResult = {
  summary: string;
  reasons: string[];
  actions: string[];
};

type AdviceInsert = {
  target_user_id: string;
  target_account_id: string | null;
  advice_content: string;
  evidence: string | null;
  advice_source: "ai";
  status: "待查看";
  assigned_by: string | null;
  executed_video_id: string;
};

type BatchResult =
  | { ok: true; videoId: string }
  | { ok: false; videoId: string; error: string };

type VideoCandidate = {
  id: string;
  user_id: string;
  account_id: string | null;
  published_at: string | null;
  content: string | null;
  video_title: string | null;
  accounts?: { name: string } | { name: string }[] | null;
};

function extractAccountName(accounts: VideoCandidate["accounts"]) {
  if (Array.isArray(accounts)) {
    return accounts[0]?.name ?? null;
  }

  return accounts?.name ?? null;
}

const DEFAULT_DAYS = 7;
const MAX_BATCH_SIZE = 20;

function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey!);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRetentionAnalysis(value: unknown): RetentionAnalysis | null {
  if (!isRecord(value)) return null;

  const rawSegments = Array.isArray(value.segment_summary) ? value.segment_summary : [];
  const segment_summary = rawSegments
    .filter(isRecord)
    .map((item) => ({
      segment: isNonEmptyString(item.segment) ? item.segment.trim() : "",
      performance: isNonEmptyString(item.performance) ? item.performance.trim() : "",
    }))
    .filter((item) => item.segment && item.performance);

  return {
    bounce_peak_time: isNonEmptyString(value.bounce_peak_time) ? value.bounce_peak_time.trim() : null,
    replay_peak_time: isNonEmptyString(value.replay_peak_time) ? value.replay_peak_time.trim() : null,
    segment_summary,
  };
}

export function buildDiagnosisPrompt(input: VideoPromptInput) {
  const tags = input.video.tags.length
    ? input.video.tags.map((tag) => `${tag.tag_dimension}:${tag.tag_value}`).join("、")
    : "无";

  const snapshot = input.video.snapshot;
  const retention = input.video.retention_analysis;
  const baseline = input.baseline;
  const market = input.marketContext;

  return [
    "你是抖音短视频复盘顾问。输出必须直接、具体、基于证据。",
    "只输出 JSON，不要 Markdown，不要代码块，不要额外解释。",
    'JSON 格式固定为 {"summary":"...","reasons":["..."],"actions":["..."]}。',
    "summary 1 句话，reasons 2-4 条，actions 2-4 条。",
    "reasons 和 actions 都必须短句，不能空泛。",
    "",
    "【本条视频】",
    `视频ID：${input.video.id}`,
    `账号：${input.video.account_name ?? "未知"}`,
    `发布时间：${input.video.published_at ?? "未知"}`,
    `内容：${input.video.content ?? "无"}`,
    `标签：${tags}`,
    `推流曲线：${input.video.curve_pattern ?? "无"}`,
    `24h数据：播放${snapshot?.play_count ?? 0}，赞${snapshot?.likes ?? 0}，评${snapshot?.comments ?? 0}，转${snapshot?.shares ?? 0}，藏${snapshot?.favorites ?? 0}，涨粉${snapshot?.follower_gain ?? 0}`,
    `跳出峰值：${retention?.bounce_peak_time ?? "无"}`,
    `回看峰值：${retention?.replay_peak_time ?? "无"}`,
    `分段表现：${retention?.segment_summary.map((item) => `${item.segment}-${item.performance}`).join("；") || "无"}`,
    "",
    "【市场环境】",
    `日期：${market?.context_date ?? "无"}`,
    `情绪：${market?.market_sentiment ?? "无"}`,
    `热点板块：${market?.hot_sectors?.join("、") || "无"}`,
    `市场变化：${market?.market_change ? JSON.stringify(market.market_change) : "无"}`,
    "",
    "【同账号历史基线】",
    `样本数：${baseline.totalVideos}`,
    `平均播放：${baseline.avgPlayCount}`,
    `平均点赞率：${baseline.avgLikeRate}`,
    `历史最高播放：${baseline.bestPlayCount}`,
    "",
    "任务：",
    "1. 判断这条视频最核心的问题或亮点。",
    "2. reasons 必须引用这条视频与历史基线/市场环境/曲线/留存的证据。",
    "3. actions 必须是下一条视频可直接执行的动作，优先覆盖开头、结构、表达、选题、发布时间。",
  ].join("\n");
}

function parseDiagnosis(content: string): DiagnosisResult | null {
  const jsonString = extractJsonString(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as Partial<DiagnosisResult>;
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.filter(isNonEmptyString).map((item) => item.trim()) : [];
    const actions = Array.isArray(parsed.actions) ? parsed.actions.filter(isNonEmptyString).map((item) => item.trim()) : [];

    if (!isNonEmptyString(parsed.summary) || reasons.length === 0 || actions.length === 0) {
      return null;
    }

    return {
      summary: parsed.summary.trim(),
      reasons,
      actions,
    };
  } catch {
    return null;
  }
}

function stringifyEvidence(input: VideoPromptInput) {
  const snapshot = input.video.snapshot;
  return [
    `播放${snapshot?.play_count ?? 0}`,
    `赞${snapshot?.likes ?? 0}`,
    `评${snapshot?.comments ?? 0}`,
    `转${snapshot?.shares ?? 0}`,
    `藏${snapshot?.favorites ?? 0}`,
    `涨粉${snapshot?.follower_gain ?? 0}`,
    `曲线${input.video.curve_pattern ?? "无"}`,
    `跳出峰值${input.video.retention_analysis?.bounce_peak_time ?? "无"}`,
    `回看峰值${input.video.retention_analysis?.replay_peak_time ?? "无"}`,
    `基线均播${input.baseline.avgPlayCount}`,
  ].join(" | ");
}

export function createDiagnosisRecord(input: {
  userId: string;
  accountId: string | null;
  videoId: string;
  diagnosis: DiagnosisResult;
  evidence: string | null;
}): AdviceInsert {
  return {
    target_user_id: input.userId,
    target_account_id: input.accountId,
    advice_content: [input.diagnosis.summary, ...input.diagnosis.reasons, ...input.diagnosis.actions].join("\n"),
    evidence: input.evidence,
    advice_source: "ai",
    status: "待查看",
    assigned_by: null,
    executed_video_id: input.videoId,
  };
}

async function generateDiagnosis(prompt: string) {
  const result = await callAiJson(prompt, { maxTokens: 1200, featureKey: "video_diagnose" });
  const diagnosis = parseDiagnosis(result.content);

  if (!diagnosis) {
    throw new Error("AI 返回内容解析失败");
  }

  return diagnosis;
}

async function loadVideoContext(videoId: string) {
  const supabase = createServiceClient();

  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, user_id, account_id, content, published_at, video_title, accounts(name)")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    throw new Error(videoError?.message || "视频不存在");
  }

  const [snapshotResult, tagsResult, marketResult, baselineResult] = await Promise.all([
    supabase
      .from("video_metrics_snapshots")
      .select("play_count, likes, comments, shares, favorites, follower_gain, curve_pattern, retention_analysis, captured_at")
      .eq("video_id", videoId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("video_tags").select("tag_dimension, tag_value").eq("video_id", videoId),
    video.published_at
      ? supabase
          .from("market_context_daily")
          .select("context_date, market_sentiment, hot_sectors, market_change")
          .eq("context_date", video.published_at.split("T")[0])
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("videos")
      .select("id")
      .eq("account_id", video.account_id)
      .neq("id", videoId)
      .order("published_at", { ascending: false })
      .limit(10),
  ]);

  if (snapshotResult.error) throw new Error(snapshotResult.error.message);
  if (tagsResult.error) throw new Error(tagsResult.error.message);
  if (marketResult.error) throw new Error(marketResult.error.message);
  if (baselineResult.error) throw new Error(baselineResult.error.message);

  const baselineVideoIds = (baselineResult.data ?? []).map((item) => item.id);
  const { data: baselineSnapshots, error: baselineSnapshotsError } = baselineVideoIds.length
    ? await supabase
        .from("video_metrics_snapshots")
        .select("video_id, play_count, likes")
        .in("video_id", baselineVideoIds)
        .eq("snapshot_type", "24h")
    : { data: [], error: null };

  if (baselineSnapshotsError) throw new Error(baselineSnapshotsError.message);

  const groupedBaseline = new Map<string, { play_count: number; likes: number }>();
  for (const item of baselineSnapshots ?? []) {
    if (!groupedBaseline.has(item.video_id)) {
      groupedBaseline.set(item.video_id, {
        play_count: normalizeNumber(item.play_count),
        likes: normalizeNumber(item.likes),
      });
    }
  }

  const baselineRows = Array.from(groupedBaseline.values());
  const totalVideos = baselineRows.length;
  const totalPlayCount = baselineRows.reduce((sum, item) => sum + item.play_count, 0);
  const totalLikeRate = baselineRows.reduce((sum, item) => {
    if (!item.play_count) return sum;
    return sum + item.likes / item.play_count;
  }, 0);

  return {
    userId: video.user_id,
    accountId: video.account_id,
    promptInput: {
      video: {
        id: video.id,
        content: video.content,
        tags: (tagsResult.data ?? []) as TagItem[],
        curve_pattern: isNonEmptyString(snapshotResult.data?.curve_pattern) ? snapshotResult.data.curve_pattern : null,
        retention_analysis: normalizeRetentionAnalysis(snapshotResult.data?.retention_analysis),
        snapshot: snapshotResult.data
          ? {
              play_count: snapshotResult.data.play_count,
              likes: snapshotResult.data.likes,
              comments: snapshotResult.data.comments,
              shares: snapshotResult.data.shares,
              favorites: snapshotResult.data.favorites,
              follower_gain: snapshotResult.data.follower_gain,
            }
          : null,
        published_at: video.published_at,
        account_name: extractAccountName(video.accounts),
      },
      marketContext: marketResult.data
        ? {
            context_date: marketResult.data.context_date,
            market_sentiment: marketResult.data.market_sentiment,
            hot_sectors: marketResult.data.hot_sectors,
            market_change: (marketResult.data.market_change as JsonRecord | null) ?? null,
          }
        : null,
      baseline: {
        totalVideos,
        avgPlayCount: totalVideos ? Math.round(totalPlayCount / totalVideos) : 0,
        avgLikeRate: totalVideos ? Number((totalLikeRate / totalVideos).toFixed(4)) : 0,
        bestPlayCount: baselineRows.reduce((max, item) => Math.max(max, item.play_count), 0),
      },
    } satisfies VideoPromptInput,
  };
}

export async function runVideoDiagnosis(videoId: string) {
  const context = await loadVideoContext(videoId);
  const prompt = buildDiagnosisPrompt(context.promptInput);
  const diagnosis = await generateDiagnosis(prompt);
  const record = createDiagnosisRecord({
    userId: context.userId,
    accountId: context.accountId,
    videoId,
    diagnosis,
    evidence: stringifyEvidence(context.promptInput),
  });

  const supabase = createServiceClient();
  const { error: insertError } = await supabase.from("advice_actions").insert(record);

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    video_id: videoId,
    diagnosis,
    evidence: record.evidence,
  };
}

export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!isRecord(body) || !isNonEmptyString(body.video_id)) {
    return NextResponse.json({ error: "缺少 video_id" }, { status: 400 });
  }

  try {
    const result = await runVideoDiagnosis(body.video_id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "诊断失败" }, { status: 500 });
  }
}

export function createBatchSummary(results: BatchResult[]) {
  return {
    total: results.length,
    diagnosed: results.filter((item) => item.ok).length,
    failed: results.flatMap((item) =>
      item.ok
        ? []
        : [
            {
              video_id: item.videoId,
              error: item.error,
            },
          ]
    ),
  };
}

export function normalizeBatchPayload(body: unknown) {
  const record = isRecord(body) ? body : {};
  const rawDays = typeof record.days === "number" && Number.isFinite(record.days) ? Math.floor(record.days) : DEFAULT_DAYS;
  const rawLimit = typeof record.limit === "number" && Number.isFinite(record.limit) ? Math.floor(record.limit) : MAX_BATCH_SIZE;

  return {
    userId: isNonEmptyString(record.user_id) ? record.user_id.trim() : null,
    accountId: isNonEmptyString(record.account_id) ? record.account_id.trim() : null,
    days: rawDays > 0 ? rawDays : DEFAULT_DAYS,
    limit: Math.min(MAX_BATCH_SIZE, rawLimit > 0 ? rawLimit : MAX_BATCH_SIZE),
  };
}

export function pickBatchCandidates(videos: Array<{ id: string; diagnosed: boolean }>, limit: number) {
  return videos.filter((video) => !video.diagnosed).slice(0, limit);
}

export async function listBatchCandidates(payload: { userId: string | null; accountId: string | null; days: number; limit: number }) {
  const supabase = createServiceClient();
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - (payload.days - 1));
  const since = sinceDate.toISOString().split("T")[0];

  let query = supabase
    .from("videos")
    .select("id, user_id, account_id, published_at, content, video_title, accounts(name)")
    .gte("published_at", `${since}T00:00:00.000Z`)
    .order("published_at", { ascending: false })
    .limit(MAX_BATCH_SIZE * 3);

  if (payload.userId) {
    query = query.eq("user_id", payload.userId);
  }

  if (payload.accountId) {
    query = query.eq("account_id", payload.accountId);
  }

  const { data: videos, error } = await query;
  if (error) throw new Error(error.message);

  const videoIds = (videos ?? []).map((item) => item.id);
  const { data: existingAdvice, error: adviceError } = videoIds.length
    ? await supabase.from("advice_actions").select("executed_video_id").in("executed_video_id", videoIds)
    : { data: [], error: null };

  if (adviceError) throw new Error(adviceError.message);

  const diagnosedIds = new Set((existingAdvice ?? []).map((item) => item.executed_video_id).filter(isNonEmptyString));

  return pickBatchCandidates(
    (videos ?? []).map((item) => ({ id: item.id, diagnosed: diagnosedIds.has(item.id) })),
    payload.limit
  );
}

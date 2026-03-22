import {
  callStructuredAi,
  insertAiInputBundle,
  persistFailedInsightResult,
  persistSuccessfulInsightResult,
  renderSingleVideoInsight,
  type MinimalSupabaseClient,
  type SingleVideoInsightResult,
} from "./shared";

export const SINGLE_VIDEO_PROMPT_VERSION = "single-video-v1";

export type SingleVideoMetrics = {
  play_count: number | null;
  follower_gain: number | null;
  lead_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  favorite_count: number | null;
  avg_watch_sec: number | null;
  bounce_2s_rate: number | null;
  completion_5s_rate: number | null;
  full_completion_rate: number | null;
};

export type SingleVideoInputBundle = {
  metrics: SingleVideoMetrics;
  baseline: SingleVideoMetrics;
  traffic_curve_features: {
    drop_points: Array<{ second: number; drop_rate: number }>;
    curve_pattern: string | null;
  };
  script_segments: Array<{
    type: string;
    content: string;
    start_sec: number | null;
    end_sec: number | null;
  }>;
  tags: Array<{
    dimension: string;
    tag_code: string;
    tag_name: string;
  }>;
};

export type SingleVideoAiResult = SingleVideoInsightResult;

type SingleVideoContext = {
  scopeEntityId: string;
  inputBundle: SingleVideoInputBundle;
  dataQualityState: "sufficient" | "partial" | "insufficient";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEvidence(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(isNonEmptyString).map((item) => item.trim());
  }

  if (isNonEmptyString(value)) {
    return value
      .split(/[；;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [] as string[];
}

function toMetrics(row: Record<string, unknown> | null | undefined): SingleVideoMetrics {
  return {
    play_count: normalizeNumber(row?.play_count),
    follower_gain: normalizeNumber(row?.follower_gain),
    lead_count: normalizeNumber(row?.lead_count),
    like_count: normalizeNumber(row?.like_count),
    comment_count: normalizeNumber(row?.comment_count),
    share_count: normalizeNumber(row?.share_count),
    favorite_count: normalizeNumber(row?.favorite_count),
    avg_watch_sec: normalizeNumber(row?.avg_watch_sec),
    bounce_2s_rate: normalizeNumber(row?.bounce_2s_rate),
    completion_5s_rate: normalizeNumber(row?.completion_5s_rate),
    full_completion_rate: normalizeNumber(row?.full_completion_rate),
  };
}

function averageMetric(rows: Array<Record<string, unknown>>, key: keyof SingleVideoMetrics) {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function buildBaseline(rows: Array<Record<string, unknown>>): SingleVideoMetrics {
  return {
    play_count: averageMetric(rows, "play_count"),
    follower_gain: averageMetric(rows, "follower_gain"),
    lead_count: averageMetric(rows, "lead_count"),
    like_count: averageMetric(rows, "like_count"),
    comment_count: averageMetric(rows, "comment_count"),
    share_count: averageMetric(rows, "share_count"),
    favorite_count: averageMetric(rows, "favorite_count"),
    avg_watch_sec: averageMetric(rows, "avg_watch_sec"),
    bounce_2s_rate: averageMetric(rows, "bounce_2s_rate"),
    completion_5s_rate: averageMetric(rows, "completion_5s_rate"),
    full_completion_rate: averageMetric(rows, "full_completion_rate"),
  };
}

function deriveDropPoints(metrics: SingleVideoMetrics) {
  const points: Array<{ second: number; drop_rate: number }> = [];

  if (typeof metrics.bounce_2s_rate === "number") {
    points.push({ second: 2, drop_rate: Number(metrics.bounce_2s_rate.toFixed(4)) });
  }

  if (typeof metrics.completion_5s_rate === "number") {
    points.push({ second: 5, drop_rate: Number((1 - metrics.completion_5s_rate).toFixed(4)) });
  }

  return points;
}

export function buildSingleVideoPrompt(input: SingleVideoInputBundle) {
  return [
    "你是A股超短线财经视频复盘分析师。基于以下数据，严格按JSON格式输出，JSON外不输出任何内容。",
    "输出JSON结构：",
    '- verdict: 一句话定性，不超过20字，必须含具体数据',
    '- key_problem: {time_range, drop_rate, script_fragment, diagnosis(<=50字基于数据)}',
    '- suggestions: [{target(hook/mid/cta), problem(含数字), action(可执行改法), example(可选)}]',
    '- confidence: high/medium/low',
    '- evidence: 引用的具体数字依据',
    "强制规则：",
    "1. play_count<500时confidence=low，verdict含\"样本量不足\"",
    '2. 禁止输出"建议提高内容质量"等废话',
    "3. 每条suggestion必须含具体数字",
    "4. 无drop_points时key_problem.time_range填null",
    "输入数据：",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export function normalizeSingleVideoInsight(value: unknown): SingleVideoAiResult | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.verdict)) return null;
  if (!isRecord(value.key_problem) || !isNonEmptyString(value.key_problem.diagnosis)) return null;
  if (!["high", "medium", "low"].includes(String(value.confidence))) return null;

  const suggestions = Array.isArray(value.suggestions)
    ? value.suggestions
        .filter(isRecord)
        .map((item) => {
          if (!["hook", "mid", "cta"].includes(String(item.target))) return null;
          if (!isNonEmptyString(item.problem) || !isNonEmptyString(item.action)) return null;

          return {
            target: item.target as "hook" | "mid" | "cta",
            problem: item.problem.trim(),
            action: item.action.trim(),
            ...(isNonEmptyString(item.example) ? { example: item.example.trim() } : {}),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  if (!suggestions.length) return null;

  return {
    verdict: value.verdict.trim(),
    key_problem: {
      time_range: isNonEmptyString(value.key_problem.time_range) ? value.key_problem.time_range.trim() : null,
      drop_rate: typeof value.key_problem.drop_rate === "number" ? value.key_problem.drop_rate : null,
      script_fragment: isNonEmptyString(value.key_problem.script_fragment)
        ? value.key_problem.script_fragment.trim()
        : null,
      diagnosis: value.key_problem.diagnosis.trim(),
    },
    suggestions,
    confidence: value.confidence as "high" | "medium" | "low",
    evidence: normalizeEvidence(value.evidence),
  };
}

export function resolveSingleVideoConfidence(result: SingleVideoAiResult, playCount: number | null) {
  if (playCount != null && playCount < 500) {
    return {
      ...result,
      confidence: "low" as const,
      verdict: result.verdict.includes("样本量不足") ? result.verdict : `样本量不足，${result.verdict}`,
    };
  }

  return result;
}

export function createSingleVideoResultPayload(result: SingleVideoAiResult) {
  return {
    result_json: result,
    rendered_text: renderSingleVideoInsight(result),
  };
}

async function loadSingleVideoContext(supabase: MinimalSupabaseClient, videoId: string): Promise<SingleVideoContext> {
  const { data: video, error: videoError } = await supabase
    .from("content_item")
    .select("id, owner_user_id, account_id")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    throw new Error(videoError?.message || "内容不存在");
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("metric_snapshot")
    .select(
      "content_item_id, play_count, follower_gain, lead_count, like_count, comment_count, share_count, favorite_count, avg_watch_sec, bounce_2s_rate, completion_5s_rate, full_completion_rate"
    )
    .eq("content_item_id", videoId)
    .eq("snapshot_type", "24h")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError || !snapshot) {
    throw new Error(snapshotError?.message || "缺少指标快照");
  }

  const { data: baselineItems, error: baselineError } = await supabase
    .from("metric_snapshot")
    .select(
      "content_item_id, play_count, follower_gain, lead_count, like_count, comment_count, share_count, favorite_count, avg_watch_sec, bounce_2s_rate, completion_5s_rate, full_completion_rate, content_item!inner(account_id)"
    )
    .eq("snapshot_type", "24h")
    .eq("content_item.account_id", video.account_id)
    .neq("content_item_id", videoId);

  if (baselineError) {
    throw new Error(baselineError.message);
  }

  const { data: segments, error: segmentError } = await supabase
    .from("script_segment")
    .select("segment_type, content, start_sec, end_sec, script_document!inner(content_item_id)")
    .eq("script_document.content_item_id", videoId)
    .order("segment_order", { ascending: true });

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  const { data: tags, error: tagError } = await supabase
    .from("content_tag_link")
    .select("tag_definition!inner(dimension, tag_code, tag_name)")
    .eq("content_item_id", videoId);

  if (tagError) {
    throw new Error(tagError.message);
  }

  const metrics = toMetrics(snapshot);
  const inputBundle: SingleVideoInputBundle = {
    metrics,
    baseline: buildBaseline((baselineItems ?? []) as Array<Record<string, unknown>>),
    traffic_curve_features: {
      drop_points: deriveDropPoints(metrics),
      curve_pattern: null,
    },
    script_segments: ((segments ?? []) as Array<Record<string, unknown>>)
      .filter((item) => isNonEmptyString(item.content))
      .map((item) => ({
        type: String(item.segment_type ?? "unknown"),
        content: String(item.content),
        start_sec: normalizeNumber(item.start_sec),
        end_sec: normalizeNumber(item.end_sec),
      })),
    tags: ((tags ?? []) as Array<Record<string, unknown>>)
      .map((item) => (isRecord(item.tag_definition) ? item.tag_definition : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => isNonEmptyString(item.dimension) && isNonEmptyString(item.tag_code) && isNonEmptyString(item.tag_name))
      .map((item) => ({
        dimension: String(item.dimension).trim(),
        tag_code: String(item.tag_code).trim(),
        tag_name: String(item.tag_name).trim(),
      })),
  };

  const dataQualityState = inputBundle.script_segments.length && inputBundle.tags.length ? "sufficient" : "partial";

  return {
    scopeEntityId: video.id,
    inputBundle,
    dataQualityState,
  };
}

export async function runSingleVideoInsight(supabase: MinimalSupabaseClient, videoId: string) {
  const context = await loadSingleVideoContext(supabase, videoId);
  const inputBundleId = await insertAiInputBundle({
    supabase,
    insightScope: "single_video",
    scopeEntityId: context.scopeEntityId,
    dataQualityState: context.dataQualityState,
    inputJson: context.inputBundle as unknown as Record<string, unknown>,
  });

  try {
    const prompt = buildSingleVideoPrompt(context.inputBundle);
    const aiResult = await callStructuredAi({ prompt, maxTokens: 1800 });
    const normalized = normalizeSingleVideoInsight(JSON.parse(aiResult.jsonString));

    if (!normalized) {
      throw new Error("AI 返回内容解析失败");
    }

    const finalResult = resolveSingleVideoConfidence(normalized, context.inputBundle.metrics.play_count);
    const payload = createSingleVideoResultPayload(finalResult);

    await persistSuccessfulInsightResult({
      supabase,
      inputBundleId,
      insightType: "growth_edit",
      promptVersion: SINGLE_VIDEO_PROMPT_VERSION,
      resultJson: payload.result_json as unknown as Record<string, unknown>,
      renderedText: payload.rendered_text,
      modelName: aiResult.model,
    });

    return {
      input_bundle_id: inputBundleId,
      result: finalResult,
      rendered_text: payload.rendered_text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "单视频洞察生成失败";
    await persistFailedInsightResult({
      supabase,
      inputBundleId,
      insightType: "growth_edit",
      promptVersion: SINGLE_VIDEO_PROMPT_VERSION,
      errorMessage: message,
    });
    throw error;
  }
}

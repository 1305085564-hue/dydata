import {
  callStructuredAi,
  insertAiInputBundle,
  persistFailedInsightResult,
  persistSuccessfulInsightResult,
  renderPeriodInsight,
  type MinimalSupabaseClient,
  type PeriodInsightResult,
} from "./shared";

export const PERIOD_PROMPT_VERSION = "period-v1";

export type PeriodAggregationRow = {
  tag_code: string;
  tag_name: string;
  dimension: string;
  play_count: number | null;
  follower_gain: number | null;
  full_completion_rate: number | null;
  is_hit: boolean;
};

export type PeriodGroupMetrics = {
  tag_code: string;
  tag_name: string;
  dimension: string;
  sample_size: number;
  hit_rate: number;
  follower_gain_rate_median: number;
  full_completion_rate_median: number;
};

export type PeriodInputBundle = {
  period_type: "week" | "month";
  scope_entity_id: string;
  groups: PeriodGroupMetrics[];
  sample_warning: string[];
};

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (!sorted.length) return 0;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWarningList(value: unknown) {
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

export function aggregatePeriodTagMetrics(rows: PeriodAggregationRow[], minSampleSize = 10) {
  const grouped = new Map<string, PeriodAggregationRow[]>();

  for (const row of rows) {
    const key = `${row.dimension}:${row.tag_code}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const groups: PeriodGroupMetrics[] = [];
  const sampleWarning: string[] = [];

  for (const [key, items] of grouped) {
    if (items.length < minSampleSize) {
      sampleWarning.push(`${key} 样本仅${items.length}条`);
      continue;
    }

    const followerGainRates = items
      .map((item) => {
        if (!item.play_count || item.play_count <= 0 || item.follower_gain == null) return null;
        return item.follower_gain / item.play_count;
      })
      .filter((item): item is number => typeof item === "number");
    const fullCompletionRates = items
      .map((item) => item.full_completion_rate)
      .filter((item): item is number => typeof item === "number");

    groups.push({
      tag_code: items[0]?.tag_code ?? key,
      tag_name: items[0]?.tag_name ?? key,
      dimension: items[0]?.dimension ?? "unknown",
      sample_size: items.length,
      hit_rate: items.filter((item) => item.is_hit).length / items.length,
      follower_gain_rate_median: median(followerGainRates),
      full_completion_rate_median: median(fullCompletionRates),
    });
  }

  groups.sort((a, b) => b.sample_size - a.sample_size || b.hit_rate - a.hit_rate);

  return { groups, sample_warning: sampleWarning };
}

export function buildPeriodPrompt(input: PeriodInputBundle) {
  return [
    `你是内容策略分析师。基于以下${input.period_type}数据，严格按JSON输出，JSON外不输出任何内容。`,
    "输出JSON结构：",
    "- best_direction: {tag, evidence(具体数字), recommendation(可执行)}",
    "- worst_direction: {tag, evidence, recommendation}",
    "- validated_experiments: [本期验证有效的测试，每条含数据]",
    "- next_period_focus: 下期重点方向，具体可执行",
    "- sample_warning: 样本不足的维度（如有）",
    "强制规则：",
    "1. 样本<10条的维度不输出结论，填sample_warning",
    '2. 禁止输出"继续保持优质内容"等废话',
    "3. 每个结论必须引用具体数字",
    "输入数据：",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function normalizeDirection(value: unknown) {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.tag) || !isNonEmptyString(value.evidence) || !isNonEmptyString(value.recommendation)) {
    return null;
  }

  return {
    tag: value.tag.trim(),
    evidence: value.evidence.trim(),
    recommendation: value.recommendation.trim(),
  };
}

export function normalizePeriodInsight(value: unknown): PeriodInsightResult | null {
  if (!isRecord(value)) return null;

  const bestDirection = normalizeDirection(value.best_direction);
  const worstDirection = normalizeDirection(value.worst_direction);
  const nextPeriodFocus = isNonEmptyString(value.next_period_focus) ? value.next_period_focus.trim() : null;

  if (!bestDirection || !worstDirection || !nextPeriodFocus) {
    return null;
  }

  const validatedExperiments = Array.isArray(value.validated_experiments)
    ? value.validated_experiments.filter(isNonEmptyString).map((item) => item.trim())
    : [];

  return {
    best_direction: bestDirection,
    worst_direction: worstDirection,
    validated_experiments: validatedExperiments,
    next_period_focus: nextPeriodFocus,
    sample_warning: normalizeWarningList(value.sample_warning),
  };
}

export function createPeriodResultPayload(result: PeriodInsightResult) {
  return {
    result_json: result,
    rendered_text: renderPeriodInsight(result),
  };
}

async function loadPeriodRows(supabase: MinimalSupabaseClient, input: { periodType: "week" | "month"; scopeEntityId: string }) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - (input.periodType === "month" ? 30 : 7) + 1);
  const since = sinceDate.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("content_item")
    .select(
      "id, account_id, biz_date, metric_snapshot(play_count, follower_gain, full_completion_rate), content_tag_link(tag_definition(tag_code, tag_name, dimension))"
    )
    .eq("account_id", input.scopeEntityId)
    .gte("biz_date", since);

  if (error) {
    throw new Error(error.message);
  }

  const rows: PeriodAggregationRow[] = [];

  for (const item of (data ?? []) as Array<Record<string, unknown>>) {
    const snapshots = Array.isArray(item.metric_snapshot) ? item.metric_snapshot : [];
    const tags = Array.isArray(item.content_tag_link) ? item.content_tag_link : [];
    const snapshot = snapshots.find((entry) => isRecord(entry)) as Record<string, unknown> | undefined;

    for (const tagLink of tags) {
      if (!isRecord(tagLink) || !isRecord(tagLink.tag_definition)) continue;
      const definition = tagLink.tag_definition;
      if (!isNonEmptyString(definition.tag_code) || !isNonEmptyString(definition.tag_name) || !isNonEmptyString(definition.dimension)) {
        continue;
      }

      const playCount = typeof snapshot?.play_count === "number" ? snapshot.play_count : null;
      rows.push({
        tag_code: definition.tag_code.trim(),
        tag_name: definition.tag_name.trim(),
        dimension: definition.dimension.trim(),
        play_count: playCount,
        follower_gain: typeof snapshot?.follower_gain === "number" ? snapshot.follower_gain : null,
        full_completion_rate: typeof snapshot?.full_completion_rate === "number" ? snapshot.full_completion_rate : null,
        is_hit: typeof playCount === "number" && playCount >= 10000,
      });
    }
  }

  return rows;
}

export async function runPeriodInsight(
  supabase: MinimalSupabaseClient,
  input: { periodType: "week" | "month"; scopeEntityId: string }
) {
  const rows = await loadPeriodRows(supabase, input);
  if (!rows.length) {
    throw new Error("该周期无可分析数据");
  }

  const aggregated = aggregatePeriodTagMetrics(rows);
  const bundle: PeriodInputBundle = {
    period_type: input.periodType,
    scope_entity_id: input.scopeEntityId,
    groups: aggregated.groups,
    sample_warning: aggregated.sample_warning,
  };

  const inputBundleId = await insertAiInputBundle({
    supabase,
    insightScope: input.periodType === "week" ? "member_week" : "member_month",
    scopeEntityId: input.scopeEntityId,
    dataQualityState: aggregated.groups.length ? "sufficient" : "partial",
    inputJson: bundle as unknown as Record<string, unknown>,
  });

  try {
    const prompt = buildPeriodPrompt(bundle);
    const aiResult = await callStructuredAi({ prompt, maxTokens: 1800 });
    const normalized = normalizePeriodInsight(JSON.parse(aiResult.jsonString));

    if (!normalized) {
      throw new Error("AI 返回内容解析失败");
    }

    const payload = createPeriodResultPayload(normalized);
    await persistSuccessfulInsightResult({
      supabase,
      inputBundleId,
      insightType: "period_direction",
      promptVersion: PERIOD_PROMPT_VERSION,
      resultJson: payload.result_json as unknown as Record<string, unknown>,
      renderedText: payload.rendered_text,
      modelName: aiResult.model,
    });

    return {
      input_bundle_id: inputBundleId,
      result: normalized,
      rendered_text: payload.rendered_text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "周期洞察生成失败";
    await persistFailedInsightResult({
      supabase,
      inputBundleId,
      insightType: "period_direction",
      promptVersion: PERIOD_PROMPT_VERSION,
      errorMessage: message,
    });
    throw error;
  }
}

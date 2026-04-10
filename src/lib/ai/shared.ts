import { callAiJson, extractJsonString } from "./client";

export { extractJsonString };
import type { createClient } from "@supabase/supabase-js";

export type StructuredAiMessageContent = string | Array<{ type?: unknown; text?: unknown }> | null | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MinimalSupabaseClient = ReturnType<typeof createClient<any>>;

export type SingleVideoSuggestion = {
  target: "hook" | "mid" | "cta";
  problem: string;
  action: string;
  example?: string;
};

export type SingleVideoInsightResult = {
  verdict: string;
  key_problem: {
    time_range: string | null;
    drop_rate: number | null;
    script_fragment: string | null;
    diagnosis: string;
  };
  suggestions: SingleVideoSuggestion[];
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

export type PeriodDirection = {
  tag: string;
  evidence: string;
  recommendation: string;
};

export type PeriodInsightResult = {
  best_direction: PeriodDirection;
  worst_direction: PeriodDirection;
  validated_experiments: string[];
  next_period_focus: string;
  sample_warning: string[];
};

export function normalizeMessageContent(content: StructuredAiMessageContent): string | null {
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const block = item as { type?: unknown; text?: unknown };
      return block.type === "text" && typeof block.text === "string" ? block.text.trim() : "";
    })
    .filter(Boolean)
    .join("\n");

  return text || null;
}


export async function callStructuredAi(input: {
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  featureKey?: string;
}) {
  const result = await callAiJson(input.prompt, {
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
    featureKey: input.featureKey,
  });

  const jsonString = extractJsonString(result.content);
  if (!jsonString) {
    throw new Error("AI 返回内容解析失败");
  }

  return {
    model: result.model,
    rawContent: result.content,
    jsonString,
    elapsedMs: result.elapsedMs,
  };
}

export async function insertAiInputBundle(input: {
  supabase: MinimalSupabaseClient;
  insightScope: "single_video" | "member_week" | "member_month" | "team_week" | "team_month";
  scopeEntityId: string | null;
  dataQualityState: "sufficient" | "partial" | "insufficient";
  inputJson: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase
    .from("ai_input_bundle")
    .insert({
      insight_scope: input.insightScope,
      scope_entity_id: input.scopeEntityId,
      data_quality_state: input.dataQualityState,
      input_json: input.inputJson,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "写入 ai_input_bundle 失败");
  }

  return data.id;
}

export async function persistFailedInsightResult(input: {
  supabase: MinimalSupabaseClient;
  inputBundleId: string;
  insightType: "growth_edit" | "period_direction";
  promptVersion: string;
  errorMessage: string;
}) {
  const { insert } = input.supabase.from("ai_insight_result");
  await insert({
    input_bundle_id: input.inputBundleId,
    insight_type: input.insightType,
    model_name: process.env.AI_MODEL || "claude-sonnet-4-6",
    prompt_version: input.promptVersion,
    result_status: "failed",
    rendered_text: input.errorMessage,
    result_json: { error: input.errorMessage },
  });
}

export async function persistSuccessfulInsightResult(input: {
  supabase: MinimalSupabaseClient;
  inputBundleId: string;
  insightType: "growth_edit" | "period_direction";
  promptVersion: string;
  resultJson: Record<string, unknown>;
  renderedText: string;
  modelName?: string;
}) {
  const { insert } = input.supabase.from("ai_insight_result");
  await insert({
    input_bundle_id: input.inputBundleId,
    insight_type: input.insightType,
    model_name: input.modelName ?? process.env.AI_MODEL ?? "claude-sonnet-4-6",
    prompt_version: input.promptVersion,
    result_status: "success",
    result_json: input.resultJson,
    rendered_text: input.renderedText,
  });
}

export function toAiErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "未知错误";
}

export function renderSingleVideoInsight(result: SingleVideoInsightResult) {
  const suggestionLines = result.suggestions.map((item, index) => {
    const parts = [`${index + 1}. [${item.target}] ${item.problem}`, `改法：${item.action}`];
    if (item.example) {
      parts.push(`示例：${item.example}`);
    }
    return parts.join("｜");
  });

  return [
    `结论：${result.verdict}`,
    `核心问题：${result.key_problem.time_range ?? "无明确掉点"}｜掉幅${result.key_problem.drop_rate ?? "无"}%｜${result.key_problem.diagnosis}`,
    `脚本片段：${result.key_problem.script_fragment ?? "无"}`,
    `建议：${suggestionLines.join("\n")}`,
    `置信度：${result.confidence}`,
    `证据：${result.evidence.join("；")}`,
  ].join("\n");
}

export function renderPeriodInsight(result: PeriodInsightResult) {
  return [
    `最佳方向：${result.best_direction.tag}｜${result.best_direction.evidence}｜${result.best_direction.recommendation}`,
    `最差方向：${result.worst_direction.tag}｜${result.worst_direction.evidence}｜${result.worst_direction.recommendation}`,
    `已验证实验：${result.validated_experiments.join("；") || "无"}`,
    `下期重点：${result.next_period_focus}`,
    `样本提醒：${result.sample_warning.join("；") || "无"}`,
  ].join("\n");
}

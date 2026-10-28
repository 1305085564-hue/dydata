import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { withTimeout } from "@/lib/timeout";
import { DEFAULT_EVALUATION_STANDARDS, evaluationSettingsKey, parseEvaluationStandards, hasCustomEvaluationTargets, type EvaluationStandards } from "./evaluation-standards";

export type EvaluationSettings = { standards: EvaluationStandards; updatedAt: string | null };
const queryOptions = { timeoutMs: 8000, operation: "evaluation-standards" };

function settingsError(message: string, code: "INTERNAL_ERROR" | "CONFLICT" = "INTERNAL_ERROR") {
  return new AppError({ code, message, publicMessage: message, operation: "evaluation-standards" });
}

/** 仅供可信服务端调用：companyKey 来自当前权限上下文，不接收浏览器范围。 */
export async function loadEvaluationSettings(supabase: SupabaseClient, teamId: string | null | undefined): Promise<EvaluationSettings> {
  const key = evaluationSettingsKey(teamId);
  const result = await withTimeout(async (signal) => supabase.from("system_settings")
    .select("value,updated_at").eq("key", key).abortSignal(signal).maybeSingle(), queryOptions);
  if (result.error) throw settingsError("评价标准读取失败，请稍后重试");
  if (!result.data) return { standards: structuredClone(DEFAULT_EVALUATION_STANDARDS), updatedAt: null };
  const parsed = parseEvaluationStandards(result.data.value?.standards);
  if (!parsed.success) throw settingsError("已保存的评价标准不完整，请联系负责人");
  return { standards: parsed.data, updatedAt: result.data.updated_at };
}

/** React cache 仅在当前请求去重；不做跨请求缓存，下一次读取立即取得已保存值。 */
export const readEvaluationStandards = cache(async (teamId: string | null | undefined): Promise<EvaluationStandards> => {
  // 无公司归属的个人业务沿用默认规则；不查询其他公司，也不提供设置权限。
  if (!teamId) return structuredClone(DEFAULT_EVALUATION_STANDARDS);
  const settings = await loadEvaluationSettings(createAdminClient(), teamId);
  return settings.standards;
});

export async function saveEvaluationSettings(supabase: SupabaseClient, teamId: string | null | undefined, userId: string, standards: EvaluationStandards, expectedUpdatedAt: string | null): Promise<EvaluationSettings> {
  const parsed = parseEvaluationStandards(standards);
  if (!parsed.success) throw settingsError(parsed.error);
  const key = evaluationSettingsKey(teamId);
  // 在旧版数据库上禁止保存会导致“显示与筛选不一致”的新基准。
  if (hasCustomEvaluationTargets(parsed.data)) {
    const probe = await withTimeout(async (signal) => supabase.rpc("admin_content_list_page", {
      p_view: "all", p_page: 1, p_page_size: 20, p_cursor: null,
      p_sort_field: "play_count", p_sort_dir: "desc", p_visible_user_ids: [],
      p_filters: { evaluationTargets: parsed.data.targets },
    }).abortSignal(signal), queryOptions);
    if (probe.error || probe.data?.diagnostics?.evaluationStandardsVersion !== 1) {
      throw settingsError("达标基准尚未完成数据升级，暂不能保存，请联系负责人");
    }
  }
  const previous = await loadEvaluationSettings(supabase, teamId);
  if (previous.updatedAt !== expectedUpdatedAt) throw settingsError("评价标准已更新，请刷新后重新修改", "CONFLICT");
  const updatedAt = new Date(Math.max(Date.now(), previous.updatedAt ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
  const values = {
    value: { standards: parsed.data, previous },
    updated_at: updatedAt,
    updated_by: userId,
    description: "公司统一评价标准（上一版随记录备份）",
  };
  const result = await withTimeout(async (signal) => {
    const query = expectedUpdatedAt === null
      ? supabase.from("system_settings").insert({ key, ...values })
      : supabase.from("system_settings").update(values).eq("key", key).eq("updated_at", expectedUpdatedAt);
    return query.select("updated_at").abortSignal(signal).maybeSingle();
  }, queryOptions);
  if (result.error?.code === "23505" || (!result.error && !result.data)) throw settingsError("评价标准已更新，请刷新后重新修改", "CONFLICT");
  if (result.error) throw settingsError("评价标准保存失败，请稍后重试");
  return { standards: parsed.data, updatedAt: result.data!.updated_at };
}

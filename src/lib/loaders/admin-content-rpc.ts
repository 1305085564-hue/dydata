import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";
import { DEFAULT_RATING_RULE } from "@/lib/breakout-rating";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentListCursor, ContentListQuery } from "@/lib/content/domain/content-list-query";
import {
  hasNarrowingContentFilters,
  hasScopedContentFilters,
  resolveActiveDateWindow,
  sumAvailableCountsForWindow,
} from "@/lib/content/domain/content-count-summary";

export function buildEvaluationTargetsPayload(standards?: EvaluationStandards) {
  const effectiveStandards = standards ?? DEFAULT_EVALUATION_STANDARDS;
  return {
    ...effectiveStandards.targets,
    bounceRate2s: effectiveStandards.bounceRate2s,
    completionRate5s: effectiveStandards.completionRate5s,
    avgPlayDuration: effectiveStandards.avgPlayDuration,
    avgPlayRatio: effectiveStandards.avgPlayRatio,
    completionRate: effectiveStandards.completionRate,
    retentionWeights: effectiveStandards.retentionWeights,
    ratingRule: DEFAULT_RATING_RULE,
  };
}

/** One read operation: the list RPC and independent member options share a rejection boundary. */
export async function queryAdminContentRpcPage({ supabase, query, scope, cursor, evaluationStandards }: {
  supabase: SupabaseClient;
  evaluationStandards?: EvaluationStandards;
  query: ContentListQuery;
  scope: { visibleUserIds: string[]; activeVisibleUserIds: string[] };
  cursor: ContentListCursor | null;
}) {
  const rpcStart = performance.now();
  let rpcDurationMs = 0;
  const [result, profilesResult] = await Promise.all([
    supabase.rpc("admin_content_list_page", {
      p_view: query.view,
      p_page: query.page,
      p_page_size: query.pageSize,
      p_cursor: cursor ? { sortValue: cursor.sortValue, id: cursor.id, direction: cursor.direction } : null,
      p_sort_field: query.sortField,
      p_sort_dir: query.sortDir,
      p_visible_user_ids: scope.visibleUserIds,
      p_filters: {
        evaluationTargets: buildEvaluationTargetsPayload(evaluationStandards),
        userId: query.filters.userId,
        accountId: query.filters.accountId,
        keyword: query.filters.keyword,
        startDate: query.filters.startDate,
        endDate: query.filters.endDate,
        playBucket: query.filters.playBucket,
        playMin: query.filters.playMin,
        playMax: query.filters.playMax,
        qualityGrade: query.filters.qualityGrade,
        onlyAnomaly: query.filters.onlyAnomaly,
        topicStatus: query.filters.topicStatus,
        highlightRules: query.filters.highlightRules,
        highlightOnly: query.filters.highlightOnly,
      },
    }).then((result) => {
      rpcDurationMs = Math.max(0, performance.now() - rpcStart);
      return result;
    }),
    supabase.from("profiles")
      .select("id, name")
      .in("id", scope.visibleUserIds)
      .order("name", { ascending: true }),
  ]);
  return { result, profilesResult, rpcDurationMs };
}

/** 只读统计当前日期窗口内未加收窄筛选的真实总基数（用于负责人/账号/关键词筛选时准确回显「命中 X / 共 Y 条」）。 */
export async function queryAdminContentUnfilteredTotal({
  supabase,
  view,
  scope,
  startDate,
  endDate,
  evaluationStandards,
}: {
  supabase: SupabaseClient;
  view: "all" | "trash";
  scope: { visibleUserIds: string[] };
  startDate: string;
  endDate: string;
  evaluationStandards?: EvaluationStandards;
}): Promise<number | null> {
  const { data, error } = await supabase.rpc("admin_content_list_page", {
    p_view: view,
    p_page: 1,
    p_page_size: 20,
    p_cursor: null,
    p_sort_field: "published_at",
    p_sort_dir: "desc",
    p_visible_user_ids: scope.visibleUserIds,
    p_filters: {
      evaluationTargets: buildEvaluationTargetsPayload(evaluationStandards),
      userId: "",
      accountId: "",
      keyword: "",
      startDate,
      endDate,
      playBucket: "",
      playMin: "",
      playMax: "",
      qualityGrade: "all",
      onlyAnomaly: false,
      topicStatus: "all",
      highlightRules: {},
      highlightOnly: false,
    },
  });
  if (error || !data || typeof data !== "object") return null;
  const total = (data as { summary?: { totalVideos?: unknown } }).summary?.totalVideos;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

/** 统一解析当前列表请求对应的未筛选总基数（无筛选与二级筛选零额外查询，人员/账号/关键词筛选走只读统计）。 */
export async function resolveAdminContentUnfilteredTotal({
  supabase,
  query,
  scope,
  evaluationStandards,
  matchedTotal,
  availableDates,
  availableCounts,
}: {
  supabase: SupabaseClient;
  query: ContentListQuery;
  scope: { visibleUserIds: string[] };
  evaluationStandards?: EvaluationStandards;
  matchedTotal: number;
  availableDates?: string[];
  availableCounts?: Array<{ d: string; c: number }>;
}): Promise<number | null> {
  if (!hasNarrowingContentFilters(query.filters)) {
    return matchedTotal;
  }
  const activeWindow = resolveActiveDateWindow(query.filters, availableDates ?? []);
  if (!hasScopedContentFilters(query.filters)) {
    const windowTotal = sumAvailableCountsForWindow(availableCounts, activeWindow);
    return windowTotal === null ? null : Math.max(matchedTotal, windowTotal);
  }
  const rawTotal = await queryAdminContentUnfilteredTotal({
    supabase,
    view: query.view,
    scope,
    startDate: activeWindow.startDate,
    endDate: activeWindow.endDate,
    evaluationStandards,
  }).catch(() => null);
  return typeof rawTotal === "number" ? Math.max(matchedTotal, rawTotal) : null;
}

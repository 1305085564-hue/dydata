import type { EvaluationStandards } from "@/lib/evaluation-standards";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentListCursor, ContentListQuery } from "@/lib/content/domain/content-list-query";

/** One read operation: the list RPC and independent member options share a rejection boundary. */
export async function queryAdminContentRpcPage({ supabase, query, scope, cursor, evaluationStandards }: {
  supabase: SupabaseClient;
  evaluationStandards?: EvaluationStandards;
  query: ContentListQuery;
  scope: { visibleUserIds: string[]; activeVisibleUserIds?: string[] };
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
        evaluationTargets: evaluationStandards?.targets,
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
      .in("id", scope.activeVisibleUserIds ?? scope.visibleUserIds)
      .order("name", { ascending: true }),
  ]);
  return { result, profilesResult, rpcDurationMs };
}

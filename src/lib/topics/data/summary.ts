import type { DataAccessScope } from "@/lib/data-access-scope";
import { fetchAllQueryPages } from "@/lib/supabase/query-error";
import { computeInternalMetrics } from "../metrics";
import { calculateTopicWorkSummary } from "../domain";
import type { TopicSupabase } from "./types";
import type { TopicWorkMetricInput, TopicWorkSummary } from "../domain";

type ScopedWorkRow = Record<string, unknown> & { user_id?: string | null };

function applyScope<T extends { user_id?: string | null }>(rows: T[], scope: DataAccessScope) {
  if (scope.kind === "all") return rows;
  return rows.filter((row) => row.user_id && scope.visibleUserIds.includes(row.user_id));
}

export async function loadTopicSummaries(supabase: TopicSupabase, subTopicIds: string[], scope: DataAccessScope) {
  const summaryMap = new globalThis.Map<string, TopicWorkSummary>();
  if (!subTopicIds.length) return summaryMap;
  const data = await fetchAllQueryPages<Record<string, unknown> & { user_id?: string | null }>(
    (from, to) => {
      let query = supabase
        .from("videos")
        .select("topic_id, user_id, content, uploaded_at, video_metrics_snapshots(play_count)")
        .eq("lifecycle_state", "active")
        .in("topic_id", subTopicIds);
      if (scope.kind !== "all") query = query.in("user_id", scope.visibleUserIds);
      return query.order("uploaded_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
    },
    "加载选题汇总失败",
  );
  return summarizeScopedWorksBySubTopic(data, scope);
}

export function summarizeScopedWorksBySubTopic(rows: ScopedWorkRow[], scope: DataAccessScope) {
  const rowsBySubTopic = new globalThis.Map<string, TopicWorkMetricInput[]>();
  for (const row of applyScope(rows, scope)) {
    const subTopicId = String(row.topic_id ?? "");
    if (!subTopicId) continue;
    const snapshots = Array.isArray(row.video_metrics_snapshots) ? row.video_metrics_snapshots as Array<{ play_count?: number | null }> : [];
    const playCount = snapshots.reduce((max, snapshot) => Math.max(max, Number(snapshot.play_count ?? 0)), 0);
    const list = rowsBySubTopic.get(subTopicId) ?? [];
    list.push({ playCount, content: typeof row.content === "string" ? row.content : null, uploadedAt: typeof row.uploaded_at === "string" ? row.uploaded_at : null });
    rowsBySubTopic.set(subTopicId, list);
  }
  const summaryMap = new globalThis.Map<string, TopicWorkSummary>();
  for (const [subTopicId, workRows] of rowsBySubTopic) {
    const summary = calculateTopicWorkSummary(workRows);
    summary.internalMetrics = computeInternalMetrics(workRows);
    summaryMap.set(subTopicId, summary);
  }
  return summaryMap;
}

export function filterRemovedSubTopicRows(rows: unknown[]) {
  return (rows as Array<Record<string, unknown>>).filter((row) => {
    const subTopic = Array.isArray(row.sub_topics) ? row.sub_topics[0] : row.sub_topics;
    return (subTopic as { library_status?: string } | null)?.library_status !== "removed";
  });
}

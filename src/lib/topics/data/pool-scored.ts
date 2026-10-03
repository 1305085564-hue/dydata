import type { DataAccessScope } from "@/lib/data-access-scope";
import { measureAsync } from "@/lib/perf";
import { fetchAllQueryPages } from "@/lib/supabase/query-error";
import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "../metrics";
import { calculateTopicWorkSummary, matchesPostFilters, matchesTopicPoolQuery } from "../domain";
import { buildTopicPoolItem } from "../domain/pool";
import type { ApiResult, Recent7dHeat, TopicPoolQueryOptions, TopicWorkSummary } from "../domain";
import { applyDurationRangeFilter } from "./query-filters";
import { aggregatesToHeatMap, aggregatesToSummaryMap, tryLoadTopicPoolAggregates } from "./aggregates";
import { loadRecent7dHeat } from "./heat";
import { summarizeScopedWorksBySubTopic } from "./summary";
import type { TopicSupabase } from "./types";

type ScoreMode = "trending" | "high_potential";
type ScopedWorkRow = Record<string, unknown> & { user_id?: string | null };

function calcFlowScore(avgPlayCount: number | null) {
  const playCount = avgPlayCount ?? 0;
  if (playCount >= 200_000) return 0.6;
  if (playCount >= 100_000) return 0.5;
  if (playCount >= 50_000) return 0.4;
  if (playCount >= TOPIC_LIBRARY_QUALIFY_PLAY_COUNT) return 0.3;
  return 0.1;
}
function calcTimeScore(daysSinceLastWork: number, mode: ScoreMode) {
  if (mode === "trending") {
    if (daysSinceLastWork <= 3) return 0.4;
    if (daysSinceLastWork <= 7) return 0.3;
    return 0.2;
  }
  if (daysSinceLastWork > 60) return 0.4;
  if (daysSinceLastWork > 45) return 0.3;
  return 0.2;
}
function calcTopicScore(avgPlayCount: number | null, daysSinceLastWork: number, mode: ScoreMode) {
  return calcFlowScore(avgPlayCount) + calcTimeScore(daysSinceLastWork, mode);
}
function recent7dHeatExtra(heat: Map<string, Recent7dHeat>, subTopicId: string) {
  const entry = heat.get(subTopicId);
  return { recent7dCompletedCount: entry?.completedCount ?? 0, recent7dInProgressCount: entry?.inProgressCount ?? 0, recent7dParticipants: entry?.participants ?? 0, ...(typeof entry?.currentWritingCount === "number" ? { currentWritingCount: entry.currentWritingCount } : {}) };
}

export async function loadScoredTopicPool(supabase: TopicSupabase, userId: string, scope: DataAccessScope, options: TopicPoolQueryOptions, mode: ScoreMode): Promise<ApiResult<unknown>> {
  let subTopicsQuery = supabase.from("sub_topics").select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)").eq("library_status", "in_library").in("created_by", scope.visibleUserIds).order("created_at", { ascending: false });
  if (options.topicIds.length > 0) subTopicsQuery = subTopicsQuery.in("topic_id", options.topicIds);
  if (options.sourceType) subTopicsQuery = subTopicsQuery.eq("source_type", options.sourceType);
  if (options.durationRange) subTopicsQuery = applyDurationRangeFilter(subTopicsQuery, options.durationRange);
  const { data: subTopics, error: subTopicsError } = await measureAsync("topics.pool.scored.subTopics", () => subTopicsQuery);
  if (subTopicsError) return { ok: false, status: 500, message: subTopicsError.message };
  const allSubTopics = (subTopics ?? []) as Array<Record<string, unknown>>;
  const subTopicIds = allSubTopics.map((item) => String(item.id));
  if (subTopicIds.length === 0) return { ok: true, value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } } };
  const aggregates = await tryLoadTopicPoolAggregates(supabase, scope);
  let heat: Map<string, Recent7dHeat>;
  if (aggregates) heat = aggregatesToHeatMap(aggregates);
  else {
    try { heat = await measureAsync("topics.pool.scored.heat", () => loadRecent7dHeat(supabase, subTopicIds, scope)); }
    catch (error) { return { ok: false, status: 500, message: error instanceof Error ? error.message : "七天热度加载失败" }; }
  }
  const worksBySubTopic = new globalThis.Map<string, { latestUploadedAt: string; playCounts: number[] }>();
  let fallbackWorks: unknown[] = [];
  if (!aggregates) {
    const works = await measureAsync("topics.pool.scored.works", () => fetchAllQueryPages<ScopedWorkRow>((from, to) => {
      let worksQuery = supabase.from("videos").select("topic_id, user_id, content, uploaded_at, video_metrics_snapshots(play_count)").eq("lifecycle_state", "active").in("topic_id", subTopicIds);
      if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
      return worksQuery.order("uploaded_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
    }, "加载选题作品失败"));
    fallbackWorks = works;
    for (const work of (works ?? []) as Array<Record<string, unknown> & { user_id?: string | null }>) {
      const subTopicId = String(work.topic_id ?? "");
      if (!subTopicId) continue;
      const uploadedAt = typeof work.uploaded_at === "string" ? work.uploaded_at : "";
      const snapshots = Array.isArray(work.video_metrics_snapshots) ? work.video_metrics_snapshots as Array<{ play_count?: number | null }> : [];
      const playCount = snapshots.reduce((maximum, snapshot) => Math.max(maximum, Number(snapshot.play_count ?? 0)), 0);
      const aggregate = worksBySubTopic.get(subTopicId);
      if (!aggregate) { worksBySubTopic.set(subTopicId, { latestUploadedAt: uploadedAt, playCounts: [playCount] }); continue; }
      if (uploadedAt > aggregate.latestUploadedAt) aggregate.latestUploadedAt = uploadedAt;
      aggregate.playCounts.push(playCount);
    }
  }
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const scored: Array<{ item: Record<string, unknown>; score: number; daysSinceLastWork: number; avgPlayCount: number | null; bestPlayCount: number | null; qualifiedCount: number; recent7dParticipants: number; recent7dCompletedCount: number; recent7dInProgressCount: number }> = [];
  for (const item of allSubTopics) {
    let avgPlayCount: number | null; let bestPlayCount: number | null; let qualifiedCount: number; let daysSinceLastWork: number;
    if (aggregates) {
      const aggregate = aggregates.get(String(item.id));
      if (!aggregate) continue;
      avgPlayCount = aggregate.averagePlayCount; bestPlayCount = aggregate.bestPlayCount; qualifiedCount = aggregate.qualifiedWorkCount;
      const latestTimestamp = Date.parse(aggregate.latestUploadedAt ?? "");
      daysSinceLastWork = Number.isFinite(latestTimestamp) ? Math.max(0, Math.floor((now - latestTimestamp) / millisecondsPerDay)) : 999;
    } else {
      const aggregate = worksBySubTopic.get(String(item.id));
      if (!aggregate) continue;
      const qualifiedPlayCounts = aggregate.playCounts.filter((playCount) => playCount >= TOPIC_LIBRARY_QUALIFY_PLAY_COUNT);
      avgPlayCount = qualifiedPlayCounts.length ? Math.round(qualifiedPlayCounts.reduce((total, playCount) => total + playCount, 0) / qualifiedPlayCounts.length) : null;
      const latestTimestamp = Date.parse(aggregate.latestUploadedAt);
      daysSinceLastWork = Number.isFinite(latestTimestamp) ? Math.max(0, Math.floor((now - latestTimestamp) / millisecondsPerDay)) : 999;
      bestPlayCount = aggregate.playCounts.length ? Math.max(...aggregate.playCounts) : null; qualifiedCount = qualifiedPlayCounts.length;
    }
    if (mode === "trending" && daysSinceLastWork > 30) continue;
    if (mode === "high_potential" && daysSinceLastWork <= 30) continue;
    if (!matchesTopicPoolQuery(item, options.q)) continue;
    const heatEntry = heat.get(String(item.id));
    scored.push({ item, score: calcTopicScore(avgPlayCount, daysSinceLastWork, mode), daysSinceLastWork, avgPlayCount, bestPlayCount, qualifiedCount, recent7dParticipants: heatEntry?.participants ?? 0, recent7dCompletedCount: heatEntry?.completedCount ?? 0, recent7dInProgressCount: heatEntry?.inProgressCount ?? 0 });
  }
  const filteredScored = options.recentHeat || options.performance ? scored.filter((entry) => matchesPostFilters({ recent7dParticipants: entry.recent7dParticipants, recent7dCompletedCount: entry.recent7dCompletedCount, recent7dInProgressCount: entry.recent7dInProgressCount, summary: { bestPlayCount: entry.bestPlayCount, qualifiedWorkCount: entry.qualifiedCount, averagePlayCount: entry.avgPlayCount } }, options)) : scored;
  void scored;
  filteredScored.sort((left, right) => {
    if (options.sort === "avg_play") return (right.avgPlayCount ?? 0) - (left.avgPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
    if (options.sort === "best_play") return (right.bestPlayCount ?? 0) - (left.bestPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
    if (options.sort === "recent_heat") return (heat.get(String(right.item.id))?.participants ?? 0) - (heat.get(String(left.item.id))?.participants ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
    if (options.sort === "latest") return (Date.parse(String(right.item.created_at ?? "")) || 0) - (Date.parse(String(left.item.created_at ?? "")) || 0) || String(left.item.id).localeCompare(String(right.item.id));
    return right.score - left.score || (right.avgPlayCount ?? 0) - (left.avgPlayCount ?? 0) || String(left.item.id).localeCompare(String(right.item.id));
  });
  const totalItems = filteredScored.length;
  const from = (options.page - 1) * options.pageSize;
  const pageItems = filteredScored.slice(from, from + options.pageSize);
  const summaries = aggregates ? aggregatesToSummaryMap(aggregates) : summarizeScopedWorksBySubTopic(fallbackWorks as ScopedWorkRow[], scope);
  return { ok: true, value: { items: pageItems.map(({ item, score, daysSinceLastWork, avgPlayCount, bestPlayCount }) => buildTopicPoolItem(item, userId, scope, summaries.get(String(item.id)) ?? calculateTopicWorkSummary([]), { _score: score, _daysSinceLastWork: daysSinceLastWork, _avgPlayCount: avgPlayCount, _bestPlayCount: bestPlayCount, ...recent7dHeatExtra(heat, String(item.id)) })), pagination: { page: options.page, pageSize: options.pageSize, totalItems } } };
}

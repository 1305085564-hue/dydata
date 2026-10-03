import type { DataAccessScope } from "@/lib/data-access-scope";
import { measureAsync } from "@/lib/perf";
import { fetchAllQueryPages } from "@/lib/supabase/query-error";
import { calculateTopicWorkSummary, matchesPostFilters, matchesTopicPoolQuery, sortTopicPoolItems } from "../domain";
import { buildTopicPoolItem } from "../domain/pool";
import type { ApiResult, CurrentUserClaim, Recent7dHeat, TopicPoolQueryOptions, TopicWorkSummary } from "../domain";
import { timeRangeStartIso } from "../domain/internal";
import { applyDurationRangeFilter } from "./query-filters";
import { loadScoredTopicPool } from "./pool-scored";
import { aggregatesToHeatMap, aggregatesToSummaryMap, tryLoadTopicPoolAggregates } from "./aggregates";
import { loadRecent7dHeat } from "./heat";
import { loadTopicSummaries } from "./summary";
import type { TopicSupabase } from "./types";

function applyScope<T extends { user_id?: string | null }>(rows: T[], scope: DataAccessScope) {
  if (scope.kind === "all") return rows;
  return rows.filter((row) => row.user_id && scope.visibleUserIds.includes(row.user_id));
}
function recent7dHeatExtra(heat: Map<string, Recent7dHeat>, subTopicId: string) {
  const entry = heat.get(subTopicId);
  return { recent7dCompletedCount: entry?.completedCount ?? 0, recent7dInProgressCount: entry?.inProgressCount ?? 0, recent7dParticipants: entry?.participants ?? 0, ...(typeof entry?.currentWritingCount === "number" ? { currentWritingCount: entry.currentWritingCount } : {}) };
}

async function loadNeverWorkedTopics(supabase: TopicSupabase, userId: string, scope: DataAccessScope, options: TopicPoolQueryOptions): Promise<ApiResult<unknown>> {
  let subTopicsQuery = supabase.from("sub_topics").select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)").eq("library_status", "in_library").in("created_by", scope.visibleUserIds).order("created_at", { ascending: false });
  if (options.topicIds.length > 0) subTopicsQuery = subTopicsQuery.in("topic_id", options.topicIds);
  if (options.sourceType) subTopicsQuery = subTopicsQuery.eq("source_type", options.sourceType);
  if (options.durationRange) subTopicsQuery = applyDurationRangeFilter(subTopicsQuery, options.durationRange);
  const { data: subTopics, error: subTopicsError } = await subTopicsQuery;
  if (subTopicsError) return { ok: false, status: 500, message: subTopicsError.message };
  const allSubTopics = (subTopics ?? []) as Array<Record<string, unknown>>;
  const subTopicIds = allSubTopics.map((item) => String(item.id));
  if (subTopicIds.length === 0) return { ok: true, value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } } };
  const aggregates = await tryLoadTopicPoolAggregates(supabase, scope);
  let heat: Map<string, Recent7dHeat>;
  if (aggregates) heat = aggregatesToHeatMap(aggregates);
  else {
    try { heat = await measureAsync("topics.pool.neverWorked.heat", () => loadRecent7dHeat(supabase, subTopicIds, scope)); }
    catch (error) { return { ok: false, status: 500, message: error instanceof Error ? error.message : "七天热度加载失败" }; }
  }
  let workedIds: Set<string>;
  if (aggregates) workedIds = new Set([...aggregates.entries()].flatMap(([topicId, aggregate]) => aggregate.workCount > 0 ? [topicId] : []));
  else {
    const works = await fetchAllQueryPages<{ topic_id?: string | null; user_id?: string | null }>((from, to) => {
      let worksQuery = supabase.from("videos").select("topic_id, user_id").eq("lifecycle_state", "active").in("topic_id", subTopicIds);
      if (scope.kind !== "all") worksQuery = worksQuery.in("user_id", scope.visibleUserIds);
      return worksQuery.order("id", { ascending: true }).range(from, to);
    }, "加载选题作品失败");
    workedIds = new Set(applyScope(works, scope).map((work) => work.topic_id).filter((id): id is string => Boolean(id)));
  }
  const neverWorked = allSubTopics.filter((item) => !workedIds.has(String(item.id))).filter((item) => matchesTopicPoolQuery(item, options.q));
  const builtItems = neverWorked.map((item) => buildTopicPoolItem(item, userId, scope, calculateTopicWorkSummary([]), { _daysSinceLastWork: null, _avgPlayCount: null, ...recent7dHeatExtra(heat, String(item.id)) }));
  const sortedItems = options.sort ? sortTopicPoolItems(builtItems as Array<import("../domain/types").SortableTopicPoolItem & Record<string, unknown>>, options.sort) : builtItems;
  const from = (options.page - 1) * options.pageSize;
  const pageItems = sortedItems.slice(from, from + options.pageSize);
  return { ok: true, value: { items: pageItems, pagination: { page: options.page, pageSize: options.pageSize, totalItems: sortedItems.length } } };
}

export async function loadTopicPool(supabase: TopicSupabase, userId: string, scope: DataAccessScope, options: TopicPoolQueryOptions): Promise<ApiResult<unknown>> {
  if (options.view === "trending") return loadScoredTopicPool(supabase, userId, scope, options, "trending");
  if (options.view === "high_potential") return loadScoredTopicPool(supabase, userId, scope, options, "high_potential");
  if (options.view === "never_worked") return loadNeverWorkedTopics(supabase, userId, scope, options);
  const from = (options.page - 1) * options.pageSize;
  const since = timeRangeStartIso(options.timeRange);
  let query = supabase.from("sub_topics").select("*, topics(id, name, sort_order), topic_groups(id, name, sort_order), sub_topic_claims(id, user_id, status, claimed_at)", { count: "exact" }).eq("library_status", "in_library").in("created_by", scope.visibleUserIds).order("created_at", { ascending: false });
  if (options.sourceType) query = query.eq("source_type", options.sourceType);
  if (options.durationRange) query = applyDurationRangeFilter(query, options.durationRange);
  let myClaimsDirectMap: Map<string, CurrentUserClaim> | null = null;
  if (options.view === "my_claims") {
    const { data: myClaimsRows, error: myClaimsError } = await supabase.from("sub_topic_claims").select("id, sub_topic_id, status, claimed_at").eq("user_id", userId).eq("status", "writing");
    if (myClaimsError) return { ok: false, status: 500, message: myClaimsError.message };
    myClaimsDirectMap = new globalThis.Map();
    const claimedIds: string[] = [];
    for (const row of (myClaimsRows ?? []) as Array<{ id?: unknown; sub_topic_id?: unknown; status?: unknown; claimed_at?: unknown }>) {
      const subTopicId = typeof row.sub_topic_id === "string" ? row.sub_topic_id : null;
      const claimId = typeof row.id === "string" ? row.id : null;
      if (!subTopicId || !claimId || row.status !== "writing") continue;
      claimedIds.push(subTopicId);
      if (!myClaimsDirectMap.has(subTopicId)) myClaimsDirectMap.set(subTopicId, { id: claimId, subTopicId, status: "writing", claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null });
    }
    const uniqueClaimedIds = [...new Set(claimedIds)];
    if (uniqueClaimedIds.length === 0) return { ok: true, value: { items: [], pagination: { page: options.page, pageSize: options.pageSize, totalItems: 0 } } };
    query = query.in("id", uniqueClaimedIds);
  } else {
    if (since) query = query.gte("created_at", since);
  }
  if (options.topicIds.length > 0) query = query.in("topic_id", options.topicIds);
  if (options.view === "my_created") query = query.eq("created_by", userId);
  const { data, error } = await measureAsync("topics.pool.items", () => query);
  if (error) return { ok: false, status: 500, message: error.message };
  const items = ((data ?? []) as Array<Record<string, unknown>>).filter((item) => matchesTopicPoolQuery(item, options.q));
  const aggregates = await tryLoadTopicPoolAggregates(supabase, scope);
  let heat: Map<string, Recent7dHeat>;
  if (aggregates) heat = aggregatesToHeatMap(aggregates);
  else {
    try { heat = await measureAsync("topics.pool.heat", () => loadRecent7dHeat(supabase, items.map((item) => String(item.id)), scope)); }
    catch (error) { return { ok: false, status: 500, message: error instanceof Error ? error.message : "七天热度加载失败" }; }
  }
  let summaries: Map<string, TopicWorkSummary>;
  if (aggregates) summaries = aggregatesToSummaryMap(aggregates);
  else {
    try { summaries = await measureAsync("topics.pool.summaries", () => loadTopicSummaries(supabase, items.map((item) => String(item.id)), scope)); }
    catch (error) { return { ok: false, status: 500, message: error instanceof Error ? error.message : "选题汇总加载失败" }; }
  }
  const builtItems = items.map((item) => buildTopicPoolItem(item, userId, scope, summaries.get(String(item.id)) ?? calculateTopicWorkSummary([]), recent7dHeatExtra(heat, String(item.id))));
  const visibleItems = options.recentHeat || options.performance ? builtItems.filter((item) => matchesPostFilters(item as Record<string, unknown>, options)) : builtItems;
  if (myClaimsDirectMap) for (const item of visibleItems) {
    const directClaim = myClaimsDirectMap.get(String((item as Record<string, unknown>).id));
    if (directClaim) (item as Record<string, unknown>).myClaim = directClaim;
  }
  const sortedItems = options.sort ? sortTopicPoolItems(visibleItems as Array<import("../domain/types").SortableTopicPoolItem & Record<string, unknown>>, options.sort) : visibleItems;
  const pageItems = sortedItems.slice(from, from + options.pageSize);
  return { ok: true, value: { items: pageItems, pagination: { page: options.page, pageSize: options.pageSize, totalItems: sortedItems.length } } };
}

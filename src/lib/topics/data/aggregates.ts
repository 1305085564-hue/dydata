import { measureAsync } from "@/lib/perf";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { calculateTopicWorkSummary } from "../domain";
import type { Recent7dHeat, TopicPoolWorkAggregate, TopicWorkSummary } from "../domain";
import type { TopicSupabase } from "./types";

export async function loadTopicPoolWorkAggregates(supabase: TopicSupabase, scope: DataAccessScope): Promise<Map<string, TopicPoolWorkAggregate>> {
  let result = await supabase.rpc("topics_pool_aggregates", { p_team_id: scope.teamId });
  if (result.error) {
    if (result.error.code !== "PGRST202" && result.error.code !== "42883") throw new Error(result.error.message);
    result = await supabase.rpc("topics_pool_aggregates", { p_visible_user_ids: scope.kind === "all" ? null : scope.visibleUserIds });
  }
  const { data, error } = result;
  if (error) throw new Error(error.message);
  const map = new globalThis.Map<string, TopicPoolWorkAggregate>();
  for (const [topicId, payload] of Object.entries((data ?? {}) as Record<string, TopicPoolWorkAggregate>)) {
    if (!payload || typeof payload !== "object") continue;
    map.set(topicId, {
      workCount: Number(payload.workCount ?? 0), internalBestPlay: payload.internalBestPlay ?? null, internalAvgPlay: payload.internalAvgPlay ?? null,
      qualifiedWorkCount: Number(payload.qualifiedWorkCount ?? 0), averagePlayCount: payload.averagePlayCount ?? null, bestPlayCount: payload.bestPlayCount ?? null,
      bestCopy: payload.bestCopy ?? null, latestCopy: payload.latestCopy ?? null, latestUploadedAt: payload.latestUploadedAt ?? null,
      completedCount: Number(payload.completedCount ?? 0), inProgressCount: Number(payload.inProgressCount ?? 0), participants: Number(payload.participants ?? 0),
      ...(typeof payload.currentWritingCount === "number" ? { currentWritingCount: payload.currentWritingCount } : {}),
    });
  }
  return map;
}

export function aggregateToSummary(aggregate: TopicPoolWorkAggregate): TopicWorkSummary {
  return { qualifiedWorkCount: aggregate.qualifiedWorkCount, averagePlayCount: aggregate.averagePlayCount, bestPlayCount: aggregate.bestPlayCount, bestCopy: aggregate.bestCopy, latestCopy: aggregate.latestCopy, internalMetrics: { bestPlayCount: aggregate.internalBestPlay, averagePlayCount: aggregate.internalAvgPlay, qualifiedWorkCount: aggregate.qualifiedWorkCount, workCount: aggregate.workCount } };
}

export function aggregateToHeat(aggregate: TopicPoolWorkAggregate): Recent7dHeat {
  return { completedCount: aggregate.completedCount, inProgressCount: aggregate.inProgressCount, participants: aggregate.participants, ...(typeof aggregate.currentWritingCount === "number" ? { currentWritingCount: aggregate.currentWritingCount } : {}) };
}

export function aggregatesToHeatMap(aggregates: Map<string, TopicPoolWorkAggregate>) {
  return new globalThis.Map(Array.from(aggregates, ([id, aggregate]) => [id, aggregateToHeat(aggregate)]));
}

export function aggregatesToSummaryMap(aggregates: Map<string, TopicPoolWorkAggregate>) {
  return new globalThis.Map(Array.from(aggregates, ([id, aggregate]) => [id, aggregateToSummary(aggregate)]));
}

export async function tryLoadTopicPoolAggregates(supabase: TopicSupabase, scope: DataAccessScope): Promise<Map<string, TopicPoolWorkAggregate> | null> {
  try {
    return await measureAsync("topics.pool.aggregates", () => loadTopicPoolWorkAggregates(supabase, scope));
  } catch (err) {
    console.error("[topics] tryLoadTopicPoolAggregates RPC failed, fallback to in-memory", err);
    return null;
  }
}

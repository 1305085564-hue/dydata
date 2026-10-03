import { measureAsync } from "@/lib/perf";
import type { DataAccessScope } from "@/lib/data-access-scope";
import type { Recent7dHeat, TopicPoolWorkAggregate, TopicWorkSummary } from "../domain";
import type { TopicSupabase } from "./types";

/**
 * 选题池聚合 RPC（20260830120000_topics_pool_aggregates）：一次调用拿到全部 in_library
 * 子题的内部成绩/达标汇总/最新作品时间/近 7 天热度，替代三条 pool 路径各自的作品全量扫描。
 * 拉不到 RPC 时（迁移未执行等）由调用方回退到原内存聚合路径，语义一致。
 */
export async function loadTopicPoolWorkAggregates(
  supabase: TopicSupabase,
  scope: DataAccessScope,
): Promise<Map<string, TopicPoolWorkAggregate>> {
  let result = await supabase.rpc("topics_pool_aggregates", { p_team_id: scope.teamId });
  if (result.error) {
    // 应用先部署：新 migration 尚未执行时兼容旧 RPC；迁移后旧签名会被删除。
    if (result.error.code !== "PGRST202" && result.error.code !== "42883") {
      throw new Error(result.error.message);
    }
    result = await supabase.rpc("topics_pool_aggregates", {
      p_visible_user_ids: scope.kind === "all" ? null : scope.visibleUserIds,
    });
  }
  const { data, error } = result;
  if (error) throw new Error(error.message);
  const map = new Map<string, TopicPoolWorkAggregate>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const [topicId, payload] of Object.entries((data ?? {}) as Record<string, TopicPoolWorkAggregate>)) {
    if (!payload || typeof payload !== "object") continue;
    map.set(topicId, {
      workCount: Number(payload.workCount ?? 0),
      internalBestPlay: payload.internalBestPlay ?? null,
      internalAvgPlay: payload.internalAvgPlay ?? null,
      qualifiedWorkCount: Number(payload.qualifiedWorkCount ?? 0),
      averagePlayCount: payload.averagePlayCount ?? null,
      bestPlayCount: payload.bestPlayCount ?? null,
      bestCopy: payload.bestCopy ?? null,
      latestCopy: payload.latestCopy ?? null,
      latestUploadedAt: payload.latestUploadedAt ?? null,
      completedCount: Number(payload.completedCount ?? 0),
      inProgressCount: Number(payload.inProgressCount ?? 0),
      participants: Number(payload.participants ?? 0),
      ...(typeof payload.currentWritingCount === "number"
        ? { currentWritingCount: payload.currentWritingCount }
        : {}),
    });
  }
  return map;
}

export function aggregateToSummary(aggregate: TopicPoolWorkAggregate): TopicWorkSummary {
  return {
    qualifiedWorkCount: aggregate.qualifiedWorkCount,
    averagePlayCount: aggregate.averagePlayCount,
    bestPlayCount: aggregate.bestPlayCount,
    bestCopy: aggregate.bestCopy,
    latestCopy: aggregate.latestCopy,
    internalMetrics: {
      bestPlayCount: aggregate.internalBestPlay,
      averagePlayCount: aggregate.internalAvgPlay,
      qualifiedWorkCount: aggregate.qualifiedWorkCount,
      workCount: aggregate.workCount,
    },
  };
}

export function aggregateToHeat(aggregate: TopicPoolWorkAggregate): Recent7dHeat {
  return {
    completedCount: aggregate.completedCount,
    inProgressCount: aggregate.inProgressCount,
    participants: aggregate.participants,
    ...(typeof aggregate.currentWritingCount === "number"
      ? { currentWritingCount: aggregate.currentWritingCount }
      : {}),
  };
}

export function aggregatesToHeatMap(aggregates: Map<string, TopicPoolWorkAggregate>) {
  return new Map(Array.from(aggregates, ([id, aggregate]) => [id, aggregateToHeat(aggregate)])); // gate:transient-map 函数内临时转换，随调用栈释放
}

export function aggregatesToSummaryMap(aggregates: Map<string, TopicPoolWorkAggregate>) {
  return new Map(Array.from(aggregates, ([id, aggregate]) => [id, aggregateToSummary(aggregate)])); // gate:transient-map 函数内临时转换，随调用栈释放
}

export async function tryLoadTopicPoolAggregates(supabase: TopicSupabase, scope: DataAccessScope): Promise<Map<string, TopicPoolWorkAggregate> | null> {
  try {
    return await measureAsync("topics.pool.aggregates", () => loadTopicPoolWorkAggregates(supabase, scope));
  } catch (err) {
    // RPC 未部署或查询失败时回退到内存聚合路径，行为与迁移前一致
    // 记录日志便于运维感知（降级行为保留，但故障不可见是缺口）
    console.error("[topics] tryLoadTopicPoolAggregates RPC failed, fallback to in-memory", err);
    return null;
  }
}

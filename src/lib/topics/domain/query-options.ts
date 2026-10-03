import { TOPIC_LIBRARY_QUALIFY_PLAY_COUNT } from "../metrics";
import {
  TOPIC_DURATION_RANGES,
  TOPIC_PERFORMANCE_TIERS,
  TOPIC_POOL_SORTS,
  TOPIC_POOL_VIEWS,
  TOPIC_RECENT_HEAT_FILTERS,
  TOPIC_SOURCE_TYPES,
  TOPIC_TIME_RANGES,
  TOPIC_WORK_SORTS,
  type ApiFailure,
  type TopicPoolQueryOptions,
  type TopicPoolSort,
  type TopicRecentHeatFilter,
  type TopicSourceType,
  type TopicDurationRange,
  type TopicPerformanceTier,
  type TopicWorkSort,
} from "./types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, isOneOf, normalizePositiveInteger, normalizeText } from "./internal";

export function isUuidLike(value: string | null) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function buildPoolQueryOptions(searchParams: URLSearchParams):
  | { ok: true; options: TopicPoolQueryOptions }
  | ApiFailure {
  const view = searchParams.get("view") ?? "all";
  if (!isOneOf(TOPIC_POOL_VIEWS, view)) {
    return {
      ok: false,
      status: 400,
      message: "view 只能是 all、my_claims、my_created、trending、high_potential 或 never_worked",
    };
  }

  const timeRange = searchParams.get("time_range") ?? "all";
  if (!isOneOf(TOPIC_TIME_RANGES, timeRange)) {
    return { ok: false, status: 400, message: "time_range 只能是 3d、1w、1m、3m 或 all" };
  }

  const sortParam = searchParams.get("sort") ?? undefined;
  if (sortParam && !isOneOf(TOPIC_POOL_SORTS, sortParam)) {
    return { ok: false, status: 400, message: "sort 只能是 latest、avg_play、best_play 或 recent_heat" };
  }
  const sort: TopicPoolSort | undefined = sortParam ? sortParam as TopicPoolSort : undefined;

  const topicIdsRaw = searchParams.getAll("topic_id");
  const topicIds: string[] = [];
  for (const raw of topicIdsRaw) {
    const trimmed = raw.trim();
    if (trimmed && !isUuidLike(trimmed)) {
      return { ok: false, status: 400, message: "topic_id 格式不正确" };
    }
    if (trimmed) {
      topicIds.push(trimmed);
    }
  }

  const query = normalizeText(searchParams.get("q"), 100);

  const sourceType = searchParams.get("source_type") ?? undefined;
  if (sourceType && !isOneOf(TOPIC_SOURCE_TYPES, sourceType)) {
    return { ok: false, status: 400, message: "source_type 只能是 internal 或 external" };
  }
  const recentHeat = searchParams.get("recent_heat") ?? undefined;
  if (recentHeat && !isOneOf(TOPIC_RECENT_HEAT_FILTERS, recentHeat)) {
    return {
      ok: false,
      status: 400,
      message: "recent_heat 只能是 has_participants、has_completed、has_in_progress 或 no_participants",
    };
  }
  const durationRange = searchParams.get("duration_range") ?? undefined;
  if (durationRange && !isOneOf(TOPIC_DURATION_RANGES, durationRange)) {
    return { ok: false, status: 400, message: "duration_range 只能是 under_2m、2_5m 或 over_5m" };
  }
  const performance = searchParams.get("performance") ?? undefined;
  if (performance && !isOneOf(TOPIC_PERFORMANCE_TIERS, performance)) {
    return { ok: false, status: 400, message: "performance 只能是 high_best_play、high_qualified 或 high_avg_play" };
  }

  return {
    ok: true,
    options: {
      view,
      timeRange,
      topicIds,
      page: normalizePositiveInteger(searchParams.get("page"), 1, 10000),
      pageSize: normalizePositiveInteger(searchParams.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(query ? { q: query } : {}),
      ...(sort ? { sort } : {}),
      ...(sourceType ? { sourceType: sourceType as TopicSourceType } : {}),
      ...(recentHeat ? { recentHeat: recentHeat as TopicRecentHeatFilter } : {}),
      ...(durationRange ? { durationRange: durationRange as TopicDurationRange } : {}),
      ...(performance ? { performance: performance as TopicPerformanceTier } : {}),
    },
  };
}

/** 近 7 天热度与历史成绩过滤：基于服务端计算的真实值做后置过滤。 */
export function matchesPostFilters(
  item: { recent7dParticipants?: number; recent7dCompletedCount?: number; recent7dInProgressCount?: number; summary?: { bestPlayCount?: number | null; qualifiedWorkCount?: number; averagePlayCount?: number | null } | null },
  options: Pick<TopicPoolQueryOptions, "recentHeat" | "performance">,
) {
  if (options.recentHeat) {
    const participants = item.recent7dParticipants ?? 0;
    const completed = item.recent7dCompletedCount ?? 0;
    const inProgress = item.recent7dInProgressCount ?? 0;
    if (options.recentHeat === "has_participants" && participants <= 0) return false;
    if (options.recentHeat === "has_completed" && completed <= 0) return false;
    if (options.recentHeat === "has_in_progress" && inProgress <= 0) return false;
    if (options.recentHeat === "no_participants" && participants !== 0) return false;
  }
  if (options.performance) {
    const summary = item.summary;
    if (options.performance === "high_best_play" && (summary?.bestPlayCount ?? 0) < 100_000) return false;
    if (options.performance === "high_qualified" && (summary?.qualifiedWorkCount ?? 0) < 1) return false;
    if (options.performance === "high_avg_play" && (summary?.averagePlayCount ?? 0) < TOPIC_LIBRARY_QUALIFY_PLAY_COUNT) return false;
  }
  return true;
}

export function buildWorksQueryOptions(searchParams: URLSearchParams):
  | { ok: true; options: { sort: TopicWorkSort; page: number; pageSize: number } }
  | ApiFailure {
  const sort = searchParams.get("sort") ?? "best";
  if (!isOneOf(TOPIC_WORK_SORTS, sort)) {
    return { ok: false, status: 400, message: "sort 只能是 best 或 recent" };
  }

  return {
    ok: true,
    options: {
      sort,
      page: normalizePositiveInteger(searchParams.get("page"), 1, 10000),
      pageSize: normalizePositiveInteger(searchParams.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    },
  };
}

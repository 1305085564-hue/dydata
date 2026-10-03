import { buildExternalMetrics } from "../metrics";
import type { DataAccessScope } from "@/lib/data-access-scope";
import { buildMyClaim, filterTopicClaimsByScope } from "./claims";
import type { SortableTopicPoolItem, TopicPoolSort, TopicWorkSummary } from "./types";

export function sortTopicPoolItems<T extends SortableTopicPoolItem>(items: T[], sort: TopicPoolSort): T[] {
  return [...items].sort((left, right) => {
    if (sort === "avg_play") {
      const difference = (right.summary?.averagePlayCount ?? 0) - (left.summary?.averagePlayCount ?? 0);
      if (difference !== 0) return difference;
    } else if (sort === "best_play") {
      const difference = (right.summary?.bestPlayCount ?? 0) - (left.summary?.bestPlayCount ?? 0);
      if (difference !== 0) return difference;
    } else if (sort === "recent_heat") {
      const difference = (right.recent7dParticipants ?? 0) - (left.recent7dParticipants ?? 0);
      if (difference !== 0) return difference;
    } else {
      const difference = (Date.parse(String(right.created_at ?? "")) || 0) - (Date.parse(String(left.created_at ?? "")) || 0);
      if (difference !== 0) return difference;
    }
    return left.id.localeCompare(right.id);
  });
}

export function matchesTopicPoolQuery(item: { title?: unknown; hook?: unknown }, query: string | null | undefined) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase();
  const title = typeof item.title === "string" ? item.title.toLocaleLowerCase() : "";
  const hook = typeof item.hook === "string" ? item.hook.toLocaleLowerCase() : "";
  return title.includes(needle) || hook.includes(needle);
}

export function buildTopicPoolItem(
  item: Record<string, unknown>,
  userId: string,
  scope: DataAccessScope,
  summary: TopicWorkSummary,
  extra: Record<string, unknown> = {},
): SortableTopicPoolItem & Record<string, unknown> {
  const rawClaims = Array.isArray(item.sub_topic_claims)
    ? item.sub_topic_claims as Array<{ id?: unknown; sub_topic_id?: unknown; user_id?: string | null; status?: string; claimed_at?: unknown }>
    : [];
  const visibleClaims = filterTopicClaimsByScope(rawClaims, scope);
  const activeVisibleClaims = visibleClaims.filter((claim) => claim.status === "writing");
  const currentWritingCount = new Set(activeVisibleClaims.flatMap((claim) => typeof claim.user_id === "string" ? [claim.user_id] : [])).size;
  const myClaim = buildMyClaim(rawClaims, userId, String(item.id));
  return {
    ...item,
    id: String(item.id ?? ""),
    sub_topic_claims: visibleClaims,
    summary,
    myClaim,
    claimCount: activeVisibleClaims.length,
    candidateCount: activeVisibleClaims.length,
    scriptingCount: activeVisibleClaims.length,
    inProgressCount: activeVisibleClaims.length,
    isWritingByMe: myClaim?.status === "writing",
    externalMetrics: buildExternalMetrics(item),
    ...extra,
    currentWritingCount: Math.max(currentWritingCount, typeof extra.currentWritingCount === "number" ? extra.currentWritingCount : 0),
  };
}

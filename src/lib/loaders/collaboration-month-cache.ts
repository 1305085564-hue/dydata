import {
  loadCollaborationMonthDataset,
} from "@/lib/collaboration/data/dataset";
import type { CollaborationMonthDataset } from "@/lib/collaboration/domain/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BoundedTtlCache } from "@/lib/cache-policy";

type DatasetInput = Parameters<typeof loadCollaborationMonthDataset>[0];
type CachedDatasetInput = Omit<DatasetInput, "supabase"> & {
  supabase: SupabaseClient;
  fresh?: boolean;
  cacheScopeKey?: string;
};
type Loader = (input: DatasetInput) => Promise<CollaborationMonthDataset>;

const COLLABORATION_MONTH_CACHE_TTL_MS = 60_000;
const COLLABORATION_MONTH_CACHE_MAX_ENTRIES = 32;
const collaborationMonthCache = new BoundedTtlCache<CollaborationMonthDataset>({
  scope: "company",
  ttlMs: COLLABORATION_MONTH_CACHE_TTL_MS,
  maxEntries: COLLABORATION_MONTH_CACHE_MAX_ENTRIES,
  name: "collaboration-month-dataset",
});
let cacheGeneration = 0;

function buildCacheKey(input: CachedDatasetInput) {
  return [
    process.env.CLOUDBASE_ENV_ID ?? process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID,
    input.cacheScopeKey ?? "",
    input.range.year,
    input.range.month,
    input.range.start,
    input.range.end,
    input.includeWriterCertifications ? "writer-certifications" : "no-writer-certifications",
    [...(input.candidateProfileIds ?? [])].sort().join(","),
    input.monthOnly ? "month-only" : "stats-history",
    input.includeWorkGroupRoster === false ? "no-work-group-roster" : "work-group-roster",
    [...input.visibleUserIds].sort().join(","),
    [...(input.workGroupTeamIds ?? [])].filter(Boolean).sort().join(","),
  ].join("|");
}

export function clearCollaborationMonthCache() {
  cacheGeneration += 1;
  collaborationMonthCache.clear();
}

/** 协作页的数据来源集中失效；浏览行为和遥测写入不影响缓存。 */
const collaborationWriteResources = new Set([
  "profiles", "accounts", "daily_reports", "writer_certifications", "work_groups", "work_group_roster",
  "video_metrics_snapshots", "video_tags",
  "rpc/update_report_attribution_atomically", "rpc/manage_work_group_atomically",
]);

export function invalidateCollaborationTableWrite(url: string, method: string, succeeded: boolean) {
  const resource = new URL(url).pathname.split("/rest/")[1];
  if (succeeded && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && collaborationWriteResources.has(resource)) {
    clearCollaborationMonthCache();
  }
}

/**
 * 协作首屏使用的 60 秒数据集缓存。
 * API 和测试仍可直接调用原 loader，写路径不依赖这里的缓存失效。
 */
export async function loadCachedCollaborationMonthDataset(
  input: CachedDatasetInput,
  loader: Loader = loadCollaborationMonthDataset,
): Promise<CollaborationMonthDataset> {
  const key = buildCacheKey(input);
  if (input.fresh) clearCollaborationMonthCache();
  const cached = collaborationMonthCache.get(key);
  if (cached) return cached;

  const startedGeneration = cacheGeneration;
  const payload = await loader(input);
  if (startedGeneration === cacheGeneration) collaborationMonthCache.set(key, payload);
  return payload;
}

export function collaborationMonthCacheStats() { return collaborationMonthCache.stats; }

export const __internal = {
  buildCacheKey,
  COLLABORATION_MONTH_CACHE_TTL_MS,
};

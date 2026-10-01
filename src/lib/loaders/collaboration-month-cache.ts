import {
  loadCollaborationMonthDataset,
  type CollaborationMonthDataset,
} from "@/app/api/admin/collaboration/_shared";
import type { SupabaseClient } from "@supabase/supabase-js";

type DatasetInput = Parameters<typeof loadCollaborationMonthDataset>[0];
type CachedDatasetInput = Omit<DatasetInput, "supabase"> & {
  supabase: SupabaseClient;
  fresh?: boolean;
};
type Loader = (input: DatasetInput) => Promise<CollaborationMonthDataset>;

const COLLABORATION_MONTH_CACHE_TTL_MS = 60_000;
const COLLABORATION_MONTH_CACHE_MAX_ENTRIES = 32;
const collaborationMonthCache = new Map<string, {
  expiresAt: number;
  payload: CollaborationMonthDataset;
}>();

function buildCacheKey(input: CachedDatasetInput) {
  return [
    input.range.year,
    input.range.month,
    input.range.start,
    input.range.end,
    input.includeWriterCertifications ? "writer-certifications" : "no-writer-certifications",
    [...input.visibleUserIds].sort().join(","),
    [...(input.workGroupTeamIds ?? [])].filter(Boolean).sort().join(","),
  ].join("|");
}

export function clearCollaborationMonthCache() {
  collaborationMonthCache.clear();
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
  const cached = collaborationMonthCache.get(key);
  if (!input.fresh && cached && cached.expiresAt > Date.now()) return cached.payload;

  const payload = await loader(input);
  if (collaborationMonthCache.size >= COLLABORATION_MONTH_CACHE_MAX_ENTRIES) {
    const oldestKey = collaborationMonthCache.keys().next().value;
    if (oldestKey !== undefined) collaborationMonthCache.delete(oldestKey);
  }
  collaborationMonthCache.set(key, {
    expiresAt: Date.now() + COLLABORATION_MONTH_CACHE_TTL_MS,
    payload,
  });
  return payload;
}

export const __internal = {
  buildCacheKey,
  COLLABORATION_MONTH_CACHE_TTL_MS,
};

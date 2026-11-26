"use client";

import { BoundedTtlCache } from "@/lib/cache-policy";
import type { CollaborationWorkbenchData } from "@/lib/collaboration/data/workbench-loader";

const TAB_DATA_TTL_MS = 60_000;

/**
 * 协作页签数据缓存：模块级单例，翻月重挂组件后仍按「权限范围 + 年月 + 页签」命中，
 * 避免回访同一个月时重复请求。键里带 scopeKey，权限或成员范围变化不会串数据。
 */
const tabDataCache = new BoundedTtlCache<CollaborationWorkbenchData>({
  scope: "user",
  ttlMs: TAB_DATA_TTL_MS,
  maxEntries: 8,
  name: "collaboration-client-tabs",
});

export function buildCollaborationTabDataCacheKey(
  scopeKey: string,
  year: number,
  month: number,
  tab: string,
) {
  return `${scopeKey}|${year}-${month}|${tab}`;
}

export function readCollaborationTabData(
  scopeKey: string,
  year: number,
  month: number,
  tab: string,
) {
  return tabDataCache.get(buildCollaborationTabDataCacheKey(scopeKey, year, month, tab));
}

export function writeCollaborationTabData(
  scopeKey: string,
  year: number,
  month: number,
  tab: string,
  data: CollaborationWorkbenchData,
) {
  tabDataCache.set(buildCollaborationTabDataCacheKey(scopeKey, year, month, tab), data);
}

export function clearCollaborationTabDataCache() {
  tabDataCache.clear();
}

export const __internal = { TAB_DATA_TTL_MS };

"use client";

import type { PersonDetailData } from "./types";

// Memory cache to enable instant opening on second click or preloaded hover
const personDataCache = new Map<string, PersonDetailData>();

export function prefetchPersonData(
  userId: string,
  year: number,
  month: number,
) {
  const cacheKey = `${userId}-${year}-${month}`;
  if (personDataCache.has(cacheKey)) return;

  fetch(
    `/api/admin/collaboration/person?userId=${userId}&year=${year}&month=${month}`,
  )
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as PersonDetailData;
      personDataCache.set(cacheKey, data);
    })
    .catch(() => {
      // Ignore background prefetch errors
    });
}

export function readPersonDataCache(
  cacheKey: string,
): PersonDetailData | null {
  return personDataCache.get(cacheKey) ?? null;
}

export function writePersonDataCache(
  cacheKey: string,
  data: PersonDetailData,
) {
  personDataCache.set(cacheKey, data);
}

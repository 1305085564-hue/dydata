"use client";

import type { PersonDetailData } from "./types";

// Memory cache to enable instant opening on second click or preloaded hover
const personDataCache = new Map<string, PersonDetailData>();

// In-flight promises so hover prefetch and click open share one request
// instead of firing two identical fetches for the same person/month.
const personDataPending = new Map<string, Promise<PersonDetailData>>();

function requestPersonData(
  userId: string,
  year: number,
  month: number,
): Promise<PersonDetailData> {
  return fetch(
    `/api/admin/collaboration/person?userId=${userId}&year=${year}&month=${month}`,
  ).then(async (res) => {
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "加载个人协作数据失败");
    }
    return json as PersonDetailData;
  });
}

export function loadPersonData(
  userId: string,
  year: number,
  month: number,
): Promise<PersonDetailData> {
  const cacheKey = `${userId}-${year}-${month}`;
  const hit = personDataCache.get(cacheKey);
  if (hit) return Promise.resolve(hit);

  const pending = personDataPending.get(cacheKey);
  if (pending) return pending;

  const promise = requestPersonData(userId, year, month)
    .then((data) => {
      personDataCache.set(cacheKey, data);
      personDataPending.delete(cacheKey);
      return data;
    })
    .catch((error: unknown) => {
      // 失败不缓存结果，下次打开重试
      personDataPending.delete(cacheKey);
      throw error;
    });
  personDataPending.set(cacheKey, promise);
  return promise;
}

export function prefetchPersonData(
  userId: string,
  year: number,
  month: number,
) {
  void loadPersonData(userId, year, month).catch(() => {
    // Ignore background prefetch errors; opening the card will retry.
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

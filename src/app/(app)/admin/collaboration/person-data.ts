"use client";

import type { PersonDetailData } from "./types";
import type { CollaborationRoleTab } from "./types";

// Memory cache to enable instant opening on second click or preloaded hover
const personDataCache = new Map<string, PersonDetailData>();

// In-flight promises so hover prefetch and click open share one request
// instead of firing two identical fetches for the same person/month.
const personDataPending = new Map<string, Promise<PersonDetailData>>();
const personDataInvalidationVersion = new Map<string, number>();

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function getPersonDataCacheKey(
  userId: string,
  year: number,
  month: number,
  role?: CollaborationRoleTab,
  today = shanghaiToday(),
) {
  return `${userId}:${year}-${month}:${role ?? "legacy"}:${today}`;
}

function requestPersonData(
  userId: string,
  year: number,
  month: number,
  role?: CollaborationRoleTab,
): Promise<PersonDetailData> {
  const params = new URLSearchParams({ userId, year: String(year), month: String(month) });
  if (role) params.set("role", role);
  return fetch(`/api/admin/collaboration/person?${params.toString()}`).then(async (res) => {
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "加载个人岗位数据失败");
    }
    return json as PersonDetailData;
  });
}

export function loadPersonData(
  userId: string,
  year: number,
  month: number,
  role?: CollaborationRoleTab,
): Promise<PersonDetailData> {
  const cacheKey = getPersonDataCacheKey(userId, year, month, role);
  const hit = personDataCache.get(cacheKey);
  if (hit) return Promise.resolve(hit);

  const pending = personDataPending.get(cacheKey);
  if (pending) return pending;

  const cacheVersion = personDataInvalidationVersion.get(userId) ?? 0;

  const promise = requestPersonData(userId, year, month, role)
    .then((data) => {
      if ((personDataInvalidationVersion.get(userId) ?? 0) === cacheVersion) {
        personDataCache.set(cacheKey, data);
      }
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
  role?: CollaborationRoleTab,
) {
  void loadPersonData(userId, year, month, role).catch(() => {
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

export function clearPersonDataCache(userId: string) {
  personDataInvalidationVersion.set(
    userId,
    (personDataInvalidationVersion.get(userId) ?? 0) + 1,
  );

  for (const cacheKey of personDataCache.keys()) {
    if (cacheKey.startsWith(`${userId}:`) || cacheKey.startsWith(`${userId}-`)) {
      personDataCache.delete(cacheKey);
    }
  }

  for (const cacheKey of personDataPending.keys()) {
    if (cacheKey.startsWith(`${userId}:`) || cacheKey.startsWith(`${userId}-`)) {
      personDataPending.delete(cacheKey);
    }
  }
}

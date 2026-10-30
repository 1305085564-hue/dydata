import { BoundedTtlCache } from "@/lib/cache-policy";
import { withTimeout } from "@/lib/timeout";
import type { AuthorWorksQueryParams, AuthorWorksResponse } from "./author-works-domain";
export type { AuthorWorksQueryParams, AuthorWorksResponse, AuthorProfileSummary, ContentListItem } from "./author-works-domain";

export async function fetchAuthorContentWorks(params: AuthorWorksQueryParams, request: typeof fetch = fetch): Promise<AuthorWorksResponse> {
  const query = new URLSearchParams({ userId: params.userId, timeRange: params.timeRange ?? "30d",
    sortField: params.sortField ?? "published_at", sortDir: params.sortDir ?? "desc",
    page: String(params.page ?? 1), pageSize: String(params.pageSize ?? 100) });
  return withTimeout(async signal => {
    const response = await request(`/api/admin/content/author?${query}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message ?? "加载创作者作品失败");
    return body as AuthorWorksResponse;
  }, { timeoutMs: 30000, operation: "fetch_author_content_works" });
}

/** 每个已鉴权页面实例独占；不跨账号/公司/抽屉共享。10秒、20条，写后全清；错误不缓存。 */
export function createAuthorWorksClient(request: typeof fetch = fetch) {
  const cache = new BoundedTtlCache<AuthorWorksResponse>({ scope: "request", ttlMs: 10000, maxEntries: 20, name: "author-works-view" });
  const pending = new Map<string, Promise<AuthorWorksResponse>>();
  let generation = 0;
  return {
    fetch(params: AuthorWorksQueryParams) {
      const key = JSON.stringify([params.userId, params.timeRange ?? "30d", params.sortField ?? "published_at", params.sortDir ?? "desc", params.page ?? 1, params.pageSize ?? 100]);
      const cached = cache.get(key);
      if (cached) return Promise.resolve(cached);
      const existing = pending.get(key);
      if (existing) return existing;
      if (pending.size >= 20) return Promise.reject(new Error("切换过快，请稍后重试"));
      const version = generation;
      const promise = fetchAuthorContentWorks(params, request).then(data => {
        if (version === generation) cache.set(key, data);
        return data;
      }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
      pending.set(key, promise);
      return promise;
    },
    invalidate() { generation++; cache.clear(); pending.clear(); },
    get stats() { return cache.stats; },
  };
}

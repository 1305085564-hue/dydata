"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAuthorWorksClient, type AuthorWorksQueryParams, type AuthorWorksResponse } from "@/lib/content/author-works";

/** 视图私有缓存；150ms防抖，过期请求与重入不会覆盖当前作者/周期。 */
export function useAuthorWorks(params: AuthorWorksQueryParams) {
  const [client] = useState(() => createAuthorWorksClient());
  const key = JSON.stringify([params.userId, params.timeRange, params.sortField, params.sortDir, params.pageSize]);
  const query = useMemo(() => params, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<{key: string; data: AuthorWorksResponse | null; loading: boolean; error: string | null}>({key, data: null, loading: true, error: null});
  const epoch = useRef(0);
  const busy = useRef(false);
  const data = state.key === key ? state.data : null;
  const load = useCallback(async (append = false, fresh = false) => {
    if (append && busy.current) return null;
    const version = ++epoch.current;
    busy.current = true;
    if (fresh) client.invalidate();
    setState(prev => ({key, data: prev.key === key ? prev.data : null, loading: true, error: null}));
    try {
      const lastPage = fresh ? data?.page ?? 1 : append ? (data?.page ?? 0) + 1 : 1;
      let result: AuthorWorksResponse | null = append ? data : null;
      for (let page = append ? lastPage : 1; page <= lastPage; page++) {
        const next = await client.fetch({...query, page});
        if (version !== epoch.current) return null;
        if (result) {
          const ids = new Set(result.works.map(v => v.id));
          result = {...next, works: [...result.works, ...next.works.filter(v => !ids.has(v.id))], snapshots: [...result.snapshots, ...next.snapshots],
            contentQualityByVideoId: {...result.contentQualityByVideoId,...next.contentQualityByVideoId}, reviewReadiness: {...result.reviewReadiness,...next.reviewReadiness}};
        } else result = next;
        if (!next.hasNextPage) break;
      }
      setState({key, data: result, loading: false, error: null});
      return result;
    } catch (error) {
      if (version === epoch.current) setState(prev => ({...prev, key, loading: false, error: error instanceof Error ? error.message : "加载作者作品失败"}));
      return null;
    } finally {
      if (version === epoch.current) busy.current = false;
    }
  }, [client, data, key, query]);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const timer = setTimeout(() => { void loadRef.current(); }, 150);
    return () => { clearTimeout(timer); epoch.current = Number(epoch.current) + 1; busy.current = false; };
  }, [key]);
  return {data, loading: state.key !== key || state.loading, error: state.key === key ? state.error : null,
    loadMore: () => load(true), refresh: () => load(false, true), retry: () => load(false, true)};
}

"use client";

import * as React from "react";
import { YikePage } from "@/components/yike/yike-page";
import { createEmptyYikeWorkbench, mapWorkbenchPayloadToWorkbench } from "@/components/yike/workbench-adapter";
import type { YikeWorkbench } from "@/components/yike/types";
import { fetchYikeWorkbench } from "@/lib/yike/client";

const YIKE_WORKBENCH_CACHE_KEY = "yike-workbench-cache-v1";

function readCachedWorkbench(): YikeWorkbench | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(YIKE_WORKBENCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as YikeWorkbench;
    if (!parsed?.workspace || !parsed?.lanes || !parsed?.drawerData) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedWorkbench(workbench: YikeWorkbench) {
  try {
    window.sessionStorage.setItem(YIKE_WORKBENCH_CACHE_KEY, JSON.stringify(workbench));
  } catch {
    // 缓存只是为了减少刷新闪烁，失败时不影响主流程。
  }
}

export default function YikePageRoute() {
  const [workbench, setWorkbench] = React.useState(() => readCachedWorkbench() ?? createEmptyYikeWorkbench());
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(() => Boolean(readCachedWorkbench()));
  const [loading, setLoading] = React.useState(() => !hasLoadedOnce);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchYikeWorkbench();
      const nextWorkbench = mapWorkbenchPayloadToWorkbench(payload);
      setWorkbench(nextWorkbench);
      setHasLoadedOnce(true);
      writeCachedWorkbench(nextWorkbench);
    } catch (err) {
      // 未登录时后端应返回 401 并重定向，这里只记录错误但不叠加 mock
      if (err instanceof Error && err.message.includes("401")) {
        setError("请先登录");
      } else {
        setError(err instanceof Error ? err.message : "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <YikePage
      workbench={workbench}
      loading={loading && !hasLoadedOnce}
      error={error}
      onReload={load}
    />
  );
}

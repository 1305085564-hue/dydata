"use client";

import * as React from "react";
import { YikePage } from "@/components/yike/yike-page";
import { createEmptyYikeWorkbench, mapWorkbenchPayloadToWorkbench } from "@/components/yike/workbench-adapter";
import { fetchYikeWorkbench } from "@/lib/yike/client";

export default function YikePageRoute() {
  const [workbench, setWorkbench] = React.useState(() => createEmptyYikeWorkbench());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchYikeWorkbench();
      setWorkbench(mapWorkbenchPayloadToWorkbench(payload));
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
      loading={loading}
      error={error}
      onReload={load}
    />
  );
}

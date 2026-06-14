"use client";

import * as React from "react";
import { YikePage } from "@/components/yike/yike-page";
import { mockWorkbench } from "@/components/yike/mock-data";
import { mapWorkbenchPayloadToWorkbench } from "@/components/yike/workbench-adapter";
import { fetchYikeWorkbench } from "@/lib/yike/client";

export default function YikePageRoute() {
  const [workbench, setWorkbench] = React.useState(() => mockWorkbench);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchYikeWorkbench();
      setWorkbench(mapWorkbenchPayloadToWorkbench(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      // 保留 mockWorkbench 作为开发兜底
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

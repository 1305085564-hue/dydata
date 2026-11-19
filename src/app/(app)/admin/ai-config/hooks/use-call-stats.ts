"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CALL_STATS_PATH, type CallStats } from "@/lib/ai-config/call-stats-contract";

/**
 * 调用统计单独取，不拖住配置首屏。
 * - loading：还在取
 * - unavailable：接口还没上线（404）或读取失败；页面如实说「还没有调用记录」，不拿别的数凑
 * - ready：拿到统计
 */
export type CallStatsState =
  | { status: "loading"; stats: null }
  | { status: "unavailable"; stats: null; reason: "not_ready" | "failed" }
  | { status: "ready"; stats: CallStats };

async function fetchCallStats(): Promise<CallStatsState> {
  try {
    const res = await fetch(CALL_STATS_PATH, { cache: "no-store" });
    if (!res.ok) return { status: "unavailable", stats: null, reason: res.status === 404 ? "not_ready" : "failed" };
    const body = (await res.json()) as Partial<CallStats>;
    // 列表缺失时按空算，不让一个坏字段拖垮整页
    return {
      status: "ready",
      stats: {
        generatedAt: body.generatedAt ?? new Date().toISOString(),
        channels: body.channels ?? [],
        features: body.features ?? [],
        recentFailures: body.recentFailures ?? [],
      },
    };
  } catch {
    return { status: "unavailable", stats: null, reason: "failed" };
  }
}

export function useCallStats() {
  const [state, setState] = useState<CallStatsState>({ status: "loading", stats: null });
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++seq.current;
    const next = await fetchCallStats();
    if (current === seq.current) setState(next);
  }, []);

  useEffect(() => {
    const current = ++seq.current;
    void fetchCallStats().then((next) => {
      if (current === seq.current) setState(next);
    });
  }, []);

  return { ...state, refresh };
}

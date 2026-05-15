"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import type {
  AlertAggregationResult,
  AlertSeverity,
} from "@/lib/alert-sources/types";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { AiAlertCard } from "./ai-alert-card";

const POLL_INTERVAL_MS = 30_000;

type SeverityKey = AlertSeverity;

const SEVERITY_ORDER: SeverityKey[] = ["critical", "warning", "info"];

const SEVERITY_LABEL: Record<SeverityKey, string> = {
  critical: "高优",
  warning: "中优",
  info: "信息",
};

const SEVERITY_DOT: Record<SeverityKey, string> = {
  critical: "bg-[#B42318]",
  warning: "bg-[#EAB308]",
  info: "bg-[#444CE7]",
};

const SEVERITY_TEXT: Record<SeverityKey, string> = {
  critical: "text-[#B42318]",
  warning: "text-[#A77A0E]",
  info: "text-[#444CE7]",
};

type ApiResponse = AlertAggregationResult & {
  meta?: { generatedAt: string; scope: "all" | "team"; teamId: string | null };
};

type FetchState = {
  data: ApiResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  refreshing: boolean;
};

function formatRelative(now: number, ts: number | null) {
  if (!ts) return null;
  const delta = Math.max(0, Math.round((now - ts) / 1000));
  if (delta < 5) return "刚刚更新";
  if (delta < 60) return `${delta} 秒前更新`;
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前更新`;
  return `${Math.floor(delta / 3600)} 小时前更新`;
}

export function AiAlertPanel() {
  const [state, setState] = useState<FetchState>({
    data: null,
    loading: true,
    error: null,
    lastUpdatedAt: null,
    refreshing: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const userToggledRef = useRef<Set<SeverityKey>>(new Set());
  const [openMap, setOpenMap] = useState<Record<SeverityKey, boolean>>({
    critical: false,
    warning: false,
    info: false,
  });

  const runFetch = useCallback(async (manual: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (manual) {
      setState((s) => ({ ...s, refreshing: true }));
    }

    try {
      const res = await fetch("/api/admin/dashboard-alerts", {
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      if (!mountedRef.current) return;
      setState({
        data: json,
        loading: false,
        error: null,
        lastUpdatedAt: Date.now(),
        refreshing: false,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!mountedRef.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        refreshing: false,
        error: err instanceof Error ? err.message : "加载失败",
      }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void runFetch(false);
    const intervalId = window.setInterval(() => {
      void runFetch(false);
    }, POLL_INTERVAL_MS);
    const tickId = window.setInterval(() => setNow(Date.now()), 30_000);
    function onExternalRefresh() {
      void runFetch(true);
    }
    window.addEventListener("dydata:alerts-refresh", onExternalRefresh);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      window.clearInterval(intervalId);
      window.clearInterval(tickId);
      window.removeEventListener("dydata:alerts-refresh", onExternalRefresh);
    };
  }, [runFetch]);

  const grouped = state.data?.groupedBySeverity;
  const summary = state.data?.summary;

  useEffect(() => {
    if (!grouped) return;
    setOpenMap((prev) => {
      const firstNonEmpty = SEVERITY_ORDER.find((sev) => grouped[sev].length > 0);
      const next = { ...prev };
      for (const sev of SEVERITY_ORDER) {
        if (userToggledRef.current.has(sev)) continue;
        next[sev] = sev === firstNonEmpty;
      }
      return next;
    });
  }, [grouped]);

  const handleToggle = (sev: SeverityKey, open: boolean) => {
    userToggledRef.current.add(sev);
    setOpenMap((prev) => ({ ...prev, [sev]: open }));
  };

  const totalAlerts = summary?.total ?? 0;
  const relative = useMemo(
    () => formatRelative(now, state.lastUpdatedAt),
    [now, state.lastUpdatedAt],
  );

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-medium tracking-tight text-zinc-800">
            今日待办
          </h2>
          {summary ? (
            <div className="flex items-center gap-1.5">
              {SEVERITY_ORDER.map((sev) => {
                const count = summary[sev];
                if (count === 0) return null;
                return (
                  <span
                    key={sev}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium",
                      SEVERITY_TEXT[sev],
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", SEVERITY_DOT[sev])} />
                    {SEVERITY_LABEL[sev]} {count}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {relative ? (
            <span className="text-[11px] text-zinc-400">{relative}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void runFetch(true)}
            disabled={state.refreshing}
            aria-busy={state.refreshing}
            className="flex size-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="刷新告警"
          >
            <RefreshCw
              className={cn("size-3.5", state.refreshing && "animate-spin")}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </header>

      {state.loading ? (
        <PanelMessage tone="muted">正在加载今日待办…</PanelMessage>
      ) : state.error ? (
        <PanelMessage tone="error">
          告警服务暂时不可用（{state.error}）。
          <button
            type="button"
            onClick={() => void runFetch(true)}
            className="ml-2 rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-800"
          >
            重试
          </button>
        </PanelMessage>
      ) : totalAlerts === 0 ? (
        <PanelMessage tone="muted">
          <Sparkles className="mr-1.5 inline size-3 text-zinc-400" strokeWidth={1.75} />
          今日暂无待办，AI 没扫到需要处理的事情。
        </PanelMessage>
      ) : (
        <div className="space-y-2">
          {SEVERITY_ORDER.map((sev) => {
            const list = grouped?.[sev] ?? [];
            if (list.length === 0) return null;
            return (
              <Collapsible
                key={sev}
                open={openMap[sev]}
                onOpenChange={(o) => handleToggle(sev, o)}
              >
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-50">
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", SEVERITY_DOT[sev])} />
                    <span className={cn("text-[13px] font-medium", SEVERITY_TEXT[sev])}>
                      {SEVERITY_LABEL[sev]}
                    </span>
                    <span className="text-[12px] text-zinc-400">({list.length})</span>
                  </span>
                  <span className="text-[11px] text-zinc-400 transition group-data-[panel-open]:rotate-180">
                    ▾
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 pt-2">
                    {list.map((alert) => (
                      <AiAlertCard key={alert.id} alert={alert} />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PanelMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "muted" | "error";
}) {
  return (
    <p
      className={cn(
        "rounded-xl border px-3 py-3 text-[12px]",
        tone === "muted"
          ? "border-zinc-100 bg-zinc-50 text-zinc-500"
          : "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]",
      )}
    >
      {children}
    </p>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { Alert, AlertAggregationResult, AlertSeverity } from "@/lib/alert-sources/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import type { DashboardAlertsData } from "./admin-first-screen-loader";

const POLL_INTERVAL_MS = 30_000;

type SeverityKey = AlertSeverity;

const SEVERITY_ORDER: SeverityKey[] = ["critical", "warning", "info"];

const SEVERITY_LABEL: Record<SeverityKey, string> = {
  critical: "高优",
  warning: "中优",
  info: "信息",
};

const SEVERITY_DOT: Record<SeverityKey, string> = {
  critical: "bg-[#A05D5D]",
  warning: "bg-[#B8895E]",
  info: "bg-zinc-400",
};

const SEVERITY_TEXT: Record<SeverityKey, string> = {
  critical: "text-[#A05D5D]",
  warning: "text-[#8C6A48]",
  info: "text-zinc-500",
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

interface AlertGroup {
  groupKey: string;
  label: string;
  severity: SeverityKey;
  count: number;
  alerts: Alert[];
}

function formatRelative(now: number, ts: number | null) {
  if (!ts) return null;
  const delta = Math.max(0, Math.round((now - ts) / 1000));
  if (delta < 5) return "刚刚更新";
  if (delta < 60) return `${delta} 秒前更新`;
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前更新`;
  return `${Math.floor(delta / 3600)} 小时前更新`;
}

function groupAlertsByTemplate(alerts: Alert[]): AlertGroup[] {
  const map = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = alert.title.trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(alert);
  }

  const groups: AlertGroup[] = [];
  for (const [label, list] of map.entries()) {
    const sorted = list.sort((a, b) => {
      const diff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (diff !== 0) return diff;
      return b.createdAt.localeCompare(a.createdAt);
    });
    const topSeverity = sorted[0]?.severity ?? "info";
    groups.push({
      groupKey: label,
      label,
      severity: topSeverity,
      count: sorted.length,
      alerts: sorted,
    });
  }

  return groups.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.count - a.count;
  });
}

function getPrimaryNavigate(alert: Alert) {
  return alert.suggestedActions.find((a) => a.type === "navigate" && a.href) ?? null;
}

function getPrimaryExecuteAction(alert: Alert) {
  return alert.suggestedActions.find((a) => a.type === "execute_tool" && a.toolName) ?? null;
}

export function AiAlertPanel({
  initialData = null,
  initialUpdatedAt = null,
}: {
  initialData?: DashboardAlertsData | null;
  initialUpdatedAt?: number | null;
}) {
  const [state, setState] = useState<FetchState>({
    data: initialData,
    loading: initialData === null,
    error: null,
    lastUpdatedAt: initialUpdatedAt,
    refreshing: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const userToggledRef = useRef<Set<string>>(new Set());
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  const [executingGroup, setExecutingGroup] = useState<string | null>(null);

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
    if (initialData === null) void runFetch(false);
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
  }, [initialData, runFetch]);

  const alertGroups = useMemo(
    () => groupAlertsByTemplate(state.data?.alerts ?? []),
    [state.data?.alerts],
  );
  const summary = state.data?.summary;

  useEffect(() => {
    if (alertGroups.length === 0) return;
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of alertGroups) {
        if (userToggledRef.current.has(g.groupKey)) continue;
        next[g.groupKey] = false;
      }
      return next;
    });
  }, [alertGroups]);

  const handleToggle = (groupKey: string, open: boolean) => {
    userToggledRef.current.add(groupKey);
    setOpenMap((prev) => ({ ...prev, [groupKey]: open }));
  };

  const isSelected = (groupKey: string, alertId: string) =>
    selectedMap[groupKey]?.has(alertId) ?? false;

  const selectedCount = (groupKey: string) => selectedMap[groupKey]?.size ?? 0;

  const toggleSelect = (groupKey: string, alertId: string) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const set = new Set(next[groupKey] ?? []);
      if (set.has(alertId)) {
        set.delete(alertId);
      } else {
        set.add(alertId);
      }
      next[groupKey] = set;
      return next;
    });
  };

  const toggleSelectAll = (groupKey: string, alerts: Alert[]) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const current = next[groupKey] ?? new Set<string>();
      if (current.size === alerts.length) {
        next[groupKey] = new Set();
      } else {
        next[groupKey] = new Set(alerts.map((a) => a.id));
      }
      return next;
    });
  };

  const handleBatchExecute = async (group: AlertGroup) => {
    const selectedIds = selectedMap[group.groupKey];
    if (!selectedIds || selectedIds.size === 0) return;

    const targets = group.alerts.filter((a) => selectedIds.has(a.id));
    const actionable = targets.filter((a) => getPrimaryExecuteAction(a));
    if (actionable.length === 0) {
      toast.error("选中的告警中没有可执行的批量动作");
      return;
    }

    setExecutingGroup(group.groupKey);
    let success = 0;
    let fail = 0;

    for (const alert of actionable) {
      const action = getPrimaryExecuteAction(alert);
      if (!action) continue;
      try {
        const res = await fetch(
          `/api/admin/dashboard-alerts/${encodeURIComponent(alert.id)}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              toolName: action.toolName,
              toolArgs: action.toolArgs ?? {},
            }),
          },
        );
        if (res.ok) {
          success++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }

    setExecutingGroup(null);
    if (fail === 0) {
      toast.success(`批量执行完成：${success} 条成功`);
    } else {
      toast.error(`批量执行：${success} 条成功 / ${fail} 条失败`);
    }

    setSelectedMap((prev) => ({ ...prev, [group.groupKey]: new Set() }));
    window.dispatchEvent(new CustomEvent("dydata:alerts-refresh"));
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
        <div className="grid gap-1.5 sm:grid-cols-2">
          {alertGroups.map((group) => (
            <section
              key={group.groupKey}
              className="rounded-2xl border border-zinc-200 bg-white"
            >
              <button
                type="button"
                onClick={() => handleToggle(group.groupKey, !openMap[group.groupKey])}
                className="flex w-full items-center justify-between px-4 py-2 transition hover:bg-zinc-50"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn("size-1.5 rounded-full", SEVERITY_DOT[group.severity])} />
                  <span className="text-[13px] font-medium text-zinc-800">{group.label}</span>
                  <span className="text-[12px] text-zinc-400">
                    {group.count} {group.count > 1 ? "条" : "条"}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-zinc-400 transition duration-150",
                    openMap[group.groupKey] && "rotate-180",
                  )}
                />
              </button>

              {openMap[group.groupKey] && (
                <div className="max-h-[420px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-track]:bg-transparent">
                  {/* 批量动作条 */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-zinc-100 bg-zinc-50/90 px-4 py-1.5 backdrop-blur">
                    <Checkbox
                      checked={
                        selectedCount(group.groupKey) === group.count && group.count > 0
                      }
                      onCheckedChange={() => toggleSelectAll(group.groupKey, group.alerts)}
                    />
                    <span className="text-[11px] text-zinc-500">
                      已选 {selectedCount(group.groupKey)} / {group.count}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <button
                        type="button"
                        disabled={
                          executingGroup === group.groupKey || selectedCount(group.groupKey) === 0
                        }
                        onClick={() => void handleBatchExecute(group)}
                        className="inline-flex h-6 items-center rounded-md border border-zinc-200 px-2.5 text-[11px] text-zinc-700 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {executingGroup === group.groupKey ? (
                          <>
                            <Loader2 className="mr-1 size-3 animate-spin" />
                            执行中…
                          </>
                        ) : (
                          "一键执行"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toast.message("AI 助手功能即将上线");
                        }}
                        className="inline-flex h-6 items-center rounded-md bg-zinc-900 px-2.5 text-[11px] text-white transition hover:bg-zinc-800"
                      >
                        <Sparkles className="mr-1 size-3" strokeWidth={1.75} />
                        问问 AI
                      </button>
                    </div>
                  </div>

                  {/* 密集行 */}
                  <ul className="divide-y divide-zinc-100">
                    {group.alerts.map((alert) => {
                      const navigate = getPrimaryNavigate(alert);
                      const primaryEntity = alert.affectedEntities[0];
                      return (
                        <li key={alert.id}>
                          {navigate ? (
                            <Link
                              href={navigate.href!}
                              className="group flex h-9 items-center gap-3 px-4 transition hover:bg-zinc-50/60"
                            >
                              <div
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleSelect(group.groupKey, alert.id);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleSelect(group.groupKey, alert.id);
                                  }
                                }}
                                className="flex items-center"
                              >
                                <Checkbox
                                  checked={isSelected(group.groupKey, alert.id)}
                                  onCheckedChange={() => toggleSelect(group.groupKey, alert.id)}
                                />
                              </div>
                              <span className="min-w-[80px] truncate text-[13px] font-medium text-zinc-800">
                                {primaryEntity?.name ?? "—"}
                              </span>
                              <span className="flex-1 truncate text-[12px] text-zinc-500">
                                {alert.detail ?? alert.title}
                              </span>
                              <ArrowRight className="size-3.5 text-zinc-400 opacity-0 transition duration-150 group-hover:opacity-100" />
                            </Link>
                          ) : (
                            <div className="group flex h-9 items-center gap-3 px-4 transition hover:bg-zinc-50/60">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(group.groupKey, alert.id);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    toggleSelect(group.groupKey, alert.id);
                                  }
                                }}
                                className="flex items-center"
                              >
                                <Checkbox
                                  checked={isSelected(group.groupKey, alert.id)}
                                  onCheckedChange={() => toggleSelect(group.groupKey, alert.id)}
                                />
                              </div>
                              <span className="min-w-[80px] truncate text-[13px] font-medium text-zinc-800">
                                {primaryEntity?.name ?? "—"}
                              </span>
                              <span className="flex-1 truncate text-[12px] text-zinc-500">
                                {alert.detail ?? alert.title}
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          ))}
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

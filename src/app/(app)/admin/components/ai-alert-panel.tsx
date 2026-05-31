"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { Alert, AlertAggregationResult, AlertSeverity } from "@/lib/alert-sources/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAlertContextStore } from "@/components/ai-assistant/alert-context-store";

type DashboardAlertsData = AlertAggregationResult & {
  meta?: { generatedAt: string; scope: "all" | "team"; teamId: string | null };
};

const POLL_INTERVAL_MS = 180_000;
const STORAGE_KEY = "dydata:cockpit:selected-alert-group";

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
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  const [executingGroup, setExecutingGroup] = useState<string | null>(null);
  const [storedGroupKey, setStoredGroupKey] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [expanded, setExpanded] = useState(false);
  const { consultAlert } = useAlertContextStore();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setStoredGroupKey(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const runFetch = useCallback(async (manual: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (manual) {
      setState((s) => ({ ...s, refreshing: true }));
    }

    try {
      if (!manual && typeof document !== "undefined" && document.visibilityState !== "visible") {
        setState((s) => ({ ...s, refreshing: false }));
        return;
      }
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

  const effectiveSelectedKey = useMemo(() => {
    if (alertGroups.length === 0) return null;
    if (storedGroupKey && alertGroups.some((g) => g.groupKey === storedGroupKey)) {
      return storedGroupKey;
    }
    return alertGroups[0].groupKey;
  }, [alertGroups, storedGroupKey]);

  const activeGroup = useMemo(
    () => alertGroups.find((g) => g.groupKey === effectiveSelectedKey) ?? null,
    [alertGroups, effectiveSelectedKey],
  );

  const selectGroup = useCallback((key: string) => {
    setStoredGroupKey(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
  }, []);

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
    let successes = 0;
    const needsConfirmAlerts: Alert[] = [];
    let failures = 0;

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
        if (res.status === 409) {
          needsConfirmAlerts.push(alert);
        } else if (res.ok) {
          const body = (await res.json()) as { success?: boolean };
          if (body.success === true) {
            successes++;
          } else {
            failures++;
          }
        } else {
          failures++;
        }
      } catch {
        failures++;
      }
    }

    setExecutingGroup(null);

    if (successes > 0) {
      toast.success(`批量执行完成：${successes} 条成功`);
    }
    if (failures > 0) {
      toast.error(`批量执行：${failures} 条失败`);
    }
    if (needsConfirmAlerts.length > 0) {
      toast.info(
        `${needsConfirmAlerts.length} 条需要走 AI 确认（先处理第一条）`,
        {
          action: {
            label: "打开 AI 助手",
            onClick: () => {
              const first = needsConfirmAlerts[0];
              consultAlert({ alertId: first.id, preview: first.title });
            },
          },
        },
      );
    }

    setSelectedMap((prev) => ({ ...prev, [group.groupKey]: new Set() }));
    if (successes > 0 || failures > 0) {
      window.dispatchEvent(new CustomEvent("dydata:alerts-refresh"));
    }
  };

  const totalAlerts = summary?.total ?? 0;
  const relative = useMemo(
    () => formatRelative(now, state.lastUpdatedAt),
    [now, state.lastUpdatedAt],
  );

  // 顶部告警带的"最急一句"：高优>中优>信息，取首条
  const topAlert = useMemo(() => {
    if (!state.data?.alerts?.length) return null;
    const sorted = [...state.data.alerts].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    return sorted[0] ?? null;
  }, [state.data?.alerts]);
  const topAlertSummary = topAlert
    ? topAlert.affectedEntities[0]?.name
      ? `${topAlert.affectedEntities[0].name} · ${topAlert.detail ?? topAlert.title}`
      : (topAlert.detail ?? topAlert.title)
    : null;

  const showPanelBody = expanded && totalAlerts > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <header
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-2.5",
          showPanelBody && "border-b border-zinc-200",
        )}
      >
        <button
          type="button"
          onClick={() => totalAlerts > 0 && setExpanded((v) => !v)}
          disabled={totalAlerts === 0}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 text-left",
            totalAlerts > 0 && "cursor-pointer",
          )}
          aria-expanded={showPanelBody}
        >
          <span className="flex shrink-0 items-center gap-1.5">
            <Sparkles className="size-3.5 text-zinc-400" strokeWidth={1.75} />
            <span className="text-[12px] font-medium tracking-tight text-zinc-700">AI 速览</span>
          </span>
          {summary && totalAlerts > 0 ? (
            <span className="flex shrink-0 items-center gap-1">
              {SEVERITY_ORDER.map((sev) => {
                const count = summary[sev];
                if (count === 0) return null;
                return (
                  <span
                    key={sev}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium",
                      SEVERITY_TEXT[sev],
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", SEVERITY_DOT[sev])} />
                    {SEVERITY_LABEL[sev]} {count}
                  </span>
                );
              })}
            </span>
          ) : null}
          {topAlertSummary && !showPanelBody ? (
            <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-500">
              · {topAlertSummary}
            </span>
          ) : null}
          {totalAlerts > 0 ? (
            <span className="ml-auto shrink-0 text-zinc-400">
              {showPanelBody ? (
                <ChevronUp className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              )}
            </span>
          ) : (
            <span className="ml-auto shrink-0 text-[12px] text-zinc-400">
              今日暂无待办
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {relative ? (
            <span className="text-[11px] text-zinc-400">{relative}</span>
          ) : null}
          {totalAlerts > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const firstCritical = alertGroups
                  .flatMap((g) => g.alerts)
                  .find((a) => a.severity === "critical");
                const target =
                  firstCritical ?? alertGroups[0]?.alerts[0] ?? null;
                if (target) {
                  consultAlert({ alertId: target.id, preview: target.title });
                }
              }}
              className="inline-flex h-6 items-center rounded-md border border-[#D97757]/40 bg-white px-2 text-[11px] text-[#D97757] transition hover:bg-[#D97757]/5"
            >
              <Sparkles className="mr-1 size-3" strokeWidth={1.75} />
              问 AI
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void runFetch(true);
            }}
            disabled={state.refreshing}
            aria-busy={state.refreshing}
            className="flex size-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="px-4 py-2">
          <span className="text-[11px] text-zinc-400">正在加载 AI 速览…</span>
        </div>
      ) : state.error ? (
        <div className="px-4 py-2 flex items-center gap-2">
          <span className="text-[11px] text-[#B42318]">告警服务暂时不可用（{state.error}）</span>
          <button
            type="button"
            onClick={() => void runFetch(true)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-800"
          >
            重试
          </button>
        </div>
      ) : !showPanelBody ? null : (
        <div className="flex md:h-[480px]">
          <aside
            className={cn(
              "min-w-0 md:w-[32%] md:min-w-[260px] md:max-w-[340px] md:flex-shrink-0 md:overflow-y-auto md:border-r md:border-zinc-200",
              mobileView === "detail" ? "hidden md:block" : "block w-full",
            )}
          >
            <ul className="divide-y divide-zinc-100">
              {alertGroups.map((group) => {
                const active = group.groupKey === effectiveSelectedKey;
                const firstAlert = group.alerts[0];
                const previewName = firstAlert?.affectedEntities[0]?.name;
                const previewDetail = firstAlert?.detail ?? firstAlert?.title;
                return (
                  <li key={group.groupKey}>
                    <button
                      type="button"
                      onClick={() => {
                        selectGroup(group.groupKey);
                        setMobileView("detail");
                      }}
                      className={cn(
                        "active:translate-y-0 flex w-full items-start gap-2 border-l-[2px] px-3.5 py-2.5 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        active ? "border-l-[#D97757] bg-zinc-200/95" : "border-l-transparent hover:bg-zinc-100",
                      )}
                      aria-current={active ? "true" : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("size-2 shrink-0 rounded-full", SEVERITY_DOT[group.severity])} />
                          <span className="truncate text-[13px] font-medium text-zinc-800">
                            {group.label}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400">
                            {group.count}
                          </span>
                        </div>
                        {previewName || previewDetail ? (
                          <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                            {previewName ?? ""}
                            {previewName && previewDetail ? " · " : ""}
                            {previewDetail ?? ""}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <main
            className={cn(
              "min-w-0 flex-1 flex-col",
              mobileView === "list" ? "hidden md:flex" : "flex",
            )}
          >
            {!activeGroup ? (
              <div className="flex flex-1 items-center justify-center p-6 text-[12px] text-zinc-400">
                选择左侧分组查看详情
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-zinc-100 px-3.5 py-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileView("list")}
                    className="active:translate-y-0 inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-zinc-500 transition-[color,background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    <ChevronLeft className="size-3.5" strokeWidth={1.75} />
                    返回列表
                  </button>
                </div>

                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/90 px-3.5 py-1.5 backdrop-blur">
                  <Checkbox
                    checked={
                      selectedCount(activeGroup.groupKey) === activeGroup.count &&
                      activeGroup.count > 0
                    }
                    onCheckedChange={() =>
                      toggleSelectAll(activeGroup.groupKey, activeGroup.alerts)
                    }
                  />
                  <span className="text-[11px] text-zinc-500">
                    {selectedCount(activeGroup.groupKey) === 0
                      ? "全选"
                      : `已选 ${selectedCount(activeGroup.groupKey)}`}
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <button
                      type="button"
                      disabled={
                        executingGroup === activeGroup.groupKey ||
                        selectedCount(activeGroup.groupKey) === 0
                      }
                      onClick={() => void handleBatchExecute(activeGroup)}
                      className="inline-flex h-6 items-center rounded-md border border-zinc-200 px-2.5 text-[11px] text-zinc-700 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {executingGroup === activeGroup.groupKey ? <>执行中…</> : "一键执行"}
                    </button>
                  </div>
                </div>

                <ul className="flex-1 divide-y divide-zinc-100 md:overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-track]:bg-transparent">
                  {activeGroup.alerts.map((alert) => {
                    const navigate = getPrimaryNavigate(alert);
                    const primaryEntity = alert.affectedEntities[0];
                    return (
                      <li key={alert.id}>
                        {navigate ? (
                          <Link
                            href={navigate.href!}
                            className="active:translate-y-0 group flex h-9 items-center gap-3 px-4 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50/60"
                          >
                            <div
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleSelect(activeGroup.groupKey, alert.id);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleSelect(activeGroup.groupKey, alert.id);
                                }
                              }}
                              className="flex items-center"
                            >
                              <Checkbox
                                checked={isSelected(activeGroup.groupKey, alert.id)}
                                onCheckedChange={() =>
                                  toggleSelect(activeGroup.groupKey, alert.id)
                                }
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
                          <div
                            className="group flex h-9 items-center gap-3 px-4 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50/60"
                          >
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(activeGroup.groupKey, alert.id);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleSelect(activeGroup.groupKey, alert.id);
                                }
                              }}
                              className="flex items-center"
                            >
                              <Checkbox
                                checked={isSelected(activeGroup.groupKey, alert.id)}
                                onCheckedChange={() =>
                                  toggleSelect(activeGroup.groupKey, alert.id)
                                }
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
              </>
            )}
          </main>
        </div>
      )}
    </section>
  );
}

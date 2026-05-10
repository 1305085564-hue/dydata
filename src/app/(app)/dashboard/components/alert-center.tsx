"use client";

import { AlertCircle, ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { groupDashboardAlerts } from "../alert-groups";
import { severityDot, severityTone } from "./status-theme";

interface AlertCenterProps {
  groups: ReturnType<typeof groupDashboardAlerts>;
  expanded: boolean;
  expandedUsers: Set<string>;
  onToggleExpanded: () => void;
  onToggleUser: (userKey: string) => void;
  onDismissAlert: (id: string) => void;
}

/**
 * 告警中心
 * 法典 V1：无大面积彩底，改用灰底 + 状态点 + 文字色
 */
export function AlertCenter({
  groups,
  expanded,
  expandedUsers,
  onToggleExpanded,
  onToggleUser,
  onDismissAlert,
}: AlertCenterProps) {
  const alertCount = groups.reduce((sum, group) => sum + group.count, 0);
  const criticalUserCount = groups.filter((group) => group.criticalCount > 0).length;

  if (alertCount === 0) return null;

  return (
    <div className="mx-auto mb-6 max-w-6xl">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-white shadow-sm">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex w-full items-center justify-between gap-4 bg-zinc-50 px-4 py-3 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0 stroke-[1.5] text-[#C9604D]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#C9604D]">
              异常告警
            </span>
            <span className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700">
              {groups.length} 人异常
            </span>
            {criticalUserCount > 0 && (
              <span className="hidden items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-[#C9604D] sm:inline-flex">
                <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white animate-pulse" />
                {criticalUserCount} 人严重
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-zinc-500">
            共 {alertCount} 项
            {expanded ? (
              <ChevronDown size={14} className="stroke-[1.5]" />
            ) : (
              <ChevronRight size={14} className="stroke-[1.5]" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="divide-y divide-zinc-100">
            {groups.map((group) => {
              const userExpanded = expandedUsers.has(group.userKey);

              return (
                <div key={group.userKey} className="bg-white">
                  <button
                    type="button"
                    onClick={() => onToggleUser(group.userKey)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    aria-expanded={userExpanded}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-zinc-800">
                        {group.userName}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.criticalCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-[#C9604D]">
                            <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white animate-pulse" />
                            严重 {group.criticalCount}
                          </span>
                        )}
                        {group.warningCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-[#D99E55]">
                            <span className="h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
                            提醒 {group.warningCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200">
                        {group.count} 项
                      </span>
                      {userExpanded ? (
                        <ChevronDown size={14} className="stroke-[1.5] text-zinc-400" />
                      ) : (
                        <ChevronRight size={14} className="stroke-[1.5] text-zinc-400" />
                      )}
                    </div>
                  </button>

                  {userExpanded && (
                    <div className="space-y-2 bg-zinc-50 px-4 pb-4">
                      {group.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {alert.checkpointLabel && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium",
                                    severityTone(alert.severity),
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      severityDot(alert.severity),
                                    )}
                                  />
                                  {alert.checkpointLabel}
                                </span>
                              )}
                              <span className="text-[12px] font-medium text-zinc-700">
                                {alert.message}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDismissAlert(alert.id)}
                            className="shrink-0 rounded-md p-1 text-zinc-300 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                            aria-label="关闭这条告警"
                          >
                            <X size={14} className="stroke-[1.5]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

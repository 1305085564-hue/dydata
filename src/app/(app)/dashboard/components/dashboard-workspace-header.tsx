"use client";

import { useRef } from "react";
import {
  Activity,
  CalendarDays,
  Eye,
  History,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickExemptionButton } from "./quick-exemption-button";
import type { WorkspaceTab } from "./status-theme";

interface DashboardWorkspaceHeaderProps {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
  userRole: "member" | "admin" | "owner";
  alertCount: number;
}

/**
 * 仪表盘工作区顶栏
 * 法典 V1：无大面积彩底 / 无 font-black / 无 scale 动效 / ring-1 细光环
 */
export function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  activeTab,
  onTabChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
  userRole,
  alertCount,
}: DashboardWorkspaceHeaderProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const utilityActions = [
    { key: "data-view", label: "数据查看", icon: Eye },
    { key: "trend-view", label: "趋势查看", icon: TrendingUp },
    { key: "leaderboard", label: "排行榜", icon: Trophy },
    { key: "history", label: "历史记录", icon: History },
  ];

  const tabs: Array<{ key: WorkspaceTab; label: string }> = [
    { key: "FLOW", label: "今日流程" },
    ...(userRole !== "member"
      ? [{ key: "REVIEW" as WorkspaceTab, label: "审核中心" }]
      : []),
    ...(userRole !== "member"
      ? [{ key: "MATRIX" as WorkspaceTab, label: "全域矩阵" }]
      : []),
  ];

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }
    dateInputRef.current?.focus();
  }

  return (
    <div className="mx-auto mb-6 max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            <Activity size={14} className="text-zinc-800" /> Live Workflow
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">
            今日生产流程
          </h2>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="text-left sm:text-right">
            <span className="block text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              Today
            </span>
            <button
              type="button"
              onClick={openDatePicker}
              className="group inline-flex items-center justify-end gap-1.5 rounded-[10px] py-1 text-[20px] font-semibold tabular-nums text-zinc-800 transition-[color,opacity] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:opacity-80 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
              aria-label="选择填报日期"
            >
              <span>{activeBizDate}</span>
              <CalendarDays className="size-3.5 text-zinc-400 transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-[1px]" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={activeBizDate}
              max={today}
              onChange={(event) => {
                if (event.target.value) onDateChange(event.target.value);
              }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="数据快捷入口">
          {utilityActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onDashboardAction(action.key)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
              >
                <Icon size={13} />
                {action.label}
              </button>
            );
          })}
          <QuickExemptionButton
            hasPending={hasPendingExemption}
            today={today}
            submittedDates={submittedDates}
            initialSelectedDates={[today]}
          />
        </div>

        <nav className="flex w-full gap-1 overflow-x-auto rounded-[10px] border border-zinc-200 bg-zinc-100 p-1 shadow-sm lg:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "relative min-w-24 shrink-0 rounded-[8px] px-4 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-1 focus-visible:ring-zinc-950/5",
                activeTab === tab.key
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:bg-white/60 hover:text-zinc-800",
              )}
            >
              {tab.label}
              {tab.key === "REVIEW" && alertCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C9604D] px-1 text-[9px] font-semibold text-white">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

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
import { QuickExemptionButton } from "./quick-exemption-button";

interface DashboardWorkspaceHeaderProps {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
}

/**
 * 仪表盘顶栏
 * 只保留主工作台标题、快捷入口和日期，不再承载流程切换/审核入口。
 */
export function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
}: DashboardWorkspaceHeaderProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const utilityActions = [
    { key: "data-view", label: "数据查看", icon: Eye },
    { key: "trend-view", label: "趋势查看", icon: TrendingUp },
    { key: "leaderboard", label: "排行榜", icon: Trophy },
    { key: "history", label: "历史记录", icon: History },
  ];

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }
    dateInputRef.current?.focus();
  }

  return (
    <div className="mx-auto mb-4 max-w-6xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            <Activity size={14} className="text-zinc-800" /> 今日工作台
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">
              今日提交
            </h2>
            <nav
              className="flex flex-wrap items-center gap-x-1.5 gap-y-1"
              aria-label="数据快捷入口"
            >
              {utilityActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => onDashboardAction(action.key)}
                    className="group inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800 focus-visible:bg-zinc-100 focus-visible:text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    style={{ transitionDelay: "50ms" }}
                  >
                    <Icon
                      size={14}
                      className="stroke-[1.5] text-zinc-400 transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-zinc-700"
                    />
                    {action.label}
                  </button>
                );
              })}
              <QuickExemptionButton
                hasPending={hasPendingExemption}
                today={today}
                submittedDates={submittedDates}
                initialSelectedDates={[today]}
                variant="subtle"
              />
            </nav>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start lg:items-end">
          <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            今天
          </span>
          <button
            type="button"
            onClick={openDatePicker}
            className="group inline-flex items-center gap-1.5 rounded-[10px] py-1 text-[18px] font-semibold font-mono tabular-nums text-zinc-800 transition-[color,opacity] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:opacity-80 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
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
  );
}

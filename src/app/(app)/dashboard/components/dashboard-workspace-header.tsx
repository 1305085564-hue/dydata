"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Eye,
  History,
} from "lucide-react";
import { QuickExemptionButton } from "./quick-exemption-button";

interface AccountOption {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface DashboardWorkspaceHeaderProps {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  userDisplayName?: string;
  userRole?: string;
}

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">
            <Activity size={14} className="text-stone-700" /> 数据台
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-[24px] font-medium tracking-tight text-stone-900">
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
                    className="group inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-stone-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-stone-100 hover:text-stone-700 focus-visible:bg-stone-100 focus-visible:text-stone-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-900/5"
                    style={{ transitionDelay: "50ms" }}
                  >
                    <Icon
                      size={14}
                      className="stroke-[1.5] text-stone-500 transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-stone-700"
                    />
                    {action.label}
                  </button>
                );
              })}
              <Link
                href="/violations"
                className="group inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-stone-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-stone-100 hover:text-stone-700 focus-visible:bg-stone-100 focus-visible:text-stone-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-900/5"
                style={{ transitionDelay: "50ms" }}
              >
                <BookOpen
                  size={14}
                  className="stroke-[1.5] text-stone-500 transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-stone-700"
                />
                避坑案例
              </Link>
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

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openDatePicker}
            className="group inline-flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3.5 text-[13px] font-medium tracking-tight text-stone-700 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[#D97757]/40 hover:bg-[#FDF9F7] hover:text-[#C96442] focus-visible:ring-1 focus-visible:ring-stone-900/5"
            aria-label="选择填报日期"
          >
            <CalendarDays className="size-4 stroke-[1.6] text-stone-500 transition-colors duration-150 group-hover:text-[#D97757]" />
            <span className="tabular-nums">{activeBizDate}</span>
            <ChevronDown className="size-3.5 stroke-[1.6] text-stone-500 transition-colors duration-150 group-hover:text-[#D97757]" />
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

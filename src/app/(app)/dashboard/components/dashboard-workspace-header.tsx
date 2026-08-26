"use client";

import { useRef, useState, useEffect } from "react";
import {
  Activity,
  ChevronDown,
  History,
} from "lucide-react";
import { QuickExemptionButton } from "./quick-exemption-button";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { cn } from "@/lib/utils";

interface DashboardWorkspaceHeaderProps {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
}

export function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
  waiveDates = [],
  leaveDates = [],
  pendingDates = [],
}: DashboardWorkspaceHeaderProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);

  const utilityActions = [
    { key: "history", label: "历史记录", icon: History },
  ];

  // 点击外部及 Esc 键收起 Popover
  useEffect(() => {
    if (!isCalendarOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCalendarOpen]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4">
        {/* 左侧：分类标签 + 页面大标题（H1）融入日期交互 */}
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-[#78716C]">
            <Activity size={13} className="text-[#78716C] stroke-[2]" />
            <span>数据台</span>
          </div>

          <div className="relative inline-flex items-center" ref={calendarPopoverRef}>
            <button
              type="button"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="group inline-flex min-h-[44px] items-center gap-2 rounded-xl text-left outline-none select-none cursor-pointer transition-colors active:scale-[0.985] active:duration-75"
              aria-expanded={isCalendarOpen}
              aria-label="切换填报日期"
            >
              <h1 className="text-2xl font-bold tracking-tight text-[#1C1917] group-hover:text-[#D97757] transition-colors flex items-center gap-2">
                {activeBizDate === today ? (
                  <>
                    <span>今日提交</span>
                    <span className="text-[#78716C] font-normal">·</span>
                    <span className="font-normal text-[#78716C] group-hover:text-[#292524] tabular-nums transition-colors">
                      {activeBizDate}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[#D97757] flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full bg-[#D97757] animate-pulse" />
                      补交历史
                    </span>
                    <span className="text-[#78716C] font-normal">·</span>
                    <span className="font-normal text-[#78716C] group-hover:text-[#292524] tabular-nums transition-colors">
                      {activeBizDate}
                    </span>
                  </>
                )}
              </h1>
              <ChevronDown
                className={cn(
                  "size-4 stroke-[2.2] text-[#78716C] transition-transform duration-150 group-hover:text-[#D97757]",
                  isCalendarOpen && "rotate-180 text-[#D97757]"
                )}
              />
            </button>

            {/* 锚定在标题正下方的日历 Popover */}
            {isCalendarOpen && (
              <div className="absolute left-0 top-full mt-2.5 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                <div className="w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#E5E0D6] bg-white p-5 shadow-[0_12px_32px_-4px_rgba(28,25,23,0.08),0_2px_6px_rgba(0,0,0,0.02)]">
                  <SubmissionCalendar
                    today={today}
                    submittedDates={submittedDates}
                    waiveDates={waiveDates}
                    leaveDates={leaveDates}
                    pendingDates={pendingDates}
                    selectedDate={activeBizDate}
                    onDateSelect={(date) => {
                      onDateChange(date);
                      setIsCalendarOpen(false);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：快捷工具入口 (历史记录 / 申请豁免) */}
        <nav
          className="flex items-center gap-2 shrink-0"
          aria-label="数据快捷入口"
        >
          {utilityActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onDashboardAction(action.key)}
                className="group inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E5E0D6] bg-white px-3 text-[13px] font-medium text-[#292524] transition-all duration-150 hover:bg-[#F5F3EE] hover:text-[#1C1917] hover:shadow-sm active:scale-[0.98]"
              >
                <Icon
                  size={14}
                  className="stroke-[1.75] text-[#78716C] transition-colors group-hover:text-[#1C1917]"
                />
                <span>{action.label}</span>
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
  );
}

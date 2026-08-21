"use client";

import { useRef, useState, useEffect } from "react";
import {
  Activity,
  CalendarDays,
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
}

export function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
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
    <div className="mx-auto mb-2 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* 左侧：分类 + 融入日期的交互式大标题 */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            <Activity size={13} className="text-zinc-600" /> 数据台
          </div>

          <div className="relative inline-flex items-center" ref={calendarPopoverRef}>
            <button
              type="button"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="group inline-flex items-center gap-2 rounded-xl text-left outline-none select-none cursor-pointer transition-colors"
              aria-expanded={isCalendarOpen}
              aria-label="切换填报日期"
            >
              <h2 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-zinc-900 group-hover:text-[#D97757] transition-colors flex items-center gap-2">
                {activeBizDate === today ? (
                  <>
                    <span>今日提交</span>
                    <span className="text-[16px] sm:text-[18px] font-normal text-zinc-400 group-hover:text-zinc-600 tabular-nums transition-colors">
                      · {activeBizDate}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[#D97757] flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full bg-[#D97757] animate-pulse" />
                      补交历史
                    </span>
                    <span className="text-[16px] sm:text-[18px] font-normal text-zinc-500 group-hover:text-zinc-700 tabular-nums transition-colors">
                      · {activeBizDate}
                    </span>
                  </>
                )}
              </h2>
              <ChevronDown
                className={cn(
                  "size-4 stroke-[2] text-zinc-400 transition-transform duration-200 group-hover:text-[#D97757]",
                  isCalendarOpen && "rotate-180 text-[#D97757]"
                )}
              />
            </button>

            {/* 锚定在标题正下方的日历 Popover */}
            {isCalendarOpen && (
              <div className="absolute left-0 top-full mt-2.5 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                <div className="w-[330px] rounded-2xl border border-zinc-200 bg-white/98 p-2.5 shadow-xl shadow-zinc-900/10 backdrop-blur-2xl ring-1 ring-black/5">
                  <SubmissionCalendar
                    today={today}
                    submittedDates={submittedDates}
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
          className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center"
          aria-label="数据快捷入口"
        >
          {utilityActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onDashboardAction(action.key)}
                className="group inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-colors duration-100 hover:border-zinc-300 hover:bg-white hover:text-zinc-950 hover:shadow-2xs cursor-pointer"
              >
                <Icon
                  size={14}
                  className="stroke-[1.6] text-zinc-500 transition-colors group-hover:text-zinc-900"
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
  );
}

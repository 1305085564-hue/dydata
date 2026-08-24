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
    <div className="hidden sm:block mx-auto mb-2 sm:mb-6 max-w-5xl">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* 左侧：分类 + 融入日期的交互式大标题 */}
        <div className="min-w-0 flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.25em] text-[#78716C]">
            <Activity size={12} className="text-[#78716C]" /> 数据台
          </div>

          <div className="relative inline-flex items-center" ref={calendarPopoverRef}>
            <button
              type="button"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="group inline-flex min-h-[34px] sm:min-h-[44px] items-center gap-1 sm:gap-2 rounded-xl text-left outline-none select-none cursor-pointer transition-colors active:scale-[0.985] active:duration-75 py-0.5 sm:py-1"
              aria-expanded={isCalendarOpen}
              aria-label="切换填报日期"
            >
              <h1 className="text-[15px] sm:text-2xl font-semibold tracking-tight text-[#1C1917] group-hover:text-[#D97757] transition-colors flex items-center gap-1 sm:gap-2">
                {activeBizDate === today ? (
                  <>
                    <span>今日提交</span>
                    <span className="text-[12px] sm:text-lg font-normal text-[#78716C] group-hover:text-[#292524] tabular-nums transition-colors">
                      · {activeBizDate}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[#D97757] flex items-center gap-1">
                      <span className="inline-block size-1.5 sm:size-2 rounded-full bg-[#D97757] animate-pulse" />
                      补交历史
                    </span>
                    <span className="text-[12px] sm:text-lg font-normal text-[#78716C] group-hover:text-[#292524] tabular-nums transition-colors">
                      · {activeBizDate}
                    </span>
                  </>
                )}
              </h1>
              <ChevronDown
                className={cn(
                  "size-3 sm:size-4 stroke-[2] text-[#78716C] transition-transform duration-150 group-hover:text-[#D97757]",
                  isCalendarOpen && "rotate-180 text-[#D97757]"
                )}
              />
            </button>

            {/* 锚定在标题正下方的日历 Popover */}
            {isCalendarOpen && (
              <div className="absolute left-0 top-full mt-2 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                <div className="w-[calc(100vw-2.5rem)] max-w-[330px] rounded-2xl border border-[#E5E0D6] bg-white/98 p-2.5 shadow-claude-float backdrop-blur-2xl ring-1 ring-black/5">
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
          className="flex items-center gap-1.5 sm:gap-2 shrink-0"
          aria-label="数据快捷入口"
        >
          {utilityActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onDashboardAction(action.key)}
                className="group inline-flex min-h-[44px] items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl border border-[#E5E0D6]/80 bg-[#FBF9F5]/80 px-2 py-1 sm:px-3.5 sm:py-2 text-[11.5px] sm:text-[13px] font-medium text-[#292524] transition-colors duration-100 hover:border-[#E5E0D6] hover:bg-white hover:text-[#1C1917] hover:shadow-2xs cursor-pointer"
              >
                <Icon
                  size={12}
                  className="stroke-[1.6] text-[#78716C] transition-colors group-hover:text-[#1C1917]"
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

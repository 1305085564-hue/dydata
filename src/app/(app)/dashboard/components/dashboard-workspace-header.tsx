"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
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
    <div className="mx-auto mb-1.5 max-w-6xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-500">
            <Activity size={14} className="text-zinc-700" /> 数据台
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <h2 className="text-[24px] font-bold tracking-tight text-zinc-900">
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
                    className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] font-medium text-zinc-600 transition-all duration-200 ease-out hover:bg-zinc-200/80 hover:text-zinc-950 hover:scale-105 hover:font-semibold focus-visible:bg-zinc-200/80 focus-visible:text-zinc-950 focus-visible:outline-none"
                  >
                    <Icon
                      size={15}
                      className="stroke-[1.6] text-zinc-500 transition-all duration-200 group-hover:text-zinc-900 group-hover:scale-110"
                    />
                    {action.label}
                  </button>
                );
              })}
              <Link
                href="/violations"
                className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] font-medium text-zinc-600 transition-all duration-200 ease-out hover:bg-zinc-200/80 hover:text-zinc-950 hover:scale-105 hover:font-semibold focus-visible:bg-zinc-200/80 focus-visible:text-zinc-950 focus-visible:outline-none"
              >
                <BookOpen
                  size={15}
                  className="stroke-[1.6] text-zinc-500 transition-all duration-200 group-hover:text-zinc-900 group-hover:scale-110"
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

        {/* 右侧日期按钮及高阶日历选择器 (High-End Calendar Popover) */}
        <div className="relative flex shrink-0 items-center gap-2" ref={calendarPopoverRef}>
          <button
            type="button"
            onClick={() => setIsCalendarOpen((prev) => !prev)}
            aria-expanded={isCalendarOpen}
            className={cn(
              "group inline-flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left shadow-2xs transition-all duration-200 outline-none select-none cursor-pointer",
              isCalendarOpen
                ? "border-[#D97757] bg-white ring-2 ring-[#D97757]/20 scale-[1.02]"
                : "border-zinc-200/90 bg-zinc-50/80 hover:border-[#D97757] hover:bg-white active:scale-[0.97]"
            )}
            aria-label="切换日期或补交历史"
          >
            <CalendarDays
              className={cn(
                "size-4.5 stroke-[1.8] text-[#D97757] shrink-0 transition-transform duration-150",
                isCalendarOpen && "scale-110"
              )}
            />
            <div className="flex flex-col leading-none space-y-0.5 min-w-0">
              <span className="font-mono text-[14px] font-bold tabular-nums text-zinc-900 tracking-tight">
                {activeBizDate}
              </span>
              <span className="text-[11px] font-normal text-zinc-400 group-hover:text-zinc-600 transition-colors">
                切换日期 / 历史补填
              </span>
            </div>
            <ChevronDown
              className={cn(
                "size-3.5 stroke-[1.8] text-zinc-400 shrink-0 transition-transform duration-200 group-hover:text-zinc-700",
                isCalendarOpen && "rotate-180 text-[#D97757]"
              )}
            />
          </button>

          {/* 高阶精致日历 Popover 浮层（拓宽为 w-[330px]，舒展大方） */}
          {isCalendarOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
              <div className="w-[330px] rounded-2xl border border-zinc-200/90 bg-white/98 p-2.5 shadow-xl shadow-zinc-900/10 backdrop-blur-2xl ring-1 ring-black/5">
                <SubmissionCalendar
                  today={today}
                  submittedDates={submittedDates}
                  selectedDate={activeBizDate}
                  compact
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
    </div>
  );
}

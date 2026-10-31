"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const CALENDAR_CARD_CLASS = "w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#E2E2DF] bg-white p-3.5 sm:p-5 shadow-claude-float ring-1 ring-[#141413]/5";

interface MonthCalendarProps {
  today: string;
  viewMonth: { year: number; month: number };
  onMonthShift: (direction: -1 | 1) => void;
  canShiftPrev?: boolean;
  canShiftNext?: boolean;
  selectedDates: string[];
  onSelectDate: (date: string) => void;
  badgeByDate?: Record<string, number>;
  maxDate?: string;
  isDateDisabled?: (date: string) => boolean;
  cellClass?: (date: string) => string;
  cellExtra?: (date: string) => ReactNode;
  titleFor?: (date: string) => string | undefined;
  footer?: ReactNode;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const NAV_CLASS = "flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] disabled:text-[#A8A29E] disabled:opacity-30 disabled:cursor-not-allowed";

export function MonthCalendar({ today, viewMonth, onMonthShift, canShiftPrev = true, canShiftNext = true, selectedDates, onSelectDate, badgeByDate, maxDate, isDateDisabled, cellClass, cellExtra, titleFor, footer }: MonthCalendarProps) {
  const { year, month } = viewMonth;
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-3.5">
        <button type="button" onClick={() => onMonthShift(-1)} disabled={!canShiftPrev} className={NAV_CLASS} aria-label="上个月"><ChevronLeft className="size-4" /></button>
        <span className="text-[14px] leading-[1.40] text-[#141413] tabular-nums px-1">{year}年{month}月</span>
        <button type="button" onClick={() => onMonthShift(1)} disabled={!canShiftNext} className={NAV_CLASS} aria-label="下个月"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map((day) => <div key={day} className="h-7 flex items-center justify-center text-[14px] text-[#78716C]">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }, (_, i) => <div key={`empty-${i}`} className="h-9 w-full" aria-hidden="true" />)}
        {dates.map((date, index) => {
          const selected = selectedDates.includes(date);
          const disabled = Boolean((maxDate && date > maxDate) || isDateDisabled?.(date));
          const count = badgeByDate?.[date];
          const label = `${month}月${index + 1}日 周${WEEKDAYS[new Date(year, month - 1, index + 1).getDay()]}${count ? ` · ${count} 条` : ""}`;
          return (
            <button key={date} type="button" disabled={disabled} onClick={() => onSelectDate(date)} title={titleFor?.(date)} aria-label={label} aria-current={date === today ? "date" : undefined}
              className={cn("relative flex h-9 w-full items-center justify-center rounded-md text-[14px] tabular-nums transition-colors duration-150 outline-none select-none cursor-pointer", count ? "text-[#1F1E1D] hover:bg-[#EBEBE9]" : "text-[#A8A29E] hover:bg-[#EBEBE9]", cellClass?.(date), selected && "bg-status-info/[0.12] text-status-info", disabled && "text-[#A8A29E] opacity-40 cursor-not-allowed")}>
              <span className="leading-none">{index + 1}</span>
              {count ? <span className={cn("absolute right-0.5 top-0.5 text-[12px] leading-none", selected ? "text-status-info" : "text-[#78716C]")}>{count}</span> : null}
              {cellExtra?.(date)}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

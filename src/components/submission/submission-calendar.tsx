"use client";

import { useState, useMemo } from "react";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { cn } from "@/lib/utils";

export type SubmissionCalendarDateState =
  | "submitted"
  | "waive"
  | "leave"
  | "pending"
  | "absent"
  | "missing"
  | "unsubmitted"
  | "future";

interface SubmissionCalendarProps {
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
  absentDates?: string[];
  absentReasons?: Record<string, string>;
  className?: string;
  selectedDate?: string | null;
  selectedDates?: string[];
  onDateSelect?: (date: string, hasSubmission: boolean) => void;
  showLegend?: boolean;
}

function resolveCellState({
  dateKey,
  today,
  submittedDates,
  waiveDates,
  leaveDates,
  pendingDates,
  absentDates,
}: {
  dateKey: string;
  today: string;
  submittedDates: Set<string>;
  waiveDates: Set<string>;
  leaveDates: Set<string>;
  pendingDates: Set<string>;
  absentDates: Set<string>;
}): SubmissionCalendarDateState {
  if (dateKey > today) return "future";
  if (submittedDates.has(dateKey)) return "submitted";
  if (waiveDates.has(dateKey)) return "waive";
  if (leaveDates.has(dateKey)) return "leave";
  if (pendingDates.has(dateKey)) return "pending";
  if (absentDates.has(dateKey)) return "absent";
  if (dateKey === today) return "unsubmitted";
  return "missing";
}

export function SubmissionCalendar({
  today,
  submittedDates,
  waiveDates = [],
  leaveDates = [],
  pendingDates = [],
  absentDates = [],
  absentReasons = {},
  className,
  selectedDate = null,
  selectedDates = [],
  onDateSelect,
  showLegend = true,
}: SubmissionCalendarProps) {
  const [displayDate, setDisplayDate] = useState(() => {
    if (
      selectedDate &&
      !isNaN(new Date(`${selectedDate}T00:00:00`).getTime())
    ) {
      return new Date(`${selectedDate}T00:00:00`);
    }
    return new Date(`${today}T00:00:00`);
  });

  const todayDate = useMemo(() => new Date(`${today}T00:00:00`), [today]);

  const canGoNext = useMemo(() => {
    return (
      displayDate.getFullYear() < todayDate.getFullYear() ||
      (displayDate.getFullYear() === todayDate.getFullYear() &&
        displayDate.getMonth() < todayDate.getMonth())
    );
  }, [displayDate, todayDate]);

  const handlePrevMonth = () => {
    setDisplayDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    setDisplayDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
  };

  const submittedDateSet = useMemo(
    () => new Set(submittedDates),
    [submittedDates],
  );
  const waiveDateSet = useMemo(() => new Set(waiveDates), [waiveDates]);
  const leaveDateSet = useMemo(() => new Set(leaveDates), [leaveDates]);
  const pendingDateSet = useMemo(() => new Set(pendingDates), [pendingDates]);
  const absentDateSet = useMemo(() => new Set(absentDates), [absentDates]);

  const stateFor = (dateKey: string) => resolveCellState({
    dateKey, today, submittedDates: submittedDateSet, waiveDates: waiveDateSet,
    leaveDates: leaveDateSet, pendingDates: pendingDateSet, absentDates: absentDateSet,
  });

  return (
    <div className={cn("w-full select-none", className)}>
      <MonthCalendar
        today={today}
        viewMonth={{ year: displayDate.getFullYear(), month: displayDate.getMonth() + 1 }}
        onMonthShift={(direction) => direction === -1 ? handlePrevMonth() : handleNextMonth()}
        canShiftNext={canGoNext}
        selectedDates={[...(selectedDate ? [selectedDate] : []), ...selectedDates]}
        onSelectDate={(date) => {
          const state = stateFor(date);
          onDateSelect?.(date, state === "submitted" || state === "waive");
        }}
        isDateDisabled={(date) => stateFor(date) === "future"}
        titleFor={(date) => {
          const state = stateFor(date);
          return state === "pending" ? "申请审批中"
            : state === "absent" ? absentReasons[date] ? `缺勤：${absentReasons[date]}` : "缺勤"
              : state === "waive" ? "已豁免" : state === "leave" ? "已请假"
                : state === "submitted" ? "已提交" : undefined;
        }}
        cellClass={(date) => {
          const state = stateFor(date);
          const selected = selectedDate === date || selectedDates.includes(date);
          return cn(
            selected && "font-normal shadow-input z-10",
            !selected && state === "submitted" && "bg-status-success/[0.22] text-status-success font-normal border border-status-success/35 hover:bg-status-success/30",
            !selected && state === "waive" && "bg-status-warning/[0.22] text-status-warning font-normal border border-status-warning/40 hover:bg-status-warning/30",
            !selected && state === "leave" && "bg-status-info/[0.22] text-status-info font-normal border border-status-info/35 hover:bg-status-info/30",
            !selected && state === "pending" && "bg-[#F1F1F0]/60 text-[#78716C] font-normal border border-dashed border-[#E2E2DF]",
            !selected && state === "absent" && "bg-status-danger/[0.12] text-status-danger font-normal border border-status-danger/35 hover:bg-status-danger/20",
            !selected && (state === "unsubmitted" || state === "missing") && "text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]",
          );
        }}
        cellExtra={(date) => {
          const state = stateFor(date);
          const selected = selectedDate === date || selectedDates.includes(date);
          return state === "future" ? null : (
            <span className={cn(
              "absolute bottom-1 size-1 rounded-full",
              selected && "bg-current text-status-info",
              !selected && state === "submitted" && "bg-current text-status-success",
              !selected && state === "waive" && "bg-current text-status-warning",
              !selected && state === "leave" && "bg-current text-status-info",
              !selected && state === "pending" && "bg-[#A8A29E]",
              !selected && state === "absent" && "bg-status-danger",
              !selected && (state === "unsubmitted" || state === "missing") && "bg-[#A8A29E]",
            )} />
          );
        }}
      />

      {selectedDate && absentDateSet.has(selectedDate) && (
        <p className="mt-3 rounded-lg bg-status-danger/[0.08] px-3 py-2 text-[12px] leading-5 text-status-danger" role="status">
          {selectedDate} · 缺勤 · {absentReasons[selectedDate] || "原因未提供"}
        </p>
      )}

      {/* 底部四色图例说明 - 居中排布；文字不折行，放不下时整项换行 */}
      {showLegend && (
        <div className="pt-3 mt-3 border-t border-[#E2E2DF]/60 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-[#78716C]">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-status-danger" /> 缺勤
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-current text-status-success" /> 已交
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-current text-status-warning" /> 特殊豁免
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-current text-status-info" /> 请假
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-[#A8A29E]" /> 未交
          </span>
        </div>
      )}
    </div>
  );
}

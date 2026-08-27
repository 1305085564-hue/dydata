"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubmissionCalendarDateState =
  | "submitted"
  | "waive"
  | "leave"
  | "pending"
  | "missing"
  | "unsubmitted"
  | "future";

interface SubmissionCalendarProps {
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
  className?: string;
  selectedDate?: string | null;
  selectedDates?: string[];
  onDateSelect?: (date: string, hasSubmission: boolean) => void;
  showLegend?: boolean;
}

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function resolveCellState({
  dateKey,
  today,
  submittedDates,
  waiveDates,
  leaveDates,
  pendingDates,
}: {
  dateKey: string;
  today: string;
  submittedDates: Set<string>;
  waiveDates: Set<string>;
  leaveDates: Set<string>;
  pendingDates: Set<string>;
}): SubmissionCalendarDateState {
  if (dateKey > today) return "future";
  if (submittedDates.has(dateKey)) return "submitted";
  if (waiveDates.has(dateKey)) return "waive";
  if (leaveDates.has(dateKey)) return "leave";
  if (pendingDates.has(dateKey)) return "pending";
  if (dateKey === today) return "unsubmitted";
  return "missing";
}

function getCalendarCells({
  targetDate,
  today,
  submittedDates,
  waiveDates,
  leaveDates,
  pendingDates,
}: {
  targetDate: Date;
  today: string;
  submittedDates: Set<string>;
  waiveDates: Set<string>;
  leaveDates: Set<string>;
  pendingDates: Set<string>;
}) {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  
  // 周日为第一列 (0=周日, 1=周一, ... 6=周六)
  const firstWeekday = monthStart.getDay();
  const totalDays = monthEnd.getDate();
  
  const cells: Array<{
    key: string;
    day?: number;
    state?: SubmissionCalendarDateState;
    isToday?: boolean;
  }> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `empty-${index}` });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const current = new Date(year, month, day);
    const key = formatLocalDate(current);
    const state = resolveCellState({
      dateKey: key,
      today,
      submittedDates,
      waiveDates,
      leaveDates,
      pendingDates,
    });

    cells.push({ key, day, state, isToday: key === today });
  }

  return {
    monthLabel: getMonthLabel(targetDate),
    cells,
  };
}

export function SubmissionCalendar({
  today,
  submittedDates,
  waiveDates = [],
  leaveDates = [],
  pendingDates = [],
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

  const { monthLabel, cells } = useMemo(
    () =>
      getCalendarCells({
        targetDate: displayDate,
        today,
        submittedDates: submittedDateSet,
        waiveDates: waiveDateSet,
        leaveDates: leaveDateSet,
        pendingDates: pendingDateSet,
      }),
    [
      displayDate,
      today,
      submittedDateSet,
      waiveDateSet,
      leaveDateSet,
      pendingDateSet,
    ],
  );

  return (
    <div className={cn("w-full select-none", className)}>
      {/* 头部 Month 切换导航 */}
      <div className="flex items-center justify-between px-1 mb-3.5">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="flex size-7 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.98] transition-all cursor-pointer"
          title="上个月"
          aria-label="上个月"
        >
          <ChevronLeft className="size-4 stroke-[2]" />
        </button>

        <h3 className="text-[15px] font-semibold text-[#1C1917] tabular-nums">
          {monthLabel}
        </h3>

        <button
          type="button"
          disabled={!canGoNext}
          onClick={handleNextMonth}
          className={cn(
            "flex size-7 items-center justify-center rounded-lg transition-all",
            canGoNext
              ? "text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.98] cursor-pointer"
              : "text-[#D6D3D1] opacity-30 cursor-not-allowed",
          )}
          title="下个月"
          aria-label="下个月"
        >
          <ChevronRight className="size-4 stroke-[2]" />
        </button>
      </div>

      {/* 星期标头 (周日~周六) */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="h-7 flex items-center justify-center text-[13px] text-[#78716C]"
          >
            {label}
          </div>
        ))}
      </div>

      {/* 日历网格 */}
      <div className="grid grid-cols-7 gap-x-1 gap-y-1.5">
        {cells.map((cell) => {
          if (!cell.day) {
            return (
              <div
                key={cell.key}
                className="h-9 w-full"
                aria-hidden="true"
              />
            );
          }

          const isSelected =
            selectedDate === cell.key || selectedDates.includes(cell.key);
          const isSubmitted = cell.state === "submitted";
          const isWaive = cell.state === "waive";
          const isLeave = cell.state === "leave";
          const isPendingState = cell.state === "pending";
          const isFuture = cell.state === "future";
          const isUnsubmitted = !isSubmitted && !isWaive && !isLeave && !isPendingState && !isFuture;

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isFuture}
              onClick={() => onDateSelect?.(cell.key, isSubmitted || isWaive)}
              className={cn(
                "relative flex h-9 w-full flex-col items-center justify-center rounded-lg text-[13.5px] tabular-nums transition-all duration-150 outline-none select-none",
                !isFuture && "cursor-pointer active:scale-[0.96]",

                // 选中态：暴风灰蓝实底 (Storm Blue)
                isSelected &&
                  "bg-[#3D687A] text-white font-medium shadow-xs z-10",

                // 已提交 (未选中态)
                !isSelected &&
                  isSubmitted &&
                  "bg-[#EAF3EC] text-[#2E7D32] font-medium hover:bg-[#DDF0E1]",

                // 豁免 (未选中态)
                !isSelected &&
                  isWaive &&
                  "bg-[#FAF4ED] text-[#B98A54] font-medium hover:bg-[#F5EDE0]",

                // 请假 (未选中态)
                !isSelected &&
                  isLeave &&
                  "bg-[#F0F4F8] text-[#43718E] font-medium hover:bg-[#E4ECF2]",

                // 审批中 (未选中态)
                !isSelected &&
                  isPendingState &&
                  "bg-[#FAF4ED] text-[#B98A54] font-medium border border-[#B98A54]/40",

                // 常规未提交工作日 (未选中态)
                !isSelected &&
                  isUnsubmitted &&
                  "text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]",

                // 未来日期
                isFuture &&
                  "text-[#D6D3D1] opacity-40 cursor-not-allowed",
              )}
            >
              <span className="leading-none">{cell.day}</span>

              {/* 状态微点 */}
              {!isFuture && (
                <span
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full",
                    isSelected && "bg-white",
                    !isSelected && isSubmitted && "bg-[#2E7D32]",
                    !isSelected && isWaive && "bg-[#B98A54]",
                    !isSelected && isLeave && "bg-[#43718E]",
                    !isSelected && isPendingState && "bg-[#B98A54] animate-pulse",
                    !isSelected && isUnsubmitted && "bg-[#A8A29E]",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 底部四色图例说明 */}
      {showLegend && (
        <div className="pt-3 mt-3 border-t border-[#ECE7DE]/80 flex items-center justify-between px-1 text-[11.5px] text-[#78716C]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#2E7D32]" /> 已交
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#B98A54]" /> 豁免
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#43718E]" /> 请假
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#A8A29E]" /> 未交
          </span>
        </div>
      )}
    </div>
  );
}

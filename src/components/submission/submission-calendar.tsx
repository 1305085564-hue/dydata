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
      {/* 头部 Month 切换导航：左右箭头直接紧密靠拢月份 */}
      <div className="flex items-center justify-center gap-2 mb-3.5">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] active:scale-[0.99] active:duration-120 transition-all cursor-pointer"
          title="上个月"
          aria-label="上个月"
        >
          <ChevronLeft className="size-4 stroke-[2]" />
        </button>

        <h3 className="text-[14px] leading-[1.40] font-medium text-[#141413] tabular-nums px-1">
          {monthLabel}
        </h3>

        <button
          type="button"
          disabled={!canGoNext}
          onClick={handleNextMonth}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-all",
            canGoNext
              ? "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] active:scale-[0.99] active:duration-120 cursor-pointer"
              : "text-[#A8A29E] opacity-30 cursor-not-allowed",
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
      <div className="grid grid-cols-7 gap-x-1 gap-y-1">
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

          const titleText = isPendingState
            ? "申请审批中"
            : isWaive
              ? "已豁免"
              : isLeave
                ? "已请假"
                : isSubmitted
                  ? "已提交"
                  : undefined;

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isFuture}
              title={titleText}
              onClick={() => onDateSelect?.(cell.key, isSubmitted || isWaive)}
              className={cn(
                "relative flex h-9 w-full flex-col items-center justify-center rounded-md text-[14px] tabular-nums transition-all duration-150 outline-none select-none",
                !isFuture && "cursor-pointer active:scale-[0.99] active:duration-120",

                // 选中态：暴雨灰蓝微印记 (Storm Blue)
                isSelected &&
                  "bg-status-info/[0.12] text-status-info font-normal shadow-input z-10",

                // 已提交 (未选中态) - 草木绿（加深色阶与边框，清晰明亮）
                !isSelected &&
                  isSubmitted &&
                  "bg-status-success/[0.22] text-status-success font-normal border border-status-success/35 hover:bg-status-success/30",

                // 豁免 (未选中态) - 金石琥珀（加深色阶与边框，彻底与未交拉开色差）
                !isSelected &&
                  isWaive &&
                  "bg-status-warning/[0.22] text-status-warning font-normal border border-status-warning/40 hover:bg-status-warning/30",

                // 请假 (未选中态) - 晴岚灰蓝（加深色阶与边框，沉静清晰）
                !isSelected &&
                  isLeave &&
                  "bg-status-info/[0.22] text-status-info font-normal border border-status-info/35 hover:bg-status-info/30",

                // 审批中 (未选中态) - 轻量浅灰虚线锁定，不占彩色语义
                !isSelected &&
                  isPendingState &&
                  "bg-[#F1F1F0]/60 text-[#78716C] font-normal border border-dashed border-[#E2E2DF]",

                // 常规未提交工作日 (未选中态) - 保持素砂中性色不变
                !isSelected &&
                  isUnsubmitted &&
                  "text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]",

                // 未来日期
                isFuture &&
                  "text-[#A8A29E] opacity-40 cursor-not-allowed",
              )}
            >
              <span className="leading-none">{cell.day}</span>

              {/* 状态微点 */}
              {!isFuture && (
                <span
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full",
                    isSelected && "bg-current text-status-info",
                    !isSelected && isSubmitted && "bg-current text-status-success",
                    !isSelected && isWaive && "bg-current text-status-warning",
                    !isSelected && isLeave && "bg-current text-status-info",
                    !isSelected && isPendingState && "bg-[#A8A29E]",
                    !isSelected && isUnsubmitted && "bg-[#A8A29E]",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 底部四色图例说明 - 居中排布 */}
      {showLegend && (
        <div className="pt-3 mt-3 border-t border-[#E2E2DF]/60 flex items-center justify-center gap-4 sm:gap-6 text-[12px] text-[#78716C]">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-current text-status-success" /> 已交
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-current text-status-warning" /> 特殊豁免
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-current text-status-info" /> 请假
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[#A8A29E]" /> 未交
          </span>
        </div>
      )}
    </div>
  );
}

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
  compact?: boolean;
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

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
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const totalDays = monthEnd.getDate();
  const cells: Array<{ key: string; day?: number; state?: SubmissionCalendarDateState; isToday?: boolean }> = [];

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

function getStateText(state: SubmissionCalendarDateState) {
  if (state === "submitted") return "已交";
  if (state === "waive") return "免交";
  if (state === "leave") return "请假";
  if (state === "pending") return "审批中";
  if (state === "unsubmitted") return "未交";
  if (state === "future") return "未到";
  return "漏交";
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
  compact = false,
}: SubmissionCalendarProps) {
  const [displayDate, setDisplayDate] = useState(() => {
    if (selectedDate && !isNaN(new Date(`${selectedDate}T00:00:00`).getTime())) {
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
    setDisplayDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    setDisplayDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const submittedDateSet = useMemo(() => new Set(submittedDates), [submittedDates]);
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
    [displayDate, today, submittedDateSet, waiveDateSet, leaveDateSet, pendingDateSet],
  );

  return (
    <section
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3 select-none",
        className,
      )}
    >
      {/* 头部 Month 动态切换选择器 */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-400" />
          <h3 className="text-[13px] font-semibold text-zinc-900 tracking-tight">选择日期</h3>
        </div>
        
        <div className="flex items-center gap-0.5 rounded-full bg-zinc-100 p-0.5 border border-zinc-200">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex size-6 items-center justify-center rounded-full text-zinc-600 hover:bg-white hover:text-zinc-950 active:scale-95 transition-all"
            title="上一个月"
          >
            <ChevronLeft className="size-3.5 stroke-[2]" />
          </button>
          <span className="text-[11.5px] font-semibold text-zinc-800 tabular-nums px-1.5">
            {monthLabel}
          </span>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={handleNextMonth}
            className={cn(
              "flex size-6 items-center justify-center rounded-full transition-all",
              canGoNext
                ? "text-zinc-600 hover:bg-white hover:text-zinc-950 active:scale-95 cursor-pointer"
                : "text-zinc-300 opacity-40 cursor-not-allowed"
            )}
            title="下一个月"
          >
            <ChevronRight className="size-3.5 stroke-[2]" />
          </button>
        </div>
      </div>

      {/* 周标题 (Week Labels) */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="h-6 flex items-center justify-center text-[11.5px] font-medium text-zinc-400"
          >
            {label}
          </div>
        ))}
      </div>

      {/* 日历网格 (Date Grid) */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.day) {
            return (
              <div
                key={cell.key}
                className="h-10 rounded-lg"
                aria-hidden="true"
              />
            );
          }

          const isSelected = selectedDate === cell.key || selectedDates.includes(cell.key);
          const isSubmitted = cell.state === "submitted" || cell.state === "waive";
          const isLeave = cell.state === "leave";
          const isPendingState = cell.state === "pending";
          const isMissing = cell.state === "missing" || cell.state === "unsubmitted";
          const isFuture = cell.state === "future";

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isFuture}
              onClick={() => onDateSelect?.(cell.key, isSubmitted)}
              className={cn(
                "relative flex h-10 w-full flex-col items-center justify-center rounded-lg text-[13px] transition-all duration-150 ease-out outline-none",
                !isFuture && "cursor-pointer hover:scale-[1.05] active:scale-95",
                
                // 默认/未选中态
                !isSelected && !isFuture && "hover:bg-zinc-100 hover:text-zinc-950",
                !isSelected && isSubmitted && "bg-emerald-50/40 text-emerald-900 font-medium",
                !isSelected && isLeave && "bg-amber-50/40 text-amber-900 font-medium",
                !isSelected && isPendingState && "bg-amber-50/60 text-amber-900 font-medium border border-amber-300/60",
                !isSelected && isMissing && "bg-rose-50/30 text-rose-900 font-medium",
                !isSelected && isFuture && "text-zinc-300 opacity-60 cursor-not-allowed",

                // 选中态：黑胶囊高亮浮起
                isSelected &&
                  "bg-zinc-900 text-white font-semibold shadow-md scale-[1.05] z-10"
              )}
            >
              <span className="tabular-nums leading-none">{cell.day}</span>

              {/* 状态微点 (Micro Status Dot) */}
              {!isFuture && (
                <span
                  className={cn(
                    "mt-1 size-1 rounded-full transition-transform",
                    isSelected
                      ? "bg-white"
                      : isSubmitted
                        ? "bg-emerald-500"
                        : isLeave
                          ? "bg-amber-500"
                          : isPendingState
                            ? "bg-amber-500 animate-pulse ring-2 ring-amber-400/40"
                            : "bg-rose-500"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 底部微型极简图例说明 (Minimal Footer Legend) */}
      <div className="pt-2 border-t border-zinc-100 flex flex-wrap items-center justify-center gap-3.5 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" /> 已交/免交
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse ring-1 ring-amber-400/50" /> 审批中
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-amber-500" /> 请假
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-rose-500" /> 未交/漏交
        </span>
      </div>
    </section>
  );
}

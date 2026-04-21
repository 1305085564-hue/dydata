"use client";

import { cn } from "@/lib/utils";

interface SubmissionCalendarProps {
  today: string;
  submittedDates: string[];
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

function getCalendarCells(today: string, submittedDates: Set<string>) {
  const todayDate = new Date(`${today}T00:00:00`);
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const totalDays = monthEnd.getDate();
  const cells: Array<{ key: string; day?: number; state?: "submitted" | "missing" | "future" | "today" | "exempt" }> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `empty-${index}` });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const current = new Date(todayDate.getFullYear(), todayDate.getMonth(), day);
    const key = formatLocalDate(current);
    let state: "submitted" | "missing" | "future" | "today" | "exempt" = "missing";

    const isExempt = current.getDay() === 6;
    if (key > today) {
      state = "future";
    } else if (submittedDates.has(key)) {
      state = key === today ? "today" : "submitted";
    } else if (key === today) {
      state = "today";
    } else if (isExempt) {
      state = "exempt";
    }

    cells.push({ key, day, state });
  }

  return {
    monthLabel: getMonthLabel(todayDate),
    cells,
  };
}

export function SubmissionCalendar({
  today,
  submittedDates,
  className,
  selectedDate = null,
  selectedDates = [],
  onDateSelect,
  compact = false,
}: SubmissionCalendarProps) {
  const submittedDateSet = new Set(submittedDates);
  const { monthLabel, cells } = getCalendarCells(today, submittedDateSet);

  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-white/70 bg-white/82 p-4 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-5",
        className,
      )}
    >
      {compact ? (
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-sm font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
            选择日期
          </h3>
          <div className="inline-flex items-center rounded-full bg-slate-100/80 px-2.5 py-1 text-xs font-medium text-slate-600">
            {monthLabel}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
              Submission Calendar
            </p>
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
              数据填报日历
            </h3>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              选择某一天后，可查看当日是否已提交；已提交可查看数据，未提交可进入补交流程。
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-white/75 bg-white/92 px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-light)]">
            {monthLabel}
          </div>
        </div>
      )}

      <div className={cn("flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]", compact ? "mt-1" : "mt-4")}>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
          <span className="size-2 rounded-full bg-emerald-500" />
          已交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-700">
          <span className="size-2 rounded-full bg-rose-500" />
          今日未交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-700">
          <span className="size-2 rounded-full bg-rose-500" />
          漏交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-slate-500">
          <span className="size-2 rounded-full bg-slate-300" />
          豁免/未到
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-8 items-center justify-center rounded-[10px] bg-slate-100/90 text-[11px] sm:text-xs font-semibold text-[var(--color-text-secondary)]"
          >
            {label}
          </div>
        ))}

        {cells.map((cell) =>
          cell.day ? (
            <button
              key={cell.key}
              type="button"
              onClick={() => onDateSelect?.(cell.key, submittedDateSet.has(cell.key))}
              className={cn(
                "flex aspect-square sm:aspect-auto sm:min-h-[4rem] flex-col items-center justify-center rounded-[12px] border text-sm font-semibold shadow-[var(--shadow-light)] transition-all",
                onDateSelect && "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)]",
                cell.state === "submitted" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                cell.state === "missing" && "border-rose-400 bg-rose-50 text-rose-600 ring-1 ring-rose-200",
                cell.state === "exempt" && "border-slate-200 bg-slate-50 text-slate-400 opacity-70",
                cell.state === "future" && "border-slate-200 bg-slate-50 text-slate-400",
                cell.state === "today" &&
                  (submittedDateSet.has(cell.key)
                    ? "border-emerald-400 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200"
                    : "border-rose-400 bg-rose-100 text-rose-800 ring-2 ring-rose-200"),
                (selectedDate === cell.key || selectedDates.includes(cell.key)) && "ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-white bg-[color:rgba(0,122,255,0.08)]",
              )}
            >
              <span className="text-xs sm:text-sm">{cell.day}</span>
              <span className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-medium leading-none sm:leading-tight">
                {cell.state === "future" ? "未到" : cell.state === "today" ? (submittedDateSet.has(cell.key) ? "已交" : "未交") : cell.state === "exempt" ? "豁免" : submittedDateSet.has(cell.key) ? "已交" : "漏交"}
              </span>
            </button>
          ) : (
            <div key={cell.key} className="aspect-square rounded-[12px] sm:aspect-auto sm:min-h-[4rem]" aria-hidden="true" />
          ),
        )}
      </div>
    </section>
  );
}

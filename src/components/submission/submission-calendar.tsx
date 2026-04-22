"use client";

import { cn } from "@/lib/utils";

export type SubmissionCalendarDateState =
  | "submitted"
  | "waive"
  | "leave"
  | "missing"
  | "unsubmitted"
  | "future";

interface SubmissionCalendarProps {
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
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
}: {
  dateKey: string;
  today: string;
  submittedDates: Set<string>;
  waiveDates: Set<string>;
  leaveDates: Set<string>;
}): SubmissionCalendarDateState {
  if (dateKey > today) return "future";
  if (submittedDates.has(dateKey)) return "submitted";
  if (waiveDates.has(dateKey)) return "waive";
  if (leaveDates.has(dateKey)) return "leave";
  if (dateKey === today) return "unsubmitted";
  return "missing";
}

function getCalendarCells({
  today,
  submittedDates,
  waiveDates,
  leaveDates,
}: {
  today: string;
  submittedDates: Set<string>;
  waiveDates: Set<string>;
  leaveDates: Set<string>;
}) {
  const todayDate = new Date(`${today}T00:00:00`);
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const totalDays = monthEnd.getDate();
  const cells: Array<{ key: string; day?: number; state?: SubmissionCalendarDateState; isToday?: boolean }> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `empty-${index}` });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const current = new Date(todayDate.getFullYear(), todayDate.getMonth(), day);
    const key = formatLocalDate(current);
    const state = resolveCellState({
      dateKey: key,
      today,
      submittedDates,
      waiveDates,
      leaveDates,
    });

    cells.push({ key, day, state, isToday: key === today });
  }

  return {
    monthLabel: getMonthLabel(todayDate),
    cells,
  };
}

function getStateText(state: SubmissionCalendarDateState) {
  if (state === "submitted") return "已交";
  if (state === "waive") return "免交";
  if (state === "leave") return "请假";
  if (state === "unsubmitted") return "未交";
  if (state === "future") return "未到";
  return "漏交";
}

export function SubmissionCalendar({
  today,
  submittedDates,
  waiveDates = [],
  leaveDates = [],
  className,
  selectedDate = null,
  selectedDates = [],
  onDateSelect,
  compact = false,
}: SubmissionCalendarProps) {
  const submittedDateSet = new Set(submittedDates);
  const waiveDateSet = new Set(waiveDates);
  const leaveDateSet = new Set(leaveDates);
  const { monthLabel, cells } = getCalendarCells({
    today,
    submittedDates: submittedDateSet,
    waiveDates: waiveDateSet,
    leaveDates: leaveDateSet,
  });

  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-white/70 bg-white/82 p-4 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-5",
        className,
      )}
    >
      {compact ? (
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-sm font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">选择日期</h3>
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
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">数据状态日历</h3>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              选择某一天后，可查看当日状态。已交、免交和请假不会再落入未交/漏交逻辑。
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
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
          <span className="size-2 rounded-full bg-emerald-400" />
          免交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
          <span className="size-2 rounded-full bg-amber-500" />
          请假
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-700">
          <span className="size-2 rounded-full bg-rose-500" />
          未交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-700">
          <span className="size-2 rounded-full bg-rose-500" />
          漏交
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-8 items-center justify-center rounded-[10px] bg-slate-100/90 text-[11px] font-semibold text-[var(--color-text-secondary)] sm:text-xs"
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
                "flex aspect-square flex-col items-center justify-center rounded-[12px] border text-sm font-semibold shadow-[var(--shadow-light)] transition-all sm:aspect-auto sm:min-h-[4rem]",
                onDateSelect && "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)]",
                cell.state === "submitted" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                cell.state === "waive" && "border-emerald-200 bg-emerald-50/80 text-emerald-700",
                cell.state === "leave" && "border-amber-200 bg-amber-50 text-amber-700",
                cell.state === "missing" && "border-rose-400 bg-rose-50 text-rose-600 ring-1 ring-rose-200",
                cell.state === "unsubmitted" && "border-rose-400 bg-rose-100 text-rose-800 ring-2 ring-rose-200",
                cell.state === "future" && "border-slate-200 bg-slate-50 text-slate-400",
                cell.isToday && cell.state === "submitted" && "border-emerald-400 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200",
                cell.isToday && cell.state === "waive" && "border-emerald-400 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200",
                cell.isToday && cell.state === "leave" && "border-amber-300 bg-amber-100 text-amber-800 ring-2 ring-amber-200",
                (selectedDate === cell.key || selectedDates.includes(cell.key)) &&
                  "ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-white bg-[color:rgba(0,122,255,0.08)]",
              )}
            >
              <span className="text-xs sm:text-sm">{cell.day}</span>
              <span className="mt-0.5 text-[9px] font-medium leading-none sm:mt-1 sm:text-[10px] sm:leading-tight">
                {getStateText(cell.state ?? "future")}
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

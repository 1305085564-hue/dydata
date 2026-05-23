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
        "rounded-2xl border border-zinc-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5",
        className,
      )}
    >
      {compact ? (
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-sm font-semibold tracking-[-0.02em] text-zinc-800">选择日期</h3>
          <div className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
            {monthLabel}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
              Submission Calendar
            </p>
            <h3 className="text-[18px] font-medium tracking-tight text-zinc-800">数据状态日历</h3>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              选择某一天后，可查看当日状态。已交、免交和请假不会再落入未交/漏交逻辑。
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-[var(--shadow-light)]">
            {monthLabel}
          </div>
        </div>
      )}

      <div className={cn("flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]", compact ? "mt-1" : "mt-4")}>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#6FAA7D]/10 px-3 py-1 text-[#6FAA7D]">
          <span className="h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
          已交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#6FAA7D]/10 px-3 py-1 text-[#6FAA7D]">
          <span className="h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
          免交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#D99E55]/10 px-3 py-1 text-[#D99E55]">
          <span className="h-2 w-2 rounded-full bg-[#D99E55] ring-1 ring-white" />
          请假
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#C9604D]/10 px-3 py-1 text-[#C9604D]">
          <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
          未交
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#C9604D]/10 px-3 py-1 text-[#C9604D]">
          <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
          漏交
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-8 items-center justify-center rounded-[10px] bg-zinc-100 text-[11px] font-semibold text-[var(--color-text-secondary)] sm:text-xs"
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
                "flex aspect-square flex-col items-center justify-center rounded-[12px] border text-sm font-semibold shadow-[var(--shadow-light)] transition-colors sm:aspect-auto sm:min-h-[4rem]",
                onDateSelect && "cursor-pointer",
                cell.state === "submitted" && "border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#6FAA7D]",
                cell.state === "waive" && "border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#6FAA7D]",
                cell.state === "leave" && "border-[#D99E55]/30 bg-[#D99E55]/10 text-[#D99E55]",
                cell.state === "missing" && "border-[#C9604D]/30 bg-[#C9604D]/10 text-[#C9604D]",
                cell.state === "unsubmitted" && "border-[#C9604D]/40 bg-[#C9604D]/10 text-[#C9604D] ring-1 ring-[#C9604D]/30",
                cell.state === "future" && "border-zinc-200 bg-zinc-50 text-zinc-400",
                cell.isToday && cell.state === "submitted" && "ring-1 ring-[#6FAA7D]/30",
                cell.isToday && cell.state === "waive" && "ring-1 ring-[#6FAA7D]/30",
                cell.isToday && cell.state === "leave" && "ring-1 ring-[#D99E55]/30",
                (selectedDate === cell.key || selectedDates.includes(cell.key)) &&
                  "ring-1 ring-[#D97757] ring-offset-2 ring-offset-white bg-[#D97757]/10",
              )}
            >
              <span className="text-xs sm:text-sm">{cell.day}</span>
              <span className="mt-0.5 text-[12px] font-medium leading-none sm:mt-1 sm:leading-tight">
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

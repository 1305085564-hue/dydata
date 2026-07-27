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
        "rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm space-y-4",
        className,
      )}
    >
      {compact ? (
        <div className="flex items-center justify-between pb-1 border-b border-zinc-100">
          <h3 className="text-[13px] font-semibold tracking-tight text-zinc-900">选择日期</h3>
          <div className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-0.5 text-[12px] font-medium text-zinc-700 tabular-nums">
            {monthLabel}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5F82A8]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                SUBMISSION CALENDAR
              </p>
            </div>
            <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900">数据填报日历</h3>
          </div>
          <div className="inline-flex items-center rounded-full border border-zinc-200/80 bg-zinc-50 px-3 py-1 text-[12.5px] font-semibold text-zinc-800 shadow-2xs tabular-nums">
            {monthLabel}
          </div>
        </div>
      )}

      {/* 低调精致微状态图例 (Refined Micro Legend Bar) */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/50 px-2.5 py-0.5 text-emerald-700 font-medium">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          已交
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/50 px-2.5 py-0.5 text-emerald-700 font-medium">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          免交
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/60 bg-amber-50/50 px-2.5 py-0.5 text-amber-700 font-medium">
          <span className="size-1.5 rounded-full bg-amber-500" />
          请假
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/60 bg-rose-50/50 px-2.5 py-0.5 text-rose-700 font-medium">
          <span className="size-1.5 rounded-full bg-rose-500" />
          未交
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/60 bg-rose-50/50 px-2.5 py-0.5 text-rose-700 font-medium">
          <span className="size-1.5 rounded-full bg-rose-500" />
          漏交
        </div>
      </div>

      {/* 周月日历网格 (Calendar Grid) */}
      <div className="pt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEK_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-7 items-center justify-center text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400 select-none"
          >
            {label}
          </div>
        ))}

        {cells.map((cell) => {
          if (!cell.day) {
            return (
              <div
                key={cell.key}
                className="aspect-square rounded-2xl sm:aspect-auto sm:min-h-[3.6rem]"
                aria-hidden="true"
              />
            );
          }

          const isSelected = selectedDate === cell.key || selectedDates.includes(cell.key);
          const isSubmitted = cell.state === "submitted" || cell.state === "waive";
          const isLeave = cell.state === "leave";
          const isMissing = cell.state === "missing" || cell.state === "unsubmitted";
          const isFuture = cell.state === "future";

          return (
            <button
              key={cell.key}
              type="button"
              disabled={isFuture}
              onClick={() => onDateSelect?.(cell.key, isSubmitted)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-2xl border text-[13px] font-medium transition-all duration-200 ease-out origin-center select-none outline-none sm:aspect-auto sm:min-h-[3.6rem] p-1",
                !isFuture && "cursor-pointer hover:scale-[1.04] active:scale-95 hover:z-20 hover:shadow-sm",
                isSubmitted && "border-emerald-200/70 bg-emerald-50/30 text-emerald-900 hover:bg-emerald-50/70",
                isLeave && "border-amber-200/70 bg-amber-50/30 text-amber-900 hover:bg-amber-50/70",
                isMissing && "border-rose-200/70 bg-rose-50/30 text-rose-900 hover:bg-rose-50/70",
                isFuture && "border-zinc-100 bg-zinc-50/40 text-zinc-400 opacity-50 cursor-not-allowed",
                cell.isToday && "ring-1 ring-[#D97757]/60 font-semibold",
                isSelected &&
                  "ring-2 ring-[#5F82A8] ring-offset-2 ring-offset-white border-[#5F82A8] bg-[#5F82A8]/10 text-zinc-950 font-semibold scale-[1.04] z-10 shadow-sm"
              )}
            >
              {/* 今日小亮点 */}
              {cell.isToday && (
                <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-[#D97757]" title="今天" />
              )}

              <span className="text-[13px] font-medium tabular-nums leading-none">
                {cell.day}
              </span>

              <div className="mt-1 flex items-center gap-1">
                {/* 微型状态气泡/Dot */}
                <span
                  className={cn(
                    "size-1 rounded-full",
                    isSubmitted && "bg-emerald-500",
                    isLeave && "bg-amber-500",
                    isMissing && "bg-rose-500",
                    isFuture && "bg-zinc-300"
                  )}
                />
                <span className="text-[10.5px] font-normal tracking-tight opacity-90 leading-none">
                  {getStateText(cell.state ?? "future")}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

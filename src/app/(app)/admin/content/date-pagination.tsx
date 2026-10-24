"use client";

import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getShanghaiDateString } from "./content-list-filters";

interface DatePaginationProps {
  /** 当前查看的日期（YYYY-MM-DD）；区间模式下作为锚点 */
  currentDate: string;
  /** 有作品的日期列表，降序 */
  availableDates: string[];
  /** 与 availableDates 同序的每日条数 */
  availableCounts?: Array<{ d: string; c: number }>;
  /** 区间模式起点（近7天/近30天/本月/自定义起止） */
  rangeStart?: string;
  /** 区间模式终点 */
  rangeEnd?: string;
  /** 是否正在切日取数 */
  isLoading?: boolean;
  /** 切换到某一天 */
  onDateChange: (date: string) => void;
  /** 区间模式下按窗口长度整体前后平移 */
  onShiftRange?: (direction: -1 | 1) => void;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const CALENDAR_HEADERS = ["日", "一", "二", "三", "四", "五", "六"];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_LABELS[date.getDay()]}`;
}

function formatShortDate(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toYearMonth(dateStr: string): { year: number; month: number } {
  const date = parseDate(dateStr) ?? new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

function shiftMonth(value: { year: number; month: number }, delta: number): { year: number; month: number } {
  const date = new Date(value.year, value.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const NAV_BUTTON_CLASS =
  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#1F1E1D] cursor-pointer";

const SHORTCUT_BUTTON_CLASS =
  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md px-2 py-1 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer";

export function DatePagination({
  currentDate,
  availableDates,
  availableCounts,
  rangeStart,
  rangeEnd,
  isLoading = false,
  onDateChange,
  onShiftRange,
}: DatePaginationProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => toYearMonth(currentDate || getShanghaiDateString()));
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const today = getShanghaiDateString();
  const isRange = Boolean(rangeStart && rangeEnd && rangeStart !== rangeEnd);
  const hasCounts = (availableCounts?.length ?? 0) > 0;

  const countByDate = useMemo(() => {
    // gate:transient-map temporary call-local projection
    const map = new Map<string, number>();
    for (const item of availableCounts ?? []) map.set(item.d, item.c);
    return map;
  }, [availableCounts]);

  // 箭头兜底：不依赖 currentDate 是否在名单里，按名单里「早于 / 晚于」它的最近一天取
  const earlierDate = useMemo(
    () => availableDates.find((date) => date < currentDate) ?? null,
    [availableDates, currentDate],
  );
  const laterDate = useMemo(() => {
    for (let i = availableDates.length - 1; i >= 0; i -= 1) {
      if (availableDates[i] > currentDate) return availableDates[i];
    }
    return null;
  }, [availableDates, currentDate]);

  const positionLabel = (() => {
    const index = availableDates.indexOf(currentDate);
    return index >= 0
      ? `第 ${index + 1} / 共 ${availableDates.length} 天`
      : `— / 共 ${availableDates.length} 天`;
  })();

  const baseLabel = isRange
    ? `${formatShortDate(rangeStart ?? "")} - ${formatShortDate(rangeEnd ?? "")}`
    : `${formatDateLabel(currentDate)}${hasCounts ? ` · ${countByDate.get(currentDate) ?? 0} 条` : ""}`;
  const loadingLabel = isLoading && pendingDate ? `正在加载 ${formatShortDate(pendingDate)}…` : baseLabel;

  const pickDate = (date: string) => {
    if (!date) return;
    setPendingDate(date);
    onDateChange(date);
    setOpen(false);
  };

  const stepPrev = () => {
    if (isRange) {
      onShiftRange?.(-1);
      return;
    }
    if (earlierDate) pickDate(earlierDate);
  };

  const stepNext = () => {
    if (isRange) {
      onShiftRange?.(1);
      return;
    }
    if (laterDate) pickDate(laterDate);
  };

  const { year, month } = viewMonth;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellDates: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => toDateString(year, month, index + 1)),
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-1 select-none">
      <button type="button" onClick={stepPrev} disabled={!isRange && !earlierDate} className={NAV_BUTTON_CLASS} aria-label="前一天">
        <ChevronLeft className="size-4" />
      </button>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setViewMonth(toYearMonth(currentDate || today));
        }}
      >
        <PopoverTrigger className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-[#141413] transition-colors hover:bg-[#EBEBE9] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10">
          <Calendar className="size-3.5 text-[#78716C]" />
          <span className="font-medium">{loadingLabel} <span className="hidden sm:inline text-[11px] text-[#A8A29E]">{positionLabel}</span></span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => setViewMonth(shiftMonth(viewMonth, -1))}
              className={NAV_BUTTON_CLASS}
              aria-label="上个月"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-[13px] font-medium text-[#141413]">
              {year}年{month + 1}月
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(shiftMonth(viewMonth, 1))}
              className={NAV_BUTTON_CLASS}
              aria-label="下个月"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1">
            {CALENDAR_HEADERS.map((header) => (
              <span key={header} className="py-1 text-center text-[12px] text-[#A8A29E]">
                {header}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cellDates.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} />;
              const count = countByDate.get(date);
              const isSelected = date === currentDate;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => pickDate(date)}
                  className={cn(
                    "relative flex h-9 items-center justify-center rounded-md text-[13px] transition-colors cursor-pointer",
                    isSelected
                      ? "bg-[#141413] text-white font-medium"
                      : count
                        ? "text-[#1F1E1D] hover:bg-[#EBEBE9]"
                        : "text-[#A8A29E] hover:bg-[#EBEBE9]",
                  )}
                  aria-label={`${formatDateLabel(date)}${count ? ` · ${count} 条` : ""}`}
                >
                  {Number(date.slice(8, 10))}
                  {count ? (
                    <span
                      className={cn(
                        "absolute right-0.5 top-0.5 text-[12px] leading-none",
                        isSelected ? "text-white/70" : "text-[#78716C]",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t border-[#E2E2DF] pt-2 space-y-1">
            <button
              type="button"
              onClick={() => pickDate(today)}
              className="w-full rounded-md py-1.5 text-[13px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
            >
              跳到今天
            </button>
            <button
              type="button"
              onClick={() => availableDates[0] && pickDate(availableDates[0])}
              disabled={availableDates.length === 0}
              className="w-full rounded-md py-1.5 text-[13px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              跳到最新
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <button type="button" onClick={stepNext} disabled={!isRange && !laterDate} className={NAV_BUTTON_CLASS} aria-label="后一天">
        <ChevronRight className="size-4" />
      </button>

      <button type="button" onClick={() => pickDate(today)} className={cn(SHORTCUT_BUTTON_CLASS, "hidden lg:inline-flex")}>
        今天
      </button>
      <button
        type="button"
        onClick={() => availableDates[0] && pickDate(availableDates[0])}
        disabled={availableDates.length === 0}
        className={cn(SHORTCUT_BUTTON_CLASS, "hidden lg:inline-flex")}
      >
        最新
      </button>
    </div>
  );
}

"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
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
  /** 区间范围（起点与终点） */
  range?: { start: string | null; end: string | null };
  /** 框选或选定区间回调 */
  onSelectRange?: (start: string, end: string) => void;
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

export function MonthCalendar({
  today,
  viewMonth,
  onMonthShift,
  canShiftPrev = true,
  canShiftNext = true,
  selectedDates,
  onSelectDate,
  range,
  onSelectRange,
  badgeByDate,
  maxDate,
  isDateDisabled,
  cellClass,
  cellExtra,
  titleFor,
  footer,
}: MonthCalendarProps) {
  const { year, month } = viewMonth;
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);

  // 拖拽划选状态
  const [dragState, setDragState] = useState<{ isDragging: boolean; start: string | null; hover: string | null }>({
    isDragging: false,
    start: null,
    hover: null,
  });
  // 两点连选暂存起点
  const [clickDraftStart, setClickDraftStart] = useState<string | null>(null);
  const dragStateRef = useRef(dragState);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // 全局监听鼠标抬起，防止拖拽划出组件外部后鼠标卡在拖拽中状态
  useEffect(() => {
    function handleGlobalMouseUp() {
      if (dragStateRef.current.isDragging) {
        const { start, hover } = dragStateRef.current;
        if (start && hover && start !== hover && onSelectRange) {
          const [rangeStart, rangeEnd] = [start, hover].sort();
          onSelectRange(rangeStart, rangeEnd);
          setClickDraftStart(null);
        } else if (start && (!hover || start === hover)) {
          onSelectDate(start);
          setClickDraftStart(start);
        }
        setDragState({ isDragging: false, start: null, hover: null });
      }
    }

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [onSelectRange, onSelectDate]);

  const handleCellMouseDown = (date: string, disabled: boolean, e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return;
    if (onSelectRange) {
      setDragState({ isDragging: true, start: date, hover: date });
    }
  };

  const handleCellMouseEnter = (date: string, disabled: boolean) => {
    if (disabled || !dragState.isDragging) return;
    setDragState((prev) => ({ ...prev, hover: date }));
  };

  const handleCellClick = (date: string, disabled: boolean) => {
    if (disabled) return;
    // 如果刚刚发生了跨天拖拽，mouseup 已处理，无需再触发 click
    if (dragState.isDragging && dragState.start && dragState.hover && dragState.start !== dragState.hover) {
      return;
    }

    if (onSelectRange) {
      if (!clickDraftStart) {
        setClickDraftStart(date);
        onSelectDate(date);
      } else if (clickDraftStart === date) {
        // 连点同一天，保持单天选择
        setClickDraftStart(null);
        onSelectDate(date);
      } else {
        // 第二次点击不同日期，形成区间
        const [rangeStart, rangeEnd] = [clickDraftStart, date].sort();
        onSelectRange(rangeStart, rangeEnd);
        setClickDraftStart(null);
      }
    } else {
      onSelectDate(date);
    }
  };

  // 计算当前有效高亮区间
  const activeRange = (() => {
    if (dragState.isDragging && dragState.start && dragState.hover) {
      const [start, end] = [dragState.start, dragState.hover].sort();
      return { start, end, isDragging: true };
    }
    if (range?.start && range?.end) {
      return { start: range.start, end: range.end, isDragging: false };
    }
    return null;
  })();

  return (
    <div className="select-none">
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

          // 是否在区间范围内
          const inRange = Boolean(activeRange && date >= activeRange.start && date <= activeRange.end);
          const isRangeEdge = Boolean(activeRange && (date === activeRange.start || date === activeRange.end));
          const isDraftStart = clickDraftStart === date;

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => handleCellMouseDown(date, disabled, e)}
              onMouseEnter={() => handleCellMouseEnter(date, disabled)}
              onClick={() => handleCellClick(date, disabled)}
              title={titleFor?.(date)}
              aria-label={label}
              aria-current={date === today ? "date" : undefined}
              className={cn(
                "relative flex h-9 w-full items-center justify-center rounded-md text-[14px] tabular-nums transition-colors duration-150 outline-none select-none cursor-pointer",
                count ? "text-[#1F1E1D] hover:bg-[#EBEBE9]" : "text-[#A8A29E] hover:bg-[#EBEBE9]",
                cellClass?.(date),
                // 单日选中或连选起点
                (selected || isDraftStart) && !inRange && "bg-status-info/[0.12] text-status-info",
                // 区间端点
                isRangeEdge && "bg-status-info/[0.18] text-status-info",
                // 区间内部
                inRange && !isRangeEdge && "bg-status-info/[0.08] text-[#141413]",
                disabled && "text-[#A8A29E] opacity-40 cursor-not-allowed"
              )}
            >
              <span className="leading-none">{index + 1}</span>
              {count ? (
                <span className={cn(
                  "absolute right-0.5 top-0.5 text-[12px] leading-none",
                  (selected || isRangeEdge) ? "text-status-info" : "text-[#78716C]"
                )}>
                  {count}
                </span>
              ) : null}
              {cellExtra?.(date)}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

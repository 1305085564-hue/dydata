"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export const CALENDAR_CARD_CLASS =
  "w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#E2E2DF] bg-white p-3.5 sm:p-5 shadow-claude-float ring-1 ring-[#141413]/5";

export interface MonthCalendarProps {
  today: string;
  viewMonth: { year: number; month: number };
  onMonthShift?: (direction: -1 | 1) => void;
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
  minDate?: string;
  isDateDisabled?: (date: string) => boolean;
  cellClass?: (date: string) => string;
  cellExtra?: (date: string) => ReactNode;
  titleFor?: (date: string) => string | undefined;
  footer?: ReactNode;
  /** 滚动容器最大视窗高度，默认 310px */
  maxScrollHeight?: number | string;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const NAV_CLASS =
  "flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] disabled:text-[#A8A29E] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors";

interface MonthDescriptor {
  year: number;
  month: number;
  key: string;
  firstWeekday: number;
  dates: string[];
}

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
  minDate,
  isDateDisabled,
  cellClass,
  cellExtra,
  titleFor,
  footer,
  maxScrollHeight = 310,
}: MonthCalendarProps) {
  const { year: anchorYear, month: anchorMonth } = viewMonth;
  const initialKey = `${anchorYear}-${String(anchorMonth).padStart(2, "0")}`;

  const [visibleMonthKey, setVisibleMonthKey] = useState<string>(initialKey);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 生成连续滚动的月份序列（以 viewMonth 为基准：前 14 个月 ~ 后 4 个月）
  const months = useMemo<MonthDescriptor[]>(() => {
    const list: MonthDescriptor[] = [];
    const anchorTotal = anchorYear * 12 + (anchorMonth - 1);
    let startTotal = anchorTotal - 14;
    let endTotal = anchorTotal + 4;

    if (minDate) {
      const [minY, minM] = minDate.split("-").map(Number);
      if (minY && minM) {
        startTotal = Math.max(startTotal, minY * 12 + (minM - 1));
      }
    }

    if (maxDate) {
      const [maxY, maxM] = maxDate.split("-").map(Number);
      if (maxY && maxM) {
        endTotal = Math.min(endTotal, maxY * 12 + (maxM - 1));
      }
    }

    for (let t = startTotal; t <= endTotal; t++) {
      const y = Math.floor(t / 12);
      const m = (t % 12) + 1;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const firstWeekday = new Date(y, m - 1, 1).getDay();
      const daysInMonth = new Date(y, m, 0).getDate();
      const dates = Array.from(
        { length: daysInMonth },
        (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
      );
      list.push({ year: y, month: m, key, firstWeekday, dates });
    }
    return list;
  }, [anchorYear, anchorMonth, maxDate, minDate]);

  // 初次渲染及 viewMonth 变更时自动滚动至目标月份
  const hasMountedRef = useRef(false);
  useEffect(() => {
    const key = `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}`;
    const targetEl = monthRefs.current[key];
    if (!targetEl || !scrollContainerRef.current) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      targetEl.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
      window.requestAnimationFrame(() => setVisibleMonthKey(key));
    } else {
      targetEl.scrollIntoView({ block: "start", behavior: "smooth" });
      window.requestAnimationFrame(() => setVisibleMonthKey(key));
    }
  }, [viewMonth.year, viewMonth.month]);

  // 监听容器滚动，计算当前吸附/主视窗所在的月份，同步更新顶栏标签
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerTop = container.getBoundingClientRect().top;
    let closestKey: string | null = null;
    let minDistance = Infinity;

    for (const [key, el] of Object.entries(monthRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // 当月份卡片顶部接近视窗顶部（或仍在主阅读区内）
      const distance = Math.abs(rect.top - (containerTop + 10));
      if (rect.bottom > containerTop + 24 && distance < minDistance) {
        minDistance = distance;
        closestKey = key;
      }
    }

    if (closestKey && closestKey !== visibleMonthKey) {
      setVisibleMonthKey(closestKey);
    }
  };

  // 拖拽划选状态
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    start: string | null;
    hover: string | null;
  }>({
    isDragging: false,
    start: null,
    hover: null,
  });
  const dragStateRef = useRef(dragState);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // 全局监听鼠标抬起，完成跨月区间框选
  useEffect(() => {
    function handleGlobalMouseUp() {
      if (!dragStateRef.current.isDragging) return;
      const { start, hover } = dragStateRef.current;
      if (start && hover && start !== hover && onSelectRange) {
        const [rangeStart, rangeEnd] = [start, hover].sort();
        onSelectRange(rangeStart, rangeEnd);
      }
      setDragState({ isDragging: false, start: null, hover: null });
    }

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [onSelectRange]);

  // 跨月拖拽划选边缘轻微自动滚动
  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.isDragging || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const mouseY = e.clientY;
    const topEdge = rect.top + 32;
    const bottomEdge = rect.bottom - 32;

    if (mouseY < topEdge) {
      scrollContainerRef.current.scrollTop -= 6;
    } else if (mouseY > bottomEdge) {
      scrollContainerRef.current.scrollTop += 6;
    }
  };

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
    onSelectDate(date);
  };

  // 当前有效高亮区间（支持实时拖拽预览和已有 range）
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

  // 顶栏当前显示的年与月
  const [currentDisplayYear, currentDisplayMonth] = useMemo(() => {
    const parts = visibleMonthKey.split("-").map(Number);
    return [parts[0] || anchorYear, parts[1] || anchorMonth];
  }, [visibleMonthKey, anchorYear, anchorMonth]);

  // 顶栏上一月 / 下一月微调按钮
  const handleStepMonth = (direction: -1 | 1) => {
    onMonthShift?.(direction);
    const currentIndex = months.findIndex((m) => m.key === visibleMonthKey);
    const targetIndex = currentIndex !== -1 ? currentIndex + direction : -1;
    if (targetIndex >= 0 && targetIndex < months.length) {
      const target = months[targetIndex];
      const el = monthRefs.current[target.key];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setVisibleMonthKey(target.key);
      }
    }
  };

  // 快速回滚至今天所在月份
  const todayMonthKey = today ? today.slice(0, 7) : initialKey;
  const isViewingToday = visibleMonthKey === todayMonthKey;
  const scrollToToday = () => {
    const targetEl = monthRefs.current[todayMonthKey];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setVisibleMonthKey(todayMonthKey);
    }
  };

  return (
    <div className="select-none flex flex-col">
      {/* 顶部年月导航与快捷微调 */}
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <button
          type="button"
          onClick={() => handleStepMonth(-1)}
          disabled={!canShiftPrev}
          className={NAV_CLASS}
          aria-label="上个月"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[14px] leading-[1.40] text-[#141413] tabular-nums px-1">
            {currentDisplayYear}年{currentDisplayMonth}月
          </span>
          {!isViewingToday && (
            <button
              type="button"
              onClick={scrollToToday}
              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-normal text-[#78716C] bg-[#F1F1F0] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
              title="滑动回本月"
            >
              <RotateCcw className="size-2.5" />
              <span>本月</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleStepMonth(1)}
          disabled={!canShiftNext}
          className={NAV_CLASS}
          aria-label="下个月"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* 星期标头（常驻置顶，保持 7 列严格对齐） */}
      <div className="grid grid-cols-7 gap-1 text-center py-1 border-b border-[#E2E2DF]/80 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="h-6 flex items-center justify-center text-[13px] font-normal text-[#78716C]">
            {day}
          </div>
        ))}
      </div>

      {/* 纵向连续流动画卷容器 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseMove={handleContainerMouseMove}
        style={{
          maxHeight: typeof maxScrollHeight === "number" ? `${maxScrollHeight}px` : maxScrollHeight,
          scrollbarWidth: "thin",
        }}
        className="overflow-y-auto overscroll-contain scroll-smooth pr-0.5 select-none [-webkit-overflow-scrolling:touch]"
      >
        {months.map((m) => (
          <div
            key={m.key}
            ref={(el) => {
              if (el) monthRefs.current[m.key] = el;
              else delete monthRefs.current[m.key];
            }}
            data-month-key={m.key}
            className="mb-3.5 last:mb-1"
          >
            {/* 月份轻量吸顶指示条 */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur-sm py-1 px-1 mb-1 border-b border-[#E2E2DF]/50 text-[12px] font-normal text-[#78716C]">
              <span>
                {m.year}年{m.month}月
              </span>
            </div>

            {/* 该月 7 列网格：月初紧接周历空位，月末自然接续 */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: m.firstWeekday }, (_, i) => (
                <div key={`empty-${m.key}-${i}`} className="h-8.5 w-full" aria-hidden="true" />
              ))}
              {m.dates.map((date, index) => {
                const selected = selectedDates.includes(date);
                const disabled = Boolean((maxDate && date > maxDate) || isDateDisabled?.(date));
                const count = badgeByDate?.[date];
                const dayNumber = index + 1;
                const weekdayIndex = new Date(m.year, m.month - 1, dayNumber).getDay();
                const label = `${m.month}月${dayNumber}日 周${WEEKDAYS[weekdayIndex]}${
                  count ? ` · ${count} 条` : ""
                }`;

                // 是否在区间范围内
                const inRange = Boolean(
                  activeRange && date >= activeRange.start && date <= activeRange.end
                );
                const isRangeEdge = Boolean(
                  activeRange && (date === activeRange.start || date === activeRange.end)
                );

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
                      "relative flex h-8.5 w-full items-center justify-center rounded-md text-[13px] sm:text-[14px] tabular-nums transition-colors duration-150 outline-none select-none cursor-pointer",
                      count
                        ? "text-[#1F1E1D] hover:bg-[#EBEBE9]"
                        : "text-[#141413] hover:bg-[#EBEBE9]",
                      cellClass?.(date),
                      // 今日未选中微标记
                      date === today &&
                        !selected &&
                        !inRange &&
                        "ring-1 ring-[#141413]/20",
                      // 单日选中
                      selected && !inRange && "bg-status-info/[0.12] text-status-info",
                      // 区间端点
                      isRangeEdge && "bg-status-info/[0.18] text-status-info",
                      // 区间内部
                      inRange && !isRangeEdge && "bg-status-info/[0.08] text-[#141413]",
                      disabled && "text-[#A8A29E] opacity-40 cursor-not-allowed hover:bg-transparent"
                    )}
                  >
                    <span className="leading-none">{dayNumber}</span>
                    {count ? (
                      <span
                        className={cn(
                          "absolute right-0.5 top-0.5 text-[12px] leading-none",
                          selected || isRangeEdge ? "text-status-info" : "text-[#78716C]"
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                    {cellExtra?.(date)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {footer}
    </div>
  );
}


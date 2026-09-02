"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubmissionCalendarProps {
  today: string;
  submittedDates: string[];
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

/**
 * 提交日历 - 用于日期选择
 * 遵循 Claude 设计规范：毛玻璃 + 漫反射阴影 + 平滑动画
 */
export function SubmissionCalendar({
  today,
  submittedDates,
  selectedDate,
  onDateSelect,
}: SubmissionCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // 获取当月天数
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // 生成日期网格
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const formatDate = (day: number) => {
    const m = (month + 1).toString().padStart(2, "0");
    const d = day.toString().padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const isSubmitted = (day: number) => {
    return submittedDates.includes(formatDate(day));
  };

  const isToday = (day: number) => {
    return formatDate(day) === today;
  };

  const isSelected = (day: number) => {
    return formatDate(day) === selectedDate;
  };

  const goToPrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  return (
    <div className="w-full">
      {/* 月份导航：左右箭头直接紧密靠拢月份 */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="flex size-7 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.99] cursor-pointer"
          title="上个月"
          aria-label="上个月"
        >
          <ChevronLeft size={16} />
        </button>

        <h3 className="text-sm font-semibold text-[#1C1917] tabular-nums px-1">
          {year}年{month + 1}月
        </h3>

        <button
          type="button"
          onClick={goToNextMonth}
          className="flex size-7 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.99] cursor-pointer"
          title="下个月"
          aria-label="下个月"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
          <div
            key={day}
            className="py-1 text-center text-[11px] font-medium text-[#78716C]"
          >
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} />;
          }

          const date = formatDate(day);
          const submitted = isSubmitted(day);
          const todayDate = isToday(day);
          const selected = isSelected(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => onDateSelect(date)}
              className={cn(
                "relative h-8 rounded-md text-[13px] transition-all duration-150",
                selected && "bg-[#43718E] text-white font-medium",
                !selected && todayDate && "border border-[#D97757] text-[#D97757] font-medium",
                !selected && !todayDate && submitted && "bg-[#6FAA7D]/10 text-[#6FAA7D] font-medium",
                !selected && !todayDate && !submitted && "text-[#78716C] hover:bg-[#F5F3EE]"
              )}
            >
              {day}
              {submitted && !selected && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#6FAA7D]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

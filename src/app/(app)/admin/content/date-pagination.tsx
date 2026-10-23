"use client";

import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DatePaginationProps {
  /** 当前查看的日期（YYYY-MM-DD） */
  currentDate: string;
  /** 有作品的日期列表，降序 */
  availableDates: string[];
  /** 切换到某一天 */
  onDateChange: (date: string) => void;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = WEEKDAYS[d.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

export function DatePagination({ currentDate, availableDates, onDateChange }: DatePaginationProps) {
  const [open, setOpen] = useState(false);

  const currentIndex = useMemo(
    () => availableDates.indexOf(currentDate),
    [availableDates, currentDate],
  );
  // 降序排列：index+1 = 更早的一天，index-1 = 更晚的一天
  const prevDate = currentIndex >= 0 ? availableDates[currentIndex + 1] : undefined;
  const nextDate = currentIndex > 0 ? availableDates[currentIndex - 1] : undefined;

  // 日历选择器里只展示最近 14 个有数据的日期，避免列表过长
  const recentDates = useMemo(() => availableDates.slice(0, 14), [availableDates]);

  const handleCalendarPick = (value: string) => {
    if (value) {
      onDateChange(value);
      setOpen(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1 select-none">
      {/* 前一天 */}
      <button
        type="button"
        onClick={() => prevDate && onDateChange(prevDate)}
        disabled={!prevDate}
        className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#1F1E1D] cursor-pointer"
        aria-label="前一天"
      >
        <ChevronLeft className="size-4" />
      </button>

      {/* 当前日期（点击弹出选择器） */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-[#141413] transition-colors hover:bg-[#EBEBE9] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10"
        >
          <Calendar className="size-3.5 text-[#78716C]" />
          <span className="font-medium">{formatDateLabel(currentDate)}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-0">
          {/* 最近有作品的日期快选 */}
          <div className="border-b border-[#E2E2DF] p-2">
            <div className="px-1 py-1 text-[12px] text-[#78716C]">最近有作品的日期</div>
            <div className="grid grid-cols-2 gap-1">
              {recentDates.length === 0 ? (
                <div className="col-span-2 px-1 py-3 text-[12px] text-[#A8A29E] text-center">
                  暂无数据
                </div>
              ) : (
                recentDates.map((date) => {
                  const isCurrent = date === currentDate;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => handleCalendarPick(date)}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-[13px] text-left transition-colors",
                        isCurrent
                          ? "bg-[#E4E4E1] text-[#141413] font-medium"
                          : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
                      )}
                    >
                      {formatDateLabel(date)}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          {/* 自定义日期 */}
          <div className="p-2">
            <div className="px-1 py-1 text-[12px] text-[#78716C]">选择其他日期</div>
            <Input
              type="date"
              defaultValue={currentDate}
              onChange={(e) => handleCalendarPick(e.target.value)}
              className="h-8 text-[13px]"
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* 后一天 */}
      <button
        type="button"
        onClick={() => nextDate && onDateChange(nextDate)}
        disabled={!nextDate}
        className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#1F1E1D] cursor-pointer"
        aria-label="后一天"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { isChinaWorkingDay } from "@/lib/工作日";

export interface MonthlyFulfillmentStripProps {
  today: string;
  activeBizDate: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
  absentDates?: string[];
  absentReasons?: Record<string, string>;
  onSelectDate: (date: string) => void;
  className?: string;
}

type CellState =
  | "submitted"
  | "today-pending"
  | "waive"
  | "leave"
  | "pending"
  | "absent"
  | "missing"
  | "rest"
  | "future";

export function MonthlyFulfillmentStrip({
  today,
  activeBizDate,
  submittedDates = [],
  waiveDates = [],
  leaveDates = [],
  pendingDates = [],
  absentDates = [],
  absentReasons = {},
  onSelectDate,
  className,
}: MonthlyFulfillmentStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayCellRef = useRef<HTMLButtonElement>(null);

  const submittedSet = useMemo(() => new Set(submittedDates), [submittedDates]);
  const waiveSet = useMemo(() => new Set(waiveDates), [waiveDates]);
  const leaveSet = useMemo(() => new Set(leaveDates), [leaveDates]);
  const pendingSet = useMemo(() => new Set(pendingDates), [pendingDates]);
  const absentSet = useMemo(() => new Set(absentDates), [absentDates]);

  // 解析当前年月（基于 activeBizDate 或 today）
  const { year, month, totalDays, monthLabel } = useMemo(() => {
    const baseDateStr = activeBizDate || today;
    const [yStr, mStr] = baseDateStr.split("-");
    const y = parseInt(yStr, 10) || new Date().getFullYear();
    const m = parseInt(mStr, 10) || new Date().getMonth() + 1;
    const days = new Date(y, m, 0).getDate();
    return {
      year: y,
      month: m,
      totalDays: days,
      monthLabel: `${m}月`,
    };
  }, [activeBizDate, today]);

  // 生成当月每一天的状态
  const { cells, submittedCount, requiredCount } = useMemo(() => {
    const list: Array<{
      dateKey: string;
      dayNumber: number;
      state: CellState;
      isToday: boolean;
      isSelected: boolean;
      title: string;
    }> = [];

    let subCount = 0;
    let reqCount = 0;

    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, "0");
      const monthStr = String(month).padStart(2, "0");
      const dateKey = `${year}-${monthStr}-${dayStr}`;
      const isToday = dateKey === today;
      const isSelected = dateKey === activeBizDate;
      const dateObj = new Date(year, month - 1, day, 12, 0, 0);
      const isWorkday = isChinaWorkingDay(dateObj);

      if (isWorkday && dateKey <= today) {
        reqCount++;
      }

      let state: CellState;
      let title = `${month}月${day}日`;

      if (dateKey > today) {
        state = "future";
        title += " · 未到日期";
      } else if (submittedSet.has(dateKey)) {
        state = "submitted";
        subCount++;
        title += " · 已完成履约 ✦";
      } else if (waiveSet.has(dateKey)) {
        state = "waive";
        subCount++;
        title += " · 调养豁免";
      } else if (leaveSet.has(dateKey)) {
        state = "leave";
        title += " · 已请假";
      } else if (pendingSet.has(dateKey)) {
        state = "pending";
        title += " · 豁免审批中";
      } else if (absentSet.has(dateKey)) {
        state = "absent";
        const reason = absentReasons[dateKey];
        title += reason ? ` · 缺勤 (${reason})` : " · 缺勤未交";
      } else if (!isWorkday) {
        state = "rest";
        title += " · 休息日 (免履约)";
      } else if (isToday) {
        state = "today-pending";
        title += " · 今日待办 (等待交卷)";
      } else {
        state = "missing";
        title += " · 历史未交 (可补交)";
      }

      list.push({
        dateKey,
        dayNumber: day,
        state,
        isToday,
        isSelected,
        title,
      });
    }

    return {
      cells: list,
      submittedCount: subCount,
      requiredCount: Math.max(reqCount, 1),
    };
  }, [
    year,
    month,
    totalDays,
    today,
    activeBizDate,
    submittedSet,
    waiveSet,
    leaveSet,
    pendingSet,
    absentSet,
    absentReasons,
  ]);

  // 进站初始化：小屏下平滑滚动至「今日」居中
  useEffect(() => {
    if (todayCellRef.current) {
      todayCellRef.current.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [today]);

  const isTodaySubmitted = submittedSet.has(today);
  const isTodayWorkday = isChinaWorkingDay(new Date(`${today}T12:00:00`));

  return (
    <section
      aria-label="当月履约账本微格看板"
      className={cn("py-1", className)}
    >
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
        {/* 左侧：当月履约统计概览与今日状态指示 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-serif text-[14px] text-[#141413] tracking-tight">
              {monthLabel}履约账本
            </span>
            <span className="text-[12px] tabular-nums text-[#78716C] font-sans">
              已履约 <strong className="font-normal text-[#1F1E1D]">{submittedCount}</strong> / {requiredCount} 天
            </span>
          </div>

          {/* 今日入账指示胶囊 */}
          {isTodaySubmitted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#2E7D32]/10 px-2 py-0.5 text-[12px] text-[#2E7D32] border border-[#2E7D32]/20">
              <Check className="size-3 stroke-[2.5]" />
              今日已达标
            </span>
          ) : !isTodayWorkday ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C] border border-[#E2E2DF]">
              今日休息
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#D97757]/10 px-2 py-0.5 text-[12px] text-[#D97757] border border-[#D97757]/20">
              <Sparkles className="size-2.5 fill-[#D97757]" />
              今日待履约
            </span>
          )}
        </div>

        {/* 右侧：1~31 号发丝微格打卡带（带自适应滚动与渐隐遮罩） */}
        <div
          ref={containerRef}
          tabIndex={0}
          role="region"
          aria-label={`${monthLabel}每日履约明细微格`}
          className="relative min-w-0 flex-1 overflow-x-auto scrollbar-none [mask-image:linear-gradient(to_right,black_92%,transparent_100%)] focus:outline-none"
        >
          <div className="inline-flex items-center gap-1 py-0.5 pr-4" role="list">
            {cells.map((cell) => {
              const { dateKey, dayNumber, state, isToday, isSelected, title } = cell;
              const isFuture = state === "future";

              // 样式判定
              let cellStyle = "bg-[#FCFCFB] text-[#78716C] border-[#E2E2DF]/60 hover:border-[#78716C]/40";

              if (state === "submitted") {
                cellStyle = "bg-[#2E7D32]/10 text-[#2E7D32] border-[#2E7D32]/25 hover:bg-[#2E7D32]/15";
              } else if (state === "today-pending") {
                cellStyle = "bg-white text-[#D97757] border-2 border-[#D97757] shadow-xs animate-fulfillment-breath";
              } else if (state === "waive") {
                cellStyle = "bg-[#1D4ED8]/[0.08] text-[#1D4ED8] border-[#1D4ED8]/25 hover:bg-[#1D4ED8]/15";
              } else if (state === "leave") {
                cellStyle = "bg-[#1D4ED8]/[0.06] text-[#1D4ED8]/80 border-[#1D4ED8]/20 hover:bg-[#1D4ED8]/10";
              } else if (state === "pending") {
                cellStyle = "bg-[#B45309]/[0.08] text-[#B45309] border-[#B45309]/25 hover:bg-[#B45309]/15";
              } else if (state === "absent") {
                cellStyle = "bg-status-danger/[0.10] text-status-danger border-status-danger/30 hover:bg-status-danger/[0.15]";
              } else if (state === "missing") {
                cellStyle = "bg-[#F1F1F0] text-[#78716C] border-[#E2E2DF] hover:border-[#78716C]/60 hover:text-[#1F1E1D]";
              } else if (state === "rest") {
                cellStyle = "bg-[#F1F1F0]/50 text-[#A8A29E] border-transparent hover:border-[#E2E2DF]";
              } else if (state === "future") {
                cellStyle = "bg-[#FCFCFB] text-[#A8A29E] border-[#E2E2DF]/40 opacity-40 cursor-not-allowed";
              }

              return (
                <button
                  key={dateKey}
                  ref={isToday ? todayCellRef : null}
                  type="button"
                  role="listitem"
                  disabled={isFuture}
                  title={title}
                  aria-label={title}
                  onClick={() => !isFuture && onSelectDate(dateKey)}
                  className={cn(
                    "flex flex-col items-center justify-center h-[26px] min-w-[24px] px-1 rounded-[4px] border text-[12px] tabular-nums font-sans select-none transition-all duration-120",
                    !isFuture && "cursor-pointer active:scale-95",
                    cellStyle,
                    isSelected && "ring-1.5 ring-[#141413] shadow-xs scale-105 z-10",
                  )}
                >
                  <span className="leading-none">{dayNumber}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

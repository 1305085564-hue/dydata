import type { RefObject } from "react";

import { CalendarDays, FilePenLine, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import type { ExemptionDateBuckets } from "@/lib/豁免";
import { cn } from "@/lib/utils";

type VideoSubmitPanelToolbarProps = {
  primaryMode: string;
  isCalendarOpen: boolean;
  setIsCalendarOpen: (open: boolean | ((previous: boolean) => boolean)) => void;
  calendarPopoverRef: RefObject<HTMLDivElement | null>;
  activeBizDate: string;
  today: string;
  submittedDatesIncludingActivity: string[];
  allExemptionDateBuckets: ExemptionDateBuckets;
  localPendingExemptionDates: string[];
  selectBizDate: (date: string) => void;
  setIsExemptionDialogOpen: (open: boolean) => void;
  setIsHistoryOpen: (open: boolean) => void;
};

export function VideoSubmitPanelToolbar({
  primaryMode,
  isCalendarOpen,
  setIsCalendarOpen,
  calendarPopoverRef,
  activeBizDate,
  today,
  submittedDatesIncludingActivity,
  allExemptionDateBuckets,
  localPendingExemptionDates,
  selectBizDate,
  setIsExemptionDialogOpen,
  setIsHistoryOpen,
}: VideoSubmitPanelToolbarProps) {
  return (
    <>
        {/* 新版控制栏：创作立卷 · 表达纪事（裸铺于底层画布，无卡片外框） */}
        <div className="px-0.5 py-1 sm:py-1.5">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
            {/* 左侧：标题和描述 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" />
                <h1 className="font-serif text-[1.75rem] leading-[1.20] font-medium text-[#141413] tracking-tight">
                  创作立卷 · 表达纪事
                </h1>
              </div>
              <p className="text-[13px] text-[#1F1E1D] tracking-normal font-sans leading-relaxed">
                从容记录每一次真实表达 · 数据沉淀与运营复盘
              </p>
            </div>

            {/* 右侧：控制区 */}
            <FilterBar>
              {primaryMode === "backfill" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D97757]/30 bg-[#D97757]/10 px-2.5 py-0.5 text-[12px] font-normal text-[#D97757]">
                  <span className="h-1.5 w-1.5 rounded-full bg-current text-[#D97757]" />
                  正在补交历史数据
                </span>
              )}
            {/* 日期选择 Popover */}
            <div className="relative inline-flex items-center" ref={calendarPopoverRef}>
              <button
                type="button"
                onClick={() => setIsCalendarOpen((prev) => !prev)}
                className={cn(
                  "inline-flex items-center gap-1 sm:gap-2 h-7 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] px-2.5 text-[12px] sm:text-[13px] font-normal text-[#1F1E1D] transition-all hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10 cursor-pointer",
                  isCalendarOpen && "border-[#78716C] bg-[#E4E4E1]"
                )}
                aria-expanded={isCalendarOpen}
                aria-label={`切换填报日期：${activeBizDate}`}
              >
                <CalendarDays className="size-3.5 text-[#78716C]" />
                <span className="tabular-nums">{activeBizDate}</span>
              </button>

              {isCalendarOpen && (
                <div className="absolute left-0 top-full mt-2 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                  <div className="w-[290px] sm:w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#E2E2DF] bg-white p-3.5 sm:p-5 shadow-claude-float ring-1 ring-[#141413]/5">
                    <SubmissionCalendar
                      today={today}
                      submittedDates={submittedDatesIncludingActivity}
                      waiveDates={allExemptionDateBuckets.waiveDates}
                      leaveDates={allExemptionDateBuckets.leaveDates}
                      pendingDates={localPendingExemptionDates}
                      selectedDate={activeBizDate}
                      onDateSelect={(date) => {
                        selectBizDate(date);
                        setIsCalendarOpen(false);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 停笔调养申请按钮 */}
            <Button
              type="button"
              variant="secondary"
              size="m"
              onClick={() => setIsExemptionDialogOpen(true)}
              title="可申请停笔调养；已在审批中的日期会被锁定"
            >
              <FilePenLine className="size-3.5 mr-1 text-[#78716C]" />
              请假/报备
            </Button>

            {/* 历史手稿按钮 */}
            <Button
              type="button"
              variant="secondary"
              size="m"
              onClick={() => setIsHistoryOpen(true)}
            >
              <History className="size-3.5 mr-1 text-[#78716C]" />
              历史记录
            </Button>
          </FilterBar>
          </div>
        </div>

    </>
  );
}

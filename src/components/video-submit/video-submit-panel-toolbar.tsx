import type { RefObject } from "react";

import { CalendarDays, FilePenLine, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { formatHeaderDate, type PanelHeaderStatus } from "@/lib/dashboard-panel-header";
import type { ExemptionDateBuckets } from "@/lib/豁免";
import { cn } from "@/lib/utils";
import { useExitMotion } from "@/hooks/use-exit-motion";

type VideoSubmitPanelToolbarProps = {
  headerStatus: PanelHeaderStatus;
  monthFulfillment: { submittedCount: number; missedCount: number };
  exemptionReason?: string | null;
  isCalendarOpen: boolean;
  setIsCalendarOpen: (open: boolean | ((previous: boolean) => boolean)) => void;
  calendarPopoverRef: RefObject<HTMLDivElement | null>;
  activeBizDate: string;
  today: string;
  submittedDatesIncludingActivity: string[];
  allExemptionDateBuckets: ExemptionDateBuckets;
  localPendingExemptionDates: string[];
  absentDates: string[];
  absentReasons: Record<string, string>;
  selectBizDate: (date: string) => void;
  setIsExemptionDialogOpen: (open: boolean) => void;
  setIsHistoryOpen: (open: boolean) => void;
};

export function VideoSubmitPanelToolbar({
  headerStatus,
  monthFulfillment,
  exemptionReason,
  isCalendarOpen,
  setIsCalendarOpen,
  calendarPopoverRef,
  activeBizDate,
  today,
  submittedDatesIncludingActivity,
  allExemptionDateBuckets,
  localPendingExemptionDates,
  absentDates,
  absentReasons,
  selectBizDate,
  setIsExemptionDialogOpen,
  setIsHistoryOpen,
}: VideoSubmitPanelToolbarProps) {
  const menuMotion = useExitMotion(isCalendarOpen);
  return (
    <>
        {/* 页头：一句话说今天交没交；副行是本月的账，点开看月历（裸铺于底层画布，无卡片外框） */}
        <div className="px-0.5">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
            {/* 左侧：状态句 + 本月履约摘要 */}
            <div className="space-y-1 min-w-0">
              <h1 className="flex items-center gap-2 font-normal font-serif text-[20px] sm:text-[28px] leading-[1.20] text-[#141413] tracking-tight">
                {headerStatus.tone === "done" && (
                  <span className="size-1.5 shrink-0 rounded-full bg-status-success" aria-hidden />
                )}
                <span className="truncate">{headerStatus.text}</span>
              </h1>

              <div className="flex max-w-full flex-wrap items-center gap-x-1 text-[14px] text-[#78716C]">
              <span className="tabular-nums">{formatHeaderDate(activeBizDate)}</span>
              <span aria-hidden>·</span>
              <div className="relative inline-flex max-w-full items-center" ref={calendarPopoverRef}>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-[14px] text-[#1F1E1D] tracking-normal font-sans leading-relaxed transition hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10 cursor-pointer",
                    isCalendarOpen && "bg-[#EBEBE9] border-[#78716C]",
                  )}
                  aria-expanded={isCalendarOpen}
                  aria-label={`本月已交 ${monthFulfillment.submittedCount} 天，漏 ${monthFulfillment.missedCount} 天；点开看月历并切换填报日期`}
                >
                  <span className="truncate">
                    本月已交 {monthFulfillment.submittedCount} 天，漏 {monthFulfillment.missedCount} 天
                  </span>
                  {exemptionReason && (
                    <span className="truncate text-[#78716C]">· 请假：{exemptionReason}</span>
                  )}
                  <CalendarDays className="size-3.5 shrink-0 text-[#78716C]" />
                </button>

                {menuMotion.shown && (
                  <div
                    {...menuMotion.exitProps}
                    className={cn(
                      menuMotion.closing ? "animate-out fade-out zoom-out-95 slide-out-to-top-2 pointer-events-none" : "animate-in fade-in zoom-in-95 slide-in-from-top-2",
                      "absolute left-0 top-full mt-2 z-50 origin-top-left duration-150",
                    )}
                  >
                    <div className="w-[290px] sm:w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#E2E2DF] bg-white p-3.5 sm:p-5 shadow-claude-float ring-1 ring-[#141413]/5">
                      <SubmissionCalendar
                        today={today}
                        submittedDates={submittedDatesIncludingActivity}
                        waiveDates={allExemptionDateBuckets.waiveDates}
                        leaveDates={allExemptionDateBuckets.leaveDates}
                        pendingDates={localPendingExemptionDates}
                        absentDates={absentDates}
                        absentReasons={absentReasons}
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
              </div>
            </div>

            {/* 右侧：仅留两个入口 */}
            <FilterBar>
              {/* 停笔调养申请按钮 */}
              <Button
                type="button"
                variant="ghost"
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
                variant="ghost"
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

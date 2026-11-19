"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { FilterBar } from "./components/filter-bar";
import { FulfillmentActionDock } from "./components/fulfillment-action-dock";
import { FulfillmentMatrixRoster } from "./components/fulfillment-matrix-roster";
import { FulfillmentMemberSheet } from "./components/fulfillment-member-sheet";
import type { FulfillmentWorkbenchState } from "./fulfillment-workbench-state";
import { buildFulfillmentHeadline, buildTodayLine, pendingAppealsOf } from "./fulfillment-page-view";

interface FulfillmentWorkbenchViewProps {
  state: FulfillmentWorkbenchState;
  actions: {
    handleFeishuChange: (checked: boolean) => void | Promise<void>;
    handleHandleAppeal: (appealId: string, decision: "approve" | "reject", reason?: string) => Promise<void>;
    handleReviewPendingExemption: (requestId: string, action: "approved" | "rejected") => Promise<void>;
    handleActionComplete: () => void;
    handleQuickMarkCell: (userId: string, date: string, action: "confirmed_published" | "leave" | "waived" | "absent") => Promise<void>;
    handleClearManualOverrideCell?: (userId: string, date: string) => Promise<void>;
    handleQuickMark: (userId: string, status: "confirmed_published" | "leave" | "waived" | "absent") => Promise<void>;
    handleBatchMark: (userIds: string[], status: "confirmed_published" | "leave" | "waived" | "absent", reason: string) => Promise<void>;
  };
  canManage: boolean;
}

const ICON_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:pointer-events-none disabled:opacity-40";

const EMPTY_TEXT = {
  all: "这个月还没有需要发布的成员",
  behind: "没有落后的人",
  missing: "没有连续断更的人",
} as const;

/**
 * 发布管理：一页一问「这个月谁在掉队，今天还有什么要我处理？」
 * 从上到下 = 判断顺序：页头（这个月整体，‹ › 翻月）→ 今天一行（有事可点开处理）→ 分段与团队 → 全员月历大表。
 */
export function FulfillmentWorkbenchView({ state, actions, canManage }: FulfillmentWorkbenchViewProps) {
  const {
    today,
    calendarData,
    isLoadingCalendar,
    feishuEnabled,
    settingsLoading,
    settingsError,
    isUpdatingSettings,
    appeals,
    selectedTeam,
    selectedIds,
    segment,
    segmentCounts,
    sortDir,
    setSortDir,
    sheetOpen,
    selectedMember,
    selectedDate,
    source,
    filteredMembers,
    rosterMembers,
    exceptionMembers,
    pendingLeaves,
    stats,
    loadSettings,
    handleTeamChange,
    handleSegmentChange,
    handleSelectToggle,
    handleSelectAll,
    handleQueueMemberClick,
    handleMatrixCellClick,
    loadCalendar,
    setSheetOpen,
  } = state;
  const [todayOpen, setTodayOpen] = useState(false);

  const { year, month } = calendarData;
  const isCurrentMonth = today.slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`;
  const isFutureMonth = `${year}-${String(month).padStart(2, "0")}` >= today.slice(0, 7);
  const headline = buildFulfillmentHeadline({ month, stats });
  const pendingAppeals = canManage ? pendingAppealsOf(appeals) : [];
  const todayLine = buildTodayLine({
    isCurrentMonth,
    unconfirmedToday: isCurrentMonth ? exceptionMembers.length : 0,
    pendingAppeals: pendingAppeals.length,
    pendingLeaves: canManage ? pendingLeaves.length : 0,
  });
  const canOpenToday = canManage && todayLine.hasWork;
  const panelOpen = canOpenToday && todayOpen;

  const stepMonth = (delta: -1 | 1) => {
    const target = new Date(year, month - 1 + delta, 1);
    void loadCalendar(target.getFullYear(), target.getMonth() + 1);
  };
  const backToCurrentMonth = () => {
    void loadCalendar(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1
            aria-live="polite"
            className="font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413] tabular-nums"
          >
            {headline}
          </h1>
          <div className="flex items-center gap-0.5">
            <button type="button" aria-label="上个月" className={ICON_BUTTON} disabled={isLoadingCalendar} onClick={() => stepMonth(-1)}>
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="下个月"
              className={ICON_BUTTON}
              disabled={isLoadingCalendar || isFutureMonth}
              onClick={() => stepMonth(1)}
            >
              <ChevronRight className="size-4" />
            </button>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={backToCurrentMonth}
                disabled={isLoadingCalendar}
                className="ml-1 h-8 rounded-md px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
              >
                回到本月
              </button>
            )}
            {isLoadingCalendar && (
              <span role="status" className="ml-2 text-[12px] text-[#78716C]">
                正在加载…
              </span>
            )}
          </div>
        </div>

        {canOpenToday ? (
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls="fulfillment-today-panel"
            onClick={() => setTodayOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-md text-[14px] text-[#1F1E1D] hover:text-[#141413]"
          >
            {todayLine.text}
            <span className="ml-1 inline-flex items-center gap-0.5 text-[#78716C]">
              {panelOpen ? "收起" : "处理"}
              {panelOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </span>
          </button>
        ) : (
          <p className={cn("text-[14px]", todayLine.hasWork ? "text-[#1F1E1D]" : "text-[#78716C]")}>{todayLine.text}</p>
        )}
      </header>

      {panelOpen && (
        <FulfillmentActionDock
          members={isCurrentMonth ? exceptionMembers : []}
          selectedIds={selectedIds}
          onSelectToggle={handleSelectToggle}
          onSelectAll={handleSelectAll}
          onQuickMark={actions.handleQuickMark}
          onBatchMark={actions.handleBatchMark}
          onMemberClick={handleQueueMemberClick}
          appeals={appeals}
          onHandleAppeal={actions.handleHandleAppeal}
          pendingLeaves={pendingLeaves}
          onReviewPendingExemption={actions.handleReviewPendingExemption}
        />
      )}

      <FilterBar
        members={calendarData.members}
        segment={segment}
        segmentCounts={segmentCounts}
        onSegmentChange={handleSegmentChange}
        selectedTeam={selectedTeam}
        onTeamChange={handleTeamChange}
        feishuEnabled={feishuEnabled}
        settingsLoading={settingsLoading}
        settingsError={settingsError}
        isUpdatingSettings={isUpdatingSettings}
        onRetrySettings={() => void loadSettings()}
        onFeishuChange={actions.handleFeishuChange}
      />

      <FulfillmentMatrixRoster
        year={year}
        month={month}
        members={rosterMembers}
        today={today}
        onCellClick={handleMatrixCellClick}
        appeals={appeals}
        onQuickMarkCell={canManage ? actions.handleQuickMarkCell : undefined}
        onClearManualOverride={canManage ? actions.handleClearManualOverrideCell : undefined}
        onReviewPendingExemption={canManage ? actions.handleReviewPendingExemption : undefined}
        sortDir={sortDir}
        onSortDirChange={segment === "missing" ? undefined : setSortDir}
        isLoading={isLoadingCalendar}
        emptyText={filteredMembers.length === 0 ? EMPTY_TEXT.all : EMPTY_TEXT[segment]}
      />

      <FulfillmentMemberSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        member={selectedMember}
        date={selectedDate}
        source={source}
        onActionComplete={actions.handleActionComplete}
        appeals={appeals}
        readOnly={!canManage}
      />
    </div>
  );
}

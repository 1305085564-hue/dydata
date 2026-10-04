"use client";

import { Card } from "@/components/ui/card";
import { FilterBar } from "./components/filter-bar";
import {
  FulfillmentStatsOverview,
} from "./components/fulfillment-stats-overview";
import { FulfillmentActionDock } from "./components/fulfillment-action-dock";
import { FulfillmentMatrixRoster } from "./components/fulfillment-matrix-roster";
import { FulfillmentMemberSheet } from "./components/fulfillment-member-sheet";
import type { TimeRangePreset } from "@/types/fulfillment";
import type { FulfillmentWorkbenchState } from "./fulfillment-workbench-state";

interface FulfillmentWorkbenchViewProps {
  state: FulfillmentWorkbenchState;
  actions: {
    handleFeishuChange: (checked: boolean) => void | Promise<void>;
    handleHandleAppeal: (appealId: string, decision: "approve" | "reject", reason?: string) => Promise<void>;
    handleReviewPendingExemption: (requestId: string, action: "approved" | "rejected") => Promise<void>;
    handleActionComplete: () => void;
    handleQuickMarkCell: (userId: string, date: string, action: "confirmed_published" | "leave" | "waived" | "absent") => Promise<void>;
    handleQuickMark: (userId: string, status: "confirmed_published" | "leave" | "waived" | "absent") => Promise<void>;
    handleBatchMark: (userIds: string[], status: "confirmed_published" | "leave" | "waived" | "absent", reason: string) => Promise<void>;
  };
  initialView: "todo" | "matrix";
  canManage: boolean;
}

export function FulfillmentWorkbenchView({
  state,
  actions,
  initialView,
  canManage,
}: FulfillmentWorkbenchViewProps) {
  const {
    today,
    calendarData,
    range,
    isLoadingCalendar,
    feishuEnabled,
    settingsLoading,
    settingsError,
    isUpdatingSettings,
    appeals,
    selectedTeam,
    selectedIds,
    statsFilterMode,
    sheetOpen,
    selectedMember,
    selectedDate,
    source,
    filteredMembers,
    exceptionMembers,
    pendingActionableCount,
    stats,
    loadSettings,
    handleTeamChange,
    handleStatsFilterChange,
    handleSelectToggle,
    handleSelectAll,
    handleQueueMemberClick,
    handleMatrixCellClick,
    loadCalendar,
    setSheetOpen,
  } = state;

  const handlePresetChange = (
    targetPreset: TimeRangePreset,
    targetYear: number,
    targetMonth: number,
  ) => {
    state.setRange(targetPreset);
    void loadCalendar(targetYear, targetMonth, targetPreset);
  };

  const handleMonthChange = (targetYear: number, targetMonth: number) => {
    void loadCalendar(targetYear, targetMonth, range);
  };

  return (
    <div className="space-y-6">
      {/* 单行工具栏：时间预设 + 团队筛选 + 飞书开关 */}
      <FilterBar
        year={calendarData.year}
        month={calendarData.month}
        range={range}
        members={calendarData.members}
        selectedTeam={selectedTeam}
        onTeamChange={handleTeamChange}
        onPresetChange={handlePresetChange}
        feishuEnabled={feishuEnabled}
        settingsLoading={settingsLoading}
        settingsError={settingsError}
        isUpdatingSettings={isUpdatingSettings}
        onRetrySettings={() => void loadSettings()}
        onFeishuChange={actions.handleFeishuChange}
      />

      {/* 顶层战报大盘 */}
      <FulfillmentStatsOverview
        stats={stats}
        activeFilter={statsFilterMode}
        onFilterChange={handleStatsFilterChange}
        pendingCount={pendingActionableCount}
      />

      {/* 异常待办行动港（可折叠轻量提示 / 展开批量处理与申诉裁决） */}
      {canManage && <FulfillmentActionDock
        members={exceptionMembers}
        today={today}
        selectedIds={selectedIds}
        onSelectToggle={handleSelectToggle}
        onSelectAll={handleSelectAll}
        onQuickMark={actions.handleQuickMark}
        onBatchMark={actions.handleBatchMark}
        onMemberClick={handleQueueMemberClick}
        appeals={appeals}
        onHandleAppeal={actions.handleHandleAppeal}
        isFiltered={statsFilterMode !== "all"}
        onClearFilter={() => handleStatsFilterChange("all")}
        defaultExpanded={initialView === "todo"}
      />}

      {/* 月度矩阵全景大盘 */}
      <section className="space-y-4">
        {isLoadingCalendar ? (
          <Card className="flex items-center justify-center py-16 gap-0">
            <span className="size-4 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent mr-2.5" />
            <span className="text-[13px] font-normal text-[#78716C]">
              正在刷新日历数据...
            </span>
          </Card>
        ) : (
          <FulfillmentMatrixRoster
            year={calendarData.year}
            month={calendarData.month}
            members={filteredMembers}
            today={today}
            onCellClick={handleMatrixCellClick}
            onMonthChange={handleMonthChange}
            appeals={appeals}
            onQuickMarkCell={canManage ? actions.handleQuickMarkCell : undefined}
            onReviewPendingExemption={canManage ? actions.handleReviewPendingExemption : undefined}
            range={range}
          />
        )}
      </section>

      {/* 成员全月履约足迹与改判抽屉 */}
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

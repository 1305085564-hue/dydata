"use client";

import { useMemo } from "react";
import { Settings, TrendingUp } from "lucide-react";
import { HealthBar } from "./health-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import type { OperatorRow, StaffRow, SummaryData, TalentRow, WorkGroupViews } from "./types";
import type { WriterCandidateRow } from "./writer-tab";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";

interface CollaborationWorkbenchToolbarProps {
  year: number; month: number;
  monthOptions: Array<{ year: number; month: number; label: string; value: string }>;
  currentMonthValue: string;
  view: "roles" | "teams"; tab: TabKey; summary: SummaryData | null;
  isOwnerOrTeamAdmin: boolean; loadFailed: boolean; canManageWorkGroups: boolean; hasActiveGroupDetail: boolean;
  resolvedWorkGroupViews?: WorkGroupViews;
  talents: TalentRow[]; operators: OperatorRow[]; writerStaff: StaffRow[]; writerCandidates?: WriterCandidateRow[]; editorStaff: StaffRow[];
  onMonthChange: (val: string | null) => void;
  onViewChange: (view: "roles" | "teams") => void; onTabChange: (tab: TabKey) => void; onOpenManageDrawer: (groupId?: string | null) => void; onLeaderboardOpen: (open: boolean) => void;
}

export function CollaborationWorkbenchToolbar({
  year, month, monthOptions, currentMonthValue, view, tab, summary, isOwnerOrTeamAdmin, loadFailed, canManageWorkGroups, hasActiveGroupDetail, resolvedWorkGroupViews, talents, operators, writerStaff, writerCandidates = [], editorStaff, onMonthChange, onViewChange, onTabChange, onOpenManageDrawer, onLeaderboardOpen,
}: CollaborationWorkbenchToolbarProps) {

  const writerCount = useMemo(() => {
    if (!writerCandidates || writerCandidates.length === 0) {
      return writerStaff.length;
    }
    const existingIds = new Set(writerStaff.map((w) => w.userId));
    let supplemental = 0;
    for (const candidate of writerCandidates) {
      if (!existingIds.has(candidate.userId)) {
        supplemental++;
      }
    }
    return writerStaff.length + supplemental;
  }, [writerStaff, writerCandidates]);
  return (
    <div className="space-y-3 pb-3 border-b border-[#E2E2DF]/60">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* 月份选择 */}
          <div className="flex shrink-0 items-center gap-1">
            <div className="w-fit">
              <Select value={currentMonthValue} onValueChange={onMonthChange}>
                <SelectTrigger className="h-7 text-[14px] bg-transparent border-0 shadow-none font-normal hover:bg-[#EBEBE9] transition-colors focus-visible:ring-2 focus-visible:ring-[#1F1E1D]/10 outline-none cursor-pointer">
                  <SelectValue placeholder="选择月份" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-[14px]">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 一级视图切换：岗位协作管理 ↔ 小组协作管理 */}
          <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              onClick={() => onViewChange("roles")}
              className={`h-7 px-3 text-[14px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                view === "roles"
                  ? "bg-white text-[#141413] border border-[#E2E2DF] shadow-input"
                  : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
              }`}
            >
              岗位协作管理
            </button>
            <button
              type="button"
              onClick={() => onViewChange("teams")}
              className={`h-7 px-3 text-[14px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                view === "teams"
                  ? "bg-white text-[#141413] border border-[#E2E2DF] shadow-input"
                  : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
              }`}
            >
              小组协作管理 {resolvedWorkGroupViews?.groups && resolvedWorkGroupViews.groups.length > 0 ? `(${resolvedWorkGroupViews.groups.length})` : ""}
            </button>
          </div>

          {/* 岗位四页签（仅在按岗位视图展示，与一级视图无缝并排） */}
          {view === "roles" && (
            <>
              <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onTabChange("talents")}
                  className={`h-7 px-2.5 sm:px-3 text-[14px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
                    tab === "talents"
                      ? "bg-[#F1F1F0] text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                  }`}
                >
                  达人 ({talents.length})
                </button>

                <button
                  type="button"
                  onClick={() => onTabChange("operators")}
                  className={`h-7 px-2.5 sm:px-3 text-[14px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
                    tab === "operators"
                      ? "bg-[#F1F1F0] text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                  }`}
                >
                  运营 ({operators.length})
                </button>

                <button
                  type="button"
                  onClick={() => onTabChange("writers")}
                  title="含已认证但本月还没有产出的文案（另三个页签只计当月有产出者）"
                  className={`h-7 px-2.5 sm:px-3 text-[14px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
                    tab === "writers"
                      ? "bg-[#F1F1F0] text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                  }`}
                >
                  文案 ({writerCount})
                </button>

                <button
                  type="button"
                  onClick={() => onTabChange("editors")}
                  className={`h-7 px-2.5 sm:px-3 text-[14px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
                    tab === "editors"
                      ? "bg-[#F1F1F0] text-[#141413] shadow-input"
                      : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                  }`}
                >
                  剪辑 ({editorStaff.length})
                </button>
              </div>
            </>
          )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <HealthBar
            summary={summary}
            year={year}
            month={month}
            canEdit={isOwnerOrTeamAdmin}
          />
          {view === "teams" && !hasActiveGroupDetail && canManageWorkGroups && (
            <button
              type="button"
              onClick={() => onOpenManageDrawer(null)}
              className="h-7 px-3 rounded-md bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] text-[#1F1E1D] text-[14px] font-normal shadow-input transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1"
            >
              <Settings className="size-3.5 text-[#78716C]" />
              管理小队
            </button>
          )}
          <button
            type="button"
            onClick={() => onLeaderboardOpen(true)}
            className="h-7 px-2.5 sm:px-3 rounded-md hover:bg-[#EBEBE9] text-[#1F1E1D] text-[14px] font-normal transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#1F1E1D]"
          >
            <TrendingUp className="size-3.5 text-[#D97757]" />
            账号排行
          </button>
        </div>
      </div>
      {loadFailed && (
        <Alert variant="error">
          <span className="font-normal text-[#1F1E1D]">数据加载稍有阻滞</span>
          <span className="text-[#78716C]">· 当前展示为空，请刷新重试</span>
        </Alert>
      )}
    </div>
  );
}

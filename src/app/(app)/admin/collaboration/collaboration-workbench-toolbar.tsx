"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Settings, TrendingUp } from "lucide-react";
import { HealthBar } from "./health-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import type { OperatorRow, StaffRow, SummaryData, TalentRow, WorkGroupViews } from "./types";
import type { WriterCandidateRow } from "./writer-tab";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";

interface CollaborationWorkbenchToolbarProps {
  year: number; month: number;
  monthOptions: Array<{ year: number; month: number; label: string; value: string }>;
  currentMonthValue: string; isCurrentMonth: boolean;
  view: "roles" | "teams"; tab: TabKey; summary: SummaryData | null;
  isOwnerOrTeamAdmin: boolean; loadFailed: boolean; canManageWorkGroups: boolean; hasActiveGroupDetail: boolean;
  resolvedWorkGroupViews?: WorkGroupViews;
  talents: TalentRow[]; operators: OperatorRow[]; writerStaff: StaffRow[]; writerCandidates?: WriterCandidateRow[]; editorStaff: StaffRow[];
  onPrevMonth: () => void; onNextMonth: () => void; onMonthChange: (val: string | null) => void;
  onViewChange: (view: "roles" | "teams") => void; onTabChange: (tab: TabKey) => void; onOpenManageDrawer: (groupId?: string | null) => void; onLeaderboardOpen: (open: boolean) => void;
}

export function CollaborationWorkbenchToolbar({
  year, month, monthOptions, currentMonthValue, isCurrentMonth, view, tab, summary, isOwnerOrTeamAdmin, loadFailed, canManageWorkGroups, hasActiveGroupDetail, resolvedWorkGroupViews, talents, operators, writerStaff, writerCandidates = [], editorStaff, onPrevMonth, onNextMonth, onMonthChange, onViewChange, onTabChange, onOpenManageDrawer, onLeaderboardOpen,
}: CollaborationWorkbenchToolbarProps) {
  const isStartMonth = year < 2026 || (year === 2026 && month <= 7);

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
    <div className="space-y-6">

        {/* 整合型流线控制舱：精炼双层架构 */}
        <div className="space-y-3 pb-3 border-b border-[#E2E2DF]/60">
          {/* 控制舱顶栏：月份快捷翻页与岗位健康度 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* 快捷翻月控制组 */}
              <div className="flex items-center gap-1 bg-white rounded-md p-0.5 border border-[#E2E2DF] shadow-input">
                {isStartMonth ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      aria-disabled="true"
                      aria-label="上一月"
                      className="size-7 rounded-md flex items-center justify-center text-[#A8A29E] cursor-not-allowed opacity-50 select-none"
                    >
                      <ChevronLeft className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent className="text-[12px]">
                      统计起点 2026-07
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    onClick={onPrevMonth}
                    aria-label="上一月"
                    title="上一月 (快捷键 ←)"
                    className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                )}
                <div className="w-32 sm:w-36">
                  <Select value={currentMonthValue} onValueChange={onMonthChange}>
                    <SelectTrigger className="h-7 text-[13px] bg-transparent border-0 shadow-none font-normal hover:bg-[#EBEBE9] transition-colors focus-visible:ring-0 outline-none cursor-pointer">
                      <SelectValue placeholder="选择月份" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isCurrentMonth ? (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      aria-disabled="true"
                      aria-label="下一月"
                      className="size-7 rounded-md flex items-center justify-center text-[#A8A29E] cursor-not-allowed opacity-50 select-none"
                    >
                      <ChevronRight className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent className="text-[12px]">
                      已是当前月份
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    onClick={onNextMonth}
                    aria-label="下一月"
                    title="下一月 (快捷键 →)"
                    className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                )}
              </div>
            </div>

            {/* 右侧：健康度极轻静默芯片 */}
            <HealthBar
              summary={summary}
              year={year}
              month={month}
              canEdit={isOwnerOrTeamAdmin}
            />
          </div>

          {loadFailed && (
            <Alert variant="error">
              <span className="font-normal text-[#1F1E1D]">数据加载稍有阻滞</span>
              <span className="text-[#78716C]">· 当前展示为空，请刷新重试</span>
            </Alert>
          )}

          {/* 控制舱底栏：视图与岗位维度无缝切换 */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* 一级视图切换：岗位数据管理 ↔ 小组数据管理 */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onViewChange("roles")}
                  className={`h-7 px-3 text-[13px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                    view === "roles"
                      ? "bg-white text-[#141413] border border-[#E2E2DF] shadow-input"
                      : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                  }`}
                >
                  岗位数据管理
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("teams")}
                  className={`h-7 px-3 text-[13px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] ${
                    view === "teams"
                      ? "bg-white text-[#141413] border border-[#E2E2DF] shadow-input"
                      : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                  }`}
                >
                  小组数据管理 {resolvedWorkGroupViews?.groups && resolvedWorkGroupViews.groups.length > 0 ? `(${resolvedWorkGroupViews.groups.length})` : ""}
                </button>
              </div>

              {/* 岗位四页签（仅在按岗位视图展示，与一级视图无缝并排） */}
              {view === "roles" && (
                <>
                  <div className="h-4 w-px bg-[#E2E2DF] mx-0.5 hidden sm:block" />
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTabChange("talents")}
                      className={`h-7 px-2.5 sm:px-3 text-[13px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
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
                      className={`h-7 px-2.5 sm:px-3 text-[13px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
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
                      title="含已认证但本月暂无产出的文案（另三个页签只计当月有产出者）"
                      className={`h-7 px-2.5 sm:px-3 text-[13px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
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
                      className={`h-7 px-2.5 sm:px-3 text-[13px] font-normal rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
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
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onLeaderboardOpen(true)}
                className="h-7 px-2.5 sm:px-3 rounded-md bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] text-[#1F1E1D] text-[13px] font-normal shadow-input transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1"
              >
                <TrendingUp className="size-3.5 text-[#D97757]" />
                账号排行
              </button>

              {view === "teams" && !hasActiveGroupDetail && canManageWorkGroups && (
                <button
                  type="button"
                  onClick={() => onOpenManageDrawer(null)}
                  className="h-7 px-3 rounded-md bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] text-[#1F1E1D] text-[13px] font-normal shadow-input transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1"
                >
                  <Settings className="size-3.5 text-[#78716C]" />
                  管理小队
                </button>
              )}
            </div>
          </div>
        </div>


    </div>
  );
}

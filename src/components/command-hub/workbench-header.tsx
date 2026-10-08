"use client";

import { RefreshCw, X, ClipboardCheck } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/ui/section-heading";
import { getCommandHubTitle } from "@/lib/command-hub/domain/view-rules";
import type { CommandHubTab } from "@/lib/command-hub/types";
import type { ExemptionRequest } from "@/lib/exemption-approvals";

export function WorkbenchHeader({
  activeTab,
  onTabChange,
  isAdmin,
  approvalTabCount,
  todoTabCount,
  historyApprovals,
  summaryLoading,
  approvalsLoading,
  onRefreshSummary,
  onOpenChange,
}: {
  activeTab: CommandHubTab;
  onTabChange: (tab: CommandHubTab) => void;
  isAdmin: boolean;
  approvalTabCount: number;
  todoTabCount: number;
  historyApprovals: ExemptionRequest[];
  summaryLoading: boolean;
  approvalsLoading: boolean;
  onRefreshSummary?: () => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
{/* Top Navigation & Workspace Header */}
<div className="shrink-0 border-b border-[#E2E2DF]/60 bg-white px-5 sm:px-6 pt-4 pb-3.5">
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <ClipboardCheck className="size-4 text-[#78716C] stroke-[1.8] shrink-0" />
      <div>
        <SectionHeading as="h3" className="tracking-tight">
          {getCommandHubTitle(isAdmin)}
        </SectionHeading>
      </div>
    </div>

    {/* Header Actions: Refresh & Close */}
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void onRefreshSummary?.()}
        disabled={summaryLoading || !onRefreshSummary}
        aria-label="刷新数据"
        title="刷新数据"
        className="flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors disabled:opacity-40 cursor-pointer"
      >
        <RefreshCw className={cn("size-3.5", (summaryLoading || approvalsLoading) && "animate-spin")} />
      </button>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        aria-label="关闭工作台"
        className="flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer"
      >
        <X className="size-4" />
      </button>
    </div>
  </div>

  {/* Navigation Tabs (待审批 vs 待办 vs 已处理) */}
  <div className="mt-3.5 flex items-center justify-between gap-2">
    <div className="flex items-center gap-1 rounded-md bg-[#F1F1F0] p-1">
      {isAdmin && (
        <button
          type="button"
          onClick={() => onTabChange("approvals")}
          className={cn(
            "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 z-10 select-none cursor-pointer",
            activeTab === "approvals"
              ? "text-[#141413] font-normal"
              : "text-[#78716C] hover:text-[#1F1E1D]",
          )}
        >
          {activeTab === "approvals" && (
            <motion.div
              layoutId="workbenchTabIndicator"
              className="absolute inset-0 rounded-md bg-white shadow-input border border-[#E2E2DF]/60 -z-10"
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            />
          )}
          <span>待审批申请</span>
          {approvalTabCount > 0 && (
            <span
              className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[12px] font-normal tabular-nums",
                activeTab === "approvals"
                  ? "bg-[#E4E4E1] text-[#141413] font-normal"
                  : "bg-[#F1F1F0] text-[#78716C]",
              )}
            >
              {approvalTabCount > 99 ? "99+" : approvalTabCount}
            </span>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={() => onTabChange("todos")}
        className={cn(
          "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 z-10 select-none cursor-pointer",
          activeTab === "todos"
            ? "text-[#141413] font-normal"
            : "text-[#78716C] hover:text-[#1F1E1D]",
        )}
      >
        {activeTab === "todos" && (
          <motion.div
            layoutId="workbenchTabIndicator"
            className="absolute inset-0 rounded-md bg-white shadow-input border border-[#E2E2DF]/60 -z-10"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}
        <span>团队待办</span>
        {todoTabCount > 0 && (
          <span
            className={cn(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[12px] font-normal tabular-nums",
              activeTab === "todos"
                ? "bg-[#E4E4E1] text-[#141413] font-normal"
                : "bg-[#F1F1F0] text-[#78716C]",
            )}
          >
            {todoTabCount > 99 ? "99+" : todoTabCount}
          </span>
        )}
      </button>

      {isAdmin && (
        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={cn(
            "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 z-10 select-none cursor-pointer",
            activeTab === "history"
              ? "text-[#141413] font-normal"
              : "text-[#78716C] hover:text-[#1F1E1D]",
          )}
        >
          {activeTab === "history" && (
            <motion.div
              layoutId="workbenchTabIndicator"
              className="absolute inset-0 rounded-md bg-white shadow-input border border-[#E2E2DF]/60 -z-10"
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            />
          )}
          <span>已处理记录</span>
                      {historyApprovals.length > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#78716C] tabular-nums">
                          {historyApprovals.length}
            </span>
          )}
        </button>
      )}
    </div>
  </div>
</div>
    </>
  );
}

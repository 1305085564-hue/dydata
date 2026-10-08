"use client";

import { RefreshCw, X, ClipboardCheck, Clock } from "lucide-react";
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
  const totalPendingCount = isAdmin
    ? approvalTabCount + todoTabCount
    : todoTabCount;

  return (
    <div className="shrink-0 border-b border-[#E2E2DF]/60 bg-white px-5 sm:px-6 py-3.5">
      <div className="flex items-center justify-between gap-3">
        {/* Title & Total Pending Badge */}
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-[#78716C] stroke-[1.8] shrink-0" />
          <SectionHeading as="h3" className="tracking-tight whitespace-nowrap">
            {getCommandHubTitle(isAdmin)}
          </SectionHeading>
          {totalPendingCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-[#F1F1F0] text-[#78716C] text-[11px] font-mono tabular-nums whitespace-nowrap">
              {totalPendingCount > 99 ? "99+" : totalPendingCount}
            </span>
          )}
        </div>

        {/* Header Actions: History + Refresh + Close */}
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button
              type="button"
              onClick={() => onTabChange(activeTab === "history" ? "approvals" : "history")}
              aria-label={activeTab === "history" ? "返回待处理工作台" : "查看已处理记录"}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] transition-colors border cursor-pointer",
                activeTab === "history"
                  ? "bg-[#141413] text-white border-transparent"
                  : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] border-[#E2E2DF]/60",
              )}
            >
              <Clock className="size-3.5" />
              <span>已处理记录</span>
              {historyApprovals.length > 0 && (
                <span
                  className={cn(
                    "text-[11px] tabular-nums font-mono ml-0.5",
                    activeTab === "history" ? "text-white/80" : "text-[#A8A29E]",
                  )}
                >
                  {historyApprovals.length}
                </span>
              )}
            </button>
          )}

          {isAdmin && <div className="h-3.5 w-[1px] bg-[#E2E2DF]/60 mx-0.5" />}

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
    </div>
  );
}

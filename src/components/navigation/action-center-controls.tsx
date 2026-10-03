"use client";

import dynamic from "next/dynamic";
import { Bell } from "lucide-react";
import type { ActionCenterSummary } from "@/lib/action-center/types";
import { cn } from "@/lib/utils";

const UnifiedCommandHub = dynamic(
  () => import("@/components/unified-command-hub").then((module) => module.UnifiedCommandHub),
  { ssr: false },
);

type ActionCenterTab = "todos" | "approvals" | "history";

interface ActionCenterControlsProps {
  open: boolean;
  commandHubLoaded: boolean;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  activeTab: ActionCenterTab;
  onTabChange: (tab: ActionCenterTab) => void;
  isAdmin: boolean;
  summary: ActionCenterSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  onRefreshSummary: () => Promise<ActionCenterSummary | null>;
  onActionCenterChanged: () => void;
}

export function ActionCenterControls({
  open,
  commandHubLoaded,
  onOpen,
  onOpenChange,
  activeTab,
  onTabChange,
  isAdmin,
  summary,
  summaryLoading,
  summaryError,
  onRefreshSummary,
  onActionCenterChanged,
}: ActionCenterControlsProps) {
  const bellBadgeCount = summary?.todoCount ?? 0;
  return (
    <>
      <div className="relative group">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "relative flex h-8 w-8 cursor-pointer select-none items-center justify-center rounded-md outline-none transition-all duration-150 group focus-visible:ring-2 focus-visible:ring-status-info/20 active:scale-[0.99] active:duration-120",
            open
              ? "bg-[#F1F1F0] text-[#141413] shadow-input"
              : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
          )}
          title="行动中枢：待办、审批与风险"
          aria-label="行动中枢：待办、审批与风险"
        >
          <Bell className={cn("size-4 stroke-[1.8] transition-transform duration-200 ease-out group-hover:rotate-6 group-hover:scale-105", open ? "text-[#141413]" : "text-[#78716C] group-hover:text-[#141413]")} />
          {bellBadgeCount > 0 && (
            <span className="absolute -right-1 -top-1 select-none text-[12px] font-normal leading-none tabular-nums text-[#78716C]">
              {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
            </span>
          )}
        </button>
      </div>
      {commandHubLoaded && (
        <UnifiedCommandHub
          open={open}
          onOpenChange={onOpenChange}
          activeTab={activeTab}
          onTabChange={onTabChange}
          isAdmin={isAdmin}
          summary={summary}
          summaryLoading={summaryLoading}
          summaryError={summaryError}
          onRefreshSummary={onRefreshSummary}
          onActionCenterChanged={onActionCenterChanged}
        />
      )}
    </>
  );
}

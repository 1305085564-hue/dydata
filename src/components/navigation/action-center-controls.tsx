"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import type { ActionCenterSummary } from "@/lib/action-center/types";
import { cn } from "@/lib/utils";

const ApprovalWorkbench = dynamic(
  () => import("@/components/approval-workbench/approval-workbench").then((module) => module.ApprovalWorkbench),
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
  const todoCount = summary?.todoCount ?? 0;
  const countLabel = todoCount > 99 ? "99+" : String(todoCount);
  // 「有没有事等我」是外框唯一的答案：直接写字「待办 3」，不让人先认铃铛再找角标。
  // 有事深字，没事浅字；位置不动，只换墨色。行动中枢面板本身不在这里改。
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        aria-label={`待办${todoCount > 0 ? ` ${countLabel} 项` : ""}：打开行动中枢（待办、审批与风险）`}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md px-2 text-[14px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-status-info/20",
          open
            ? "bg-[#F1F1F0] text-[#141413]"
            : todoCount > 0
              ? "text-[#141413] hover:bg-[#EBEBE9]"
              : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
        )}
      >
        待办
        {todoCount > 0 && <span className="tabular-nums">{countLabel}</span>}
      </button>
      {/* 行动中枢必须挂到 body：顶栏在手机上整体隐藏（display:none），留在顶栏里手机抽屉就打不开它；
          旧顶栏的毛玻璃还曾给 position:fixed 建包含块，把面板定位到屏幕外（实测 top ≈ -329px）。 */}
      {commandHubLoaded &&
        typeof document !== "undefined" &&
        createPortal(
          <ApprovalWorkbench
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
          />,
          document.body,
        )}
    </>
  );
}

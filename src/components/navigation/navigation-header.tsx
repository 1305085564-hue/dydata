"use client";

import Link from "next/link";
import type { ActionCenterSummary } from "@/lib/action-center/types";
import { UserWorkspacePopover } from "@/components/user-workspace-popover";
import { DesktopNavMenu } from "@/components/navigation/desktop-nav-menu";
import { ActionCenterControls } from "@/components/navigation/action-center-controls";
import type { NavGroup } from "@/lib/navigation/domain/navigation";

type ActionCenterTab = "todos" | "approvals" | "history";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

interface NavigationHeaderProps {
  navGroups: NavGroup[];
  prefetchOnHover: (href: string) => void;
  commandHubOpen: boolean;
  commandHubLoaded: boolean;
  onOpenCommandHub: () => void;
  onCommandHubChange: (open: boolean) => void;
  commandHubTab: ActionCenterTab;
  onCommandHubTabChange: (tab: ActionCenterTab) => void;
  isAdmin: boolean;
  summary: ActionCenterSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  onRefreshSummary: () => Promise<ActionCenterSummary | null>;
  onActionCenterChanged: () => void;
  name: string;
  accounts: Account[];
  selectedAccountId: string;
  onOpenSettings: () => void;
}

/**
 * 顶栏只回答三件事：我在哪一页、要去哪一页、有没有事等我。
 * 一行：DYData ｜ 导航 ……… 待办 · 名字 ▾
 * 高度与底色从头到尾不变（滚动不变高、不变色、不模糊）；手机不显示，导航交给底部标签栏。
 * 左右边线跟正文同一条轨道（--app-rail，由页面 data-app-rail 决定），外层内边距与 <main> 相同。
 */
export function NavigationHeader({
  navGroups,
  prefetchOnHover,
  commandHubOpen,
  commandHubLoaded,
  onOpenCommandHub,
  onCommandHubChange,
  commandHubTab,
  onCommandHubTabChange,
  isAdmin,
  summary,
  summaryLoading,
  summaryError,
  onRefreshSummary,
  onActionCenterChanged,
  name,
  accounts,
  selectedAccountId,
  onOpenSettings,
}: NavigationHeaderProps) {
  return (
    <header
      className="fixed inset-x-0 top-[var(--network-bar-offset,0px)] z-50 hidden border-b border-[#E2E2DF] bg-[#FCFCFB] pt-[var(--app-safe-top,0px)] md:block"
    >
      <div className="px-3.5 sm:px-6">
        <div className="mx-auto flex h-[var(--app-nav-height)] w-full max-w-[var(--app-rail,80rem)] items-center gap-4">
          <Link
            href="/dashboard"
            prefetch={false}
            onMouseEnter={() => prefetchOnHover("/dashboard")}
            className="shrink-0 rounded-md text-[14px] leading-none text-[#141413] outline-none focus-visible:ring-2 focus-visible:ring-status-info/20"
          >
            DYData
          </Link>
          <DesktopNavMenu navGroups={navGroups} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ActionCenterControls
              open={commandHubOpen}
              commandHubLoaded={commandHubLoaded}
              onOpen={onOpenCommandHub}
              onOpenChange={onCommandHubChange}
              activeTab={commandHubTab}
              onTabChange={onCommandHubTabChange}
              isAdmin={isAdmin}
              summary={summary}
              summaryLoading={summaryLoading}
              summaryError={summaryError}
              onRefreshSummary={onRefreshSummary}
              onActionCenterChanged={onActionCenterChanged}
            />
            <UserWorkspacePopover
              name={name}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

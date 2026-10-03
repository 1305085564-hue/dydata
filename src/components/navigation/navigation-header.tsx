"use client";

import Link from "next/link";
import type { ActionCenterSummary } from "@/lib/action-center/types";
import { UserWorkspacePopover } from "@/components/user-workspace-popover";
import { DesktopNavMenu } from "@/components/navigation/desktop-nav-menu";
import { ActionCenterControls } from "@/components/navigation/action-center-controls";
import type { NavGroup } from "@/lib/navigation/domain/navigation";
import { cn } from "@/lib/utils";

type ActionCenterTab = "todos" | "approvals" | "history";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

interface NavigationHeaderProps {
  isScrolled: boolean;
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
  role: string;
  companyRole?: string | null;
  canAccessTeamManagement: boolean;
  accounts: Account[];
  selectedAccountId: string;
  onOpenSettings: () => void;
}

export function NavigationHeader({
  isScrolled,
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
  role,
  companyRole,
  canAccessTeamManagement,
  accounts,
  selectedAccountId,
  onOpenSettings,
}: NavigationHeaderProps) {
  return (
    <nav
      className={cn(
        "fixed inset-x-0 top-[var(--network-bar-offset,0px)] z-50 border-b pt-[max(env(safe-area-inset-top),0px)] transition-all duration-200 ease-in-out",
        isScrolled
          ? "border-[#E2E2DF] bg-white/95 py-2.5 backdrop-blur-2xl shadow-card-ring"
          : "border-[#E2E2DF]/60 bg-[#FCFCFB]/85 py-3 backdrop-blur-md",
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 lg:gap-4">
            <Link
              href="/dashboard"
              prefetch={false}
              onMouseEnter={() => prefetchOnHover("/dashboard")}
              className="group flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2 rounded-xl p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-info md:min-h-0 md:min-w-0"
            >
              <div className="flex flex-col justify-center">
                <span className="text-[14px] font-medium leading-none text-[#141413]">DYData</span>
                <span className="mt-1 hidden text-[12px] font-normal leading-none tracking-wide text-[#78716C] transition-colors duration-200 group-hover:text-[#1F1E1D] sm:block">
                  创作数据读本
                </span>
              </div>
            </Link>
            <DesktopNavMenu navGroups={navGroups} />
          </div>

          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
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
              role={role}
              companyRole={companyRole}
              canAccessTeamManagement={canAccessTeamManagement}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}

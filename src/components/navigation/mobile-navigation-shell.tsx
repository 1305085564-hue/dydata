"use client";

import type { RefObject } from "react";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { MobileMoreDrawer } from "@/components/mobile-more-drawer";
import type { NavGroup } from "@/lib/navigation/domain/navigation";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

interface MobileNavigationShellProps {
  navGroups: NavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  name: string;
  role: string;
  companyRole?: string | null;
  accounts: Account[];
  selectedAccountId: string;
  onOpenSettings: () => void;
  onOpenCommandHub: () => void;
  badgeCount: number;
}

export function MobileNavigationShell({
  navGroups,
  open,
  onOpenChange,
  moreButtonRef,
  name,
  role,
  companyRole,
  accounts,
  selectedAccountId,
  onOpenSettings,
  onOpenCommandHub,
  badgeCount,
}: MobileNavigationShellProps) {
  const isMobileDrawerOpen = open;
  return (
    <div className="block md:hidden">
      <MobileTabBar
        navGroups={navGroups}
        onOpenMore={() => onOpenChange(true)}
        isMoreOpen={isMobileDrawerOpen}
        moreButtonRef={moreButtonRef}
        badgeCount={badgeCount}
      />
      <MobileMoreDrawer
        open={isMobileDrawerOpen}
        onOpenChange={onOpenChange}
        name={name}
        role={role}
        companyRole={companyRole}
        navGroups={navGroups}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onOpenSettings={onOpenSettings}
        onOpenCommandHub={onOpenCommandHub}
        bellBadgeCount={badgeCount}
      />
    </div>
  );
}

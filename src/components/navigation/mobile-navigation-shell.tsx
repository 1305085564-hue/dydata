"use client";

import { useMemo, type RefObject } from "react";
import { MobileTabBar, getMobileDirectTabs } from "@/components/mobile-tab-bar";
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
  // 底栏已经直达的单页入口，抽屉里不再列第二遍
  const drawerGroups = useMemo(() => {
    const directKeys = new Set(getMobileDirectTabs(navGroups).map((tab) => tab.key));
    return navGroups.filter((group) => !directKeys.has(group.key));
  }, [navGroups]);
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
        navGroups={drawerGroups}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onOpenSettings={onOpenSettings}
        onOpenCommandHub={onOpenCommandHub}
        bellBadgeCount={badgeCount}
      />
    </div>
  );
}

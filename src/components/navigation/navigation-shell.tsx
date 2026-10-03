"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getNavGroups } from "@/lib/navigation/domain/navigation";
import { MobileNavigationShell } from "@/components/navigation/mobile-navigation-shell";
import { NavigationHeader } from "@/components/navigation/navigation-header";
import { useActionCenterSummary } from "@/components/navigation/use-action-center-summary";
import type { Permissions } from "@/types";
import {
  initDashboardStore,
  getDashboardSnapshot,
  subscribeDashboardStore,
} from "@/lib/dashboard-store";
import { getCommandHubDefaultTab } from "@/lib/exemption-approvals";
import { getCachedActionCenterSummary } from "@/lib/navigation/data/action-center-summary";
import { useSyncExternalStore } from "react";

const PremiumSettingsModal = dynamic(() => import("@/components/premium-settings-modal").then((module) => module.PremiumSettingsModal), { ssr: false });

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

export interface NavBarClientProps {
  userId: string;
  name: string;
  role: string;
  companyRole?: string | null;
  permissions?: Permissions | null;
  showAdmin: boolean;
  showSystemSettings?: boolean;
  canAccessTeamManagement?: boolean;
  canEnterGroupMode?: boolean;
  groupModeActive?: boolean;
  accounts?: Account[];
}

export function NavBarClient({
  userId,
  name,
  role,
  companyRole,
  permissions,
  showAdmin,
  showSystemSettings = false,
  canAccessTeamManagement = false,
  canEnterGroupMode = false,
  groupModeActive = false,
  accounts = [],
}: NavBarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [commandHubOpen, setCommandHubOpen] = useState(false);
  const [commandHubLoaded, setCommandHubLoaded] = useState(false);
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "approvals" | "history">(showAdmin ? "approvals" : "todos");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const tabBarMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const { summary, loading, error, sync: syncActionCenterSummary } = useActionCenterSummary(userId);
  const navGroups = useMemo(() => getNavGroups({ showAdmin, showSystemSettings, canAccessTeamManagement, permissions }), [canAccessTeamManagement, permissions, showAdmin, showSystemSettings]);
  const snapshot = useSyncExternalStore(subscribeDashboardStore, getDashboardSnapshot, getDashboardSnapshot);
  const selectedAccountId = snapshot.selectedAccountId || accounts[0]?.id || "";
  const isAdmin = showAdmin;
  const bellBadgeCount = summary?.todoCount ?? 0;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 15);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (accounts.length > 0) initDashboardStore({ accounts });
  }, [accounts]);

  useEffect(() => {
    const timer = setTimeout(() => setIsMobileDrawerOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  const handleCommandHubOpen = useCallback(() => {
    if (commandHubOpen) {
      setCommandHubOpen(false);
      return;
    }
    setCommandHubLoaded(true);
    const cachedSummary = getCachedActionCenterSummary(userId) ?? summary;
    const summaryHadLoaded = Boolean(cachedSummary);
    setCommandHubTab(
      getCommandHubDefaultTab({
        todoCount: cachedSummary ? Math.max(0, cachedSummary.todoCount - cachedSummary.approvalCount) : 0,
        approvalCount: cachedSummary?.approvalCount ?? 0,
        isAdmin,
      }),
    );
    setCommandHubOpen(true);
    void syncActionCenterSummary({ force: true }).then((nextSummary) => {
      if (!summaryHadLoaded && nextSummary) {
        setCommandHubTab(
          getCommandHubDefaultTab({
            todoCount: Math.max(0, nextSummary.todoCount - nextSummary.approvalCount),
            approvalCount: nextSummary.approvalCount,
            isAdmin,
          }),
        );
      }
    });
  }, [commandHubOpen, isAdmin, summary, syncActionCenterSummary, userId]);

  const handleActionCenterChanged = useCallback(() => {
    void syncActionCenterSummary({ force: true });
  }, [syncActionCenterSummary]);

  const handleSettingsOpen = useCallback(() => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
  }, []);

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  return (
    <>
      <NavigationHeader
        isScrolled={isScrolled}
        navGroups={navGroups}
        prefetchOnHover={prefetchOnHover}
        commandHubOpen={commandHubOpen}
        commandHubLoaded={commandHubLoaded}
        onOpenCommandHub={handleCommandHubOpen}
        onCommandHubChange={setCommandHubOpen}
        commandHubTab={commandHubTab}
        onCommandHubTabChange={setCommandHubTab}
        isAdmin={isAdmin}
        summary={summary}
        summaryLoading={loading}
        summaryError={error}
        onRefreshSummary={() => syncActionCenterSummary({ force: true })}
        onActionCenterChanged={handleActionCenterChanged}
        name={name}
        role={role}
        companyRole={companyRole}
        canAccessTeamManagement={canAccessTeamManagement}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onOpenSettings={handleSettingsOpen}
      />

      <MobileNavigationShell
        navGroups={navGroups}
        open={isMobileDrawerOpen}
        onOpenChange={(open) => {
          setIsMobileDrawerOpen(open);
          if (!open) tabBarMoreButtonRef.current?.focus();
        }}
        moreButtonRef={tabBarMoreButtonRef}
        name={name}
        role={role}
        companyRole={companyRole}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onOpenSettings={handleSettingsOpen}
        onOpenCommandHub={handleCommandHubOpen}
        badgeCount={bellBadgeCount}
      />

      {settingsLoaded && (
        <PremiumSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          profileName={name}
          profileRole={role}
          companyRole={companyRole}
          canEnterGroupMode={canEnterGroupMode}
          groupModeActive={groupModeActive}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
        />
      )}
    </>
  );
}

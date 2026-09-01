"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { getNavGroups } from "@/components/nav-bar-items";
import type { NavSubItem } from "@/components/nav-bar-items";
import { UserWorkspacePopover } from "@/components/user-workspace-popover";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { MobileMoreDrawer } from "@/components/mobile-more-drawer";
import { cn } from "@/lib/utils";
import type { Permissions } from "@/types";
import {
  isActionCenterSummary,
  type ActionCenterSummary,
} from "@/lib/action-center/types";
import {
  useNotifications,
} from "@/components/notifications/notification-store";
import {
  initDashboardStore,
  getDashboardSnapshot,
  subscribeDashboardStore,
} from "@/lib/dashboard-store";
import { getCommandHubDefaultTab } from "@/lib/exemption-approvals";

const UnifiedCommandHub = dynamic(
  () =>
    import("@/components/unified-command-hub").then(
      (module) => module.UnifiedCommandHub,
    ),
  { ssr: false },
);

const PremiumSettingsModal = dynamic(
  () =>
    import("@/components/premium-settings-modal").then(
      (module) => module.PremiumSettingsModal,
    ),
  { ssr: false },
);

const ACTION_CENTER_CACHE_TTL_MS = 60_000;
let actionCenterSummaryCache: {
  userId: string;
  summary: ActionCenterSummary;
  fetchedAt: number;
} | null = null;
let actionCenterSummaryInFlight: {
  userId: string;
  promise: Promise<ActionCenterSummary>;
  force: boolean;
} | null = null;
let actionCenterSummaryRequestSequence = 0;

function requestActionCenterSummary(userId: string, force = false) {
  const cached = actionCenterSummaryCache;
  if (
    !force
    && cached?.userId === userId
    && Date.now() - cached.fetchedAt < ACTION_CENTER_CACHE_TTL_MS
  ) {
    return Promise.resolve(cached.summary);
  }

  if (
    actionCenterSummaryInFlight?.userId === userId &&
    (!force || actionCenterSummaryInFlight.force)
  ) {
    return actionCenterSummaryInFlight.promise;
  }

  const url = force
    ? "/api/action-center/summary?refresh=1"
    : "/api/action-center/summary";
  const requestSequence = ++actionCenterSummaryRequestSequence;
  const promise = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("action-center summary request failed");
      const data: unknown = await response.json();
      if (!isActionCenterSummary(data)) {
        throw new Error("action-center summary response invalid");
      }
      if (requestSequence === actionCenterSummaryRequestSequence) {
        actionCenterSummaryCache = {
          userId,
          summary: data,
          fetchedAt: Date.now(),
        };
      }
      return data;
    })
    .finally(() => {
      if (actionCenterSummaryInFlight?.promise === promise) {
        actionCenterSummaryInFlight = null;
      }
    });

  actionCenterSummaryInFlight = { userId, promise, force };
  return promise;
}

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

interface NavBarClientProps {
  userId: string;
  name: string;
  role: string;
  companyRole?: string | null;
  permissions?: Permissions | null;
  showAdmin: boolean;
  showAiCopywriting?: boolean;
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
  showAiCopywriting = true,
  showSystemSettings = false,
  canAccessTeamManagement = false,
  canEnterGroupMode = false,
  groupModeActive = false,
  accounts = [],
}: NavBarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navGroups = useMemo(
    () =>
      getNavGroups({
        showAdmin,
        showAiCopywriting,
        showSystemSettings,
        canAccessTeamManagement,
        permissions,
      }),
    [canAccessTeamManagement, permissions, showAdmin, showAiCopywriting, showSystemSettings],
  );

  const [isScrolled, setIsScrolled] = useState(false);
  const [commandHubOpen, setCommandHubOpen] = useState(false);
  const [commandHubLoaded, setCommandHubLoaded] = useState(false);
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "approvals">(
    "todos",
  );
  const [actionCenterSummary, setActionCenterSummary] = useState<ActionCenterSummary | null>(
    () => actionCenterSummaryCache?.userId === userId ? actionCenterSummaryCache.summary : null,
  );
  const [actionCenterSummaryLoading, setActionCenterSummaryLoading] = useState(false);
  const [actionCenterSummaryError, setActionCenterSummaryError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [activeDropdownGroup, setActiveDropdownGroup] = useState<string | null>(
    null,
  );
  const tabBarMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleDropdownOpen = (key: string) => {
    if (dropdownCloseTimerRef.current) {
      clearTimeout(dropdownCloseTimerRef.current);
      dropdownCloseTimerRef.current = null;
    }
    setActiveDropdownGroup(key);
  };

  const handleDropdownCloseLater = () => {
    if (dropdownCloseTimerRef.current) {
      clearTimeout(dropdownCloseTimerRef.current);
    }
    dropdownCloseTimerRef.current = setTimeout(() => {
      setActiveDropdownGroup(null);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (dropdownCloseTimerRef.current) {
        clearTimeout(dropdownCloseTimerRef.current);
      }
    };
  }, []);

  // Close dropdown on pathname change
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveDropdownGroup(null);
      setIsMobileDrawerOpen(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdownGroup(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isAdmin = showAdmin;

  const syncActionCenterSummary = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const cached = actionCenterSummaryCache;
      if (!force && cached?.userId === userId) {
        setActionCenterSummary(cached.summary);
      }
      setActionCenterSummaryLoading(true);
      setActionCenterSummaryError(null);
      try {
        const summary = await requestActionCenterSummary(userId, force);
        setActionCenterSummary(summary);
        return summary;
      } catch {
        setActionCenterSummaryError("暂时没同步到最新");
        return null;
      } finally {
        setActionCenterSummaryLoading(false);
      }
    },
    [userId],
  );

  // 角标是非阻塞的小摘要：首屏之后后台取，打开行动中枢时再强制刷新。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncActionCenterSummary();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [syncActionCenterSummary]);

  // Monitor scroll for header shrink effect
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 15) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Initialize account store
  const snapshot = useSyncExternalStore(
    subscribeDashboardStore,
    getDashboardSnapshot,
    getDashboardSnapshot,
  );
  const selectedAccountId = snapshot.selectedAccountId || accounts[0]?.id || "";

  useEffect(() => {
    if (accounts.length > 0) {
      initDashboardStore({ accounts });
    }
  }, [accounts]);

  const { activate } = useNotifications();
  const bellBadgeCount = actionCenterSummary?.todoCount ?? 0;

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  const handleCommandHubOpen = useCallback(() => {
    if (commandHubOpen) {
      setCommandHubOpen(false);
      return;
    }
    setCommandHubLoaded(true);
    const cachedSummary = actionCenterSummaryCache?.userId === userId
      ? actionCenterSummaryCache.summary
      : actionCenterSummary;
    const summaryHadLoaded = Boolean(cachedSummary);
    const cachedRegularTodoCount = cachedSummary
      ? Math.max(0, cachedSummary.todoCount - cachedSummary.approvalCount)
      : 0;
    setCommandHubTab(
      getCommandHubDefaultTab({
        todoCount: cachedRegularTodoCount,
        approvalCount: cachedSummary?.approvalCount ?? 0,
        isAdmin,
      }),
    );
    setCommandHubOpen(true);

    // 两个刷新并行进行；setCommandHubOpen 已经在所有 await 之前执行。
    void (async () => {
      await activate();
    })();
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
  }, [
    activate,
    actionCenterSummary,
    commandHubOpen,
    isAdmin,
    syncActionCenterSummary,
    userId,
  ]);

  const handleActionCenterChanged = useCallback(() => {
    void syncActionCenterSummary({ force: true });
  }, [syncActionCenterSummary]);

  const handleSettingsOpen = useCallback(() => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
  }, []);

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 top-[var(--network-bar-offset,0px)] z-50 transition-all duration-200 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "border-[#ECE7DE] bg-white/95 py-2.5 backdrop-blur-2xl shadow-[0_4px_20px_-4px_rgba(28,25,23,0.03)]"
            : "border-[#ECE7DE]/80 bg-[#FBF9F5]/85 py-3 backdrop-blur-md",
        )}
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            {/* LEFT: Branding & 5-Group Navigation */}
            <div className="flex items-center gap-3 lg:gap-4 min-w-0">
              <Link
                href="/dashboard"
                prefetch={false}
                onMouseEnter={() => prefetchOnHover("/dashboard")}
                className="flex items-center gap-2.5 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#43718E] rounded-xl p-0.5 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
              >
                <div className="flex size-8.5 items-center justify-center rounded-xl border border-[#292524]/20 bg-[#1C1917] text-white shadow-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:bg-[#292524]">
                  <span className="text-[14px] leading-none text-[#F5F3EE] select-none group-hover:rotate-12 transition-transform duration-200">✦</span>
                </div>
                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14.5px] font-semibold text-[#1C1917] leading-none">
                      DYData
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal tracking-wide text-[#78716C] leading-none transition-colors duration-200 group-hover:text-[#292524] hidden sm:block">
                    创作数据读本
                  </div>
                </div>
              </Link>

              {/* 5-Group Primary Navigation Links */}
              <div
                className="hidden min-w-0 items-center gap-1 lg:gap-1.5 lg:flex"
                aria-label="主导航"
              >
                {navGroups.map((group) => {
                  const isSingle = Boolean(group.href && group.match);
                  const isGroupActive = isSingle
                    ? group.match!(pathname)
                    : group.children?.some((child) => child.match(pathname));

                  const isDropdownOpen = activeDropdownGroup === group.key;

                  if (isSingle) {
                    const Icon = group.icon;
                    return (
                      <Link
                        key={group.key}
                        href={group.href!}
                        aria-current={isGroupActive ? "page" : undefined}
                        prefetch={false}
                        onMouseEnter={() => prefetchOnHover(group.href!)}
                        className={cn(
                          "relative inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[13px] tracking-tight transition-colors duration-100 ease-out group origin-center select-none",
                          isGroupActive
                            ? "text-[#1C1917] font-semibold bg-[#F5F3EE] shadow-2xs"
                            : "text-[#78716C] font-medium hover:text-[#1C1917] hover:bg-[#F5F3EE]/80 active:scale-[0.99] active:duration-120",
                        )}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-transform duration-200 group-hover:scale-105",
                              isGroupActive
                                ? "text-[#D97757]"
                                : "text-[#78716C] group-hover:text-[#292524]",
                            )}
                          />
                        )}
                        <span className="whitespace-nowrap">{group.label}</span>
                      </Link>
                    );
                  }

                  // Dropdown Group Item
                  const GroupIcon = group.icon;

                  return (
                    <div
                      key={group.key}
                      className="relative"
                      onMouseEnter={() => handleDropdownOpen(group.key)}
                      onMouseLeave={handleDropdownCloseLater}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDropdownGroup((curr) =>
                            curr === group.key ? null : group.key,
                          )
                        }
                        aria-expanded={isDropdownOpen}
                        aria-haspopup="true"
                        className={cn(
                          "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[13px] tracking-tight transition-colors duration-100 ease-out group origin-center select-none",
                          isGroupActive || isDropdownOpen
                            ? "text-[#1C1917] font-semibold bg-[#F5F3EE] shadow-2xs"
                            : "text-[#78716C] font-medium hover:text-[#1C1917] hover:bg-[#F5F3EE]/80 active:scale-[0.99] active:duration-120",
                        )}
                      >
                        {isGroupActive && (
                          <span className="absolute bottom-0 inset-x-3 h-[2px] rounded-full bg-[#43718E] transition-all duration-150" />
                        )}
                        {GroupIcon && (
                          <GroupIcon
                            className={cn(
                              "size-3.5 stroke-[1.8] shrink-0 mr-0.5 transition-transform duration-200 group-hover:scale-105",
                              isGroupActive || isDropdownOpen
                                ? "text-[#43718E]"
                                : "text-[#78716C] group-hover:text-[#292524]",
                            )}
                          />
                        )}
                        <span className="whitespace-nowrap">{group.label}</span>

                        <ChevronDown
                          className={cn(
                            "size-3.5 stroke-[2] opacity-50 transition-transform duration-200 ease-out group-hover:opacity-100",
                            isDropdownOpen &&
                              "rotate-180 text-[#43718E] opacity-100",
                          )}
                        />
                      </button>

                      {/* Dropdown Floating Panel */}
                      {isDropdownOpen && group.children && (
                        <div
                          className="absolute left-0 top-full pt-1.5 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
                          onMouseEnter={() => handleDropdownOpen(group.key)}
                          onMouseLeave={handleDropdownCloseLater}
                        >
                          <div className="w-56 rounded-xl bg-[#FAF8F4]/98 p-1.5 shadow-claude-float backdrop-blur-2xl">
                            <div className="space-y-0.5">
                              {group.children.map((child: NavSubItem) => {
                                const active = child.match(pathname);
                                const Icon = child.icon;
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    prefetch={false}
                                    onMouseEnter={() =>
                                      prefetchOnHover(child.href)
                                    }
                                    onClick={() => setActiveDropdownGroup(null)}
                                    className={cn(
                                      "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150 group/item",
                                      active
                                        ? "bg-[#F5F3EE] text-[#1C1917] font-semibold"
                                        : "text-[#292524] font-medium hover:bg-[#F5F3EE] hover:text-[#1C1917]",
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {Icon && (
                                        <Icon
                                          className={cn(
                                            "size-4 stroke-[1.8] shrink-0 transition-transform duration-150 group-hover/item:scale-105",
                                            active
                                              ? "text-[#D97757]"
                                              : "text-[#78716C] group-hover/item:text-[#1C1917]",
                                          )}
                                        />
                                      )}
                                      <span className="truncate">
                                        {child.label}
                                      </span>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Combined User & Workspace Controls / Notifications Hub (Far Right, hidden on mobile) */}
            <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-auto">
              {/* Bell alert Popover button container (Click to Open) */}
              <div className="relative group py-1 -my-1">
                <button
                  type="button"
                  onClick={() => void handleCommandHubOpen()}
                  className={cn(
                    "relative flex h-7 items-center justify-center rounded-md px-2.5 transition-all duration-150 group outline-none focus-visible:ring-2 focus-visible:ring-[#43718E]/20 cursor-pointer active:scale-[0.99] active:duration-120",
                    bellBadgeCount > 0
                      ? "bg-[#D97757]/10 border border-[#D97757]/20 text-[#D97757] hover:bg-[#D97757]/15 shadow-sm shadow-[#D97757]/5"
                      : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] border border-transparent",
                    commandHubOpen &&
                      "bg-[#F5F3EE] text-[#1C1917] font-medium border-[#ECE7DE] shadow-sm",
                  )}
                  title="行动中枢：待办、审批与风险"
                  aria-label="行动中枢：待办、审批与风险"
                >
                  <Bell
                    className={cn(
                      "size-4 stroke-[1.9] transition-transform duration-200 ease-out group-hover:rotate-6 group-hover:scale-105",
                      bellBadgeCount > 0
                        ? "text-[#D97757] fill-[#D97757]/20"
                        : "text-[#78716C] group-hover:text-[#292524]",
                    )}
                  />

                  {/* Functional Count Label */}
                  {bellBadgeCount > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1.5 text-[12px] font-medium text-white tabular-nums shadow-sm">
                      {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Integrated Persona & Workspace Control (Far Right) */}
              <UserWorkspacePopover
                name={name}
                role={role}
                companyRole={companyRole}
                canAccessTeamManagement={canAccessTeamManagement}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onOpenSettings={handleSettingsOpen}
              />
            </div>
          </div>
        </div>
      </nav>

      {commandHubLoaded && (
        <UnifiedCommandHub
          open={commandHubOpen}
          onOpenChange={setCommandHubOpen}
          activeTab={commandHubTab}
          onTabChange={setCommandHubTab}
          isAdmin={isAdmin}
          summary={actionCenterSummary}
          summaryLoading={actionCenterSummaryLoading}
          summaryError={actionCenterSummaryError}
          onRefreshSummary={() => syncActionCenterSummary({ force: true })}
          onActionCenterChanged={handleActionCenterChanged}
        />
      )}

      {/* Mobile Shell (<768px) */}
      <div className="block md:hidden">
        <MobileTabBar
          navGroups={navGroups}
          onOpenMore={() => setIsMobileDrawerOpen(true)}
          isMoreOpen={isMobileDrawerOpen}
          moreButtonRef={tabBarMoreButtonRef}
          badgeCount={bellBadgeCount}
        />
        <MobileMoreDrawer
          open={isMobileDrawerOpen}
          onOpenChange={(open) => {
            setIsMobileDrawerOpen(open);
            if (!open) {
              tabBarMoreButtonRef.current?.focus();
            }
          }}
          name={name}
          role={role}
          companyRole={companyRole}
          navGroups={navGroups}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onOpenSettings={handleSettingsOpen}
          onOpenCommandHub={handleCommandHubOpen}
          bellBadgeCount={bellBadgeCount}
        />
      </div>

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

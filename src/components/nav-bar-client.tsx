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
import type { NavGroup, NavSubItem } from "@/components/nav-bar-items";
import { UserWorkspacePopover } from "@/components/user-workspace-popover";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { MobileMoreDrawer } from "@/components/mobile-more-drawer";
import { cn } from "@/lib/utils";
import type { Permissions } from "@/types";
import {
  isLocalNotification,
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

// 豁免审批角标计数：跨路由的模块级缓存，避免每次硬加载都为一个小角标拉全量待审批列表
const PENDING_APPROVALS_COUNT_TTL_MS = 60_000;
let pendingApprovalsCountCache: { count: number; fetchedAt: number } | null =
  null;

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

interface NavBarClientProps {
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
  canViewOrphanDetails?: boolean;
  orphanExemptionCount?: number;
  accounts?: Account[];
}

export function NavBarClient({
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
  canViewOrphanDetails = false,
  orphanExemptionCount = 0,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
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

  const loadPendingApprovalsCount = useCallback(
    async (options: { maxAgeMs?: number } = {}) => {
      if (!isAdmin) return 0;
      const maxAgeMs = options.maxAgeMs ?? PENDING_APPROVALS_COUNT_TTL_MS;
      const cached = pendingApprovalsCountCache;
      if (cached && Date.now() - cached.fetchedAt < maxAgeMs) {
        return cached.count;
      }
      try {
        const res = await fetch("/api/exemptions/pending", {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const json = await res.json();
        const nextCount =
          typeof json.count === "number"
            ? json.count
            : (json.data?.length ?? 0);
        pendingApprovalsCountCache = {
          count: nextCount,
          fetchedAt: Date.now(),
        };
        return nextCount;
      } catch (err) {
        console.error("Failed to fetch pending count:", err);
        return null;
      }
    },
    [isAdmin],
  );

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

  // 管理员角标计数延后到页面首屏请求之后拉取，不与页面首屏争抢带宽
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadPendingApprovalsCount().then((nextCount) => {
        if (!cancelled && typeof nextCount === "number") {
          setPendingApprovalsCount(nextCount);
        }
      });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAdmin, loadPendingApprovalsCount]);

  // Load real notification counts
  const { notifications: allNotifications, activate } = useNotifications();
  const activeTodos = allNotifications.filter(
    (n) => n.category === "todo" && n.status === "unread",
  );
  const totalAlertsCount = activeTodos.length;
  const approvalBadgeCount = isAdmin ? pendingApprovalsCount : 0;
  const bellBadgeCount = totalAlertsCount + approvalBadgeCount;

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  const handleCommandHubOpen = useCallback(async () => {
    if (commandHubOpen) {
      setCommandHubOpen(false);
      return;
    }
    setCommandHubLoaded(true);
    let nextApprovalCount = approvalBadgeCount;
    const localTodoCount = allNotifications.filter(
      (row) =>
        isLocalNotification(row) &&
        row.category === "todo" &&
        row.status === "unread",
    ).length;
    let nextTodoCount = activeTodos.length;

    const notificationSnapshot = await activate();
    if (notificationSnapshot) {
      const remoteTodoCount = notificationSnapshot.notifications.filter(
        (row) => row.category === "todo" && row.status === "unread",
      ).length;
      nextTodoCount = localTodoCount + remoteTodoCount;
    }

    if (nextTodoCount === 0 && isAdmin) {
      const latestApprovalCount = await loadPendingApprovalsCount({
        maxAgeMs: 0,
      });
      if (typeof latestApprovalCount === "number") {
        nextApprovalCount = latestApprovalCount;
        setPendingApprovalsCount(latestApprovalCount);
      }
    }

    setCommandHubTab(
      getCommandHubDefaultTab({
        todoCount: nextTodoCount,
        approvalCount: nextApprovalCount,
        isAdmin,
      }),
    );
    setCommandHubOpen(true);
  }, [
    activate,
    activeTodos.length,
    allNotifications,
    approvalBadgeCount,
    commandHubOpen,
    isAdmin,
    loadPendingApprovalsCount,
  ]);

  const handleSettingsOpen = useCallback(() => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
  }, []);

  const handleHubPendingCountChange = useCallback((count: number) => {
    setPendingApprovalsCount(count);
    pendingApprovalsCountCache = { count, fetchedAt: Date.now() };
  }, []);

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 top-[var(--network-bar-offset,0px)] z-50 transition-all duration-150 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "border-[#E5E0D6]/80 bg-white/90 py-2.5 backdrop-blur-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]"
            : "border-[#E5E0D6]/40 bg-[#FBF9F5]/70 py-3 backdrop-blur-md",
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
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14.5px] font-semibold text-[#1C1917] leading-none">
                      DYData
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal tracking-wide text-[#78716C] leading-none transition-colors duration-200 group-hover:text-[#292524]">
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
                            : "text-[#78716C] font-medium hover:text-[#1C1917] hover:bg-[#F5F3EE]/80 active:scale-[0.985]",
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
                            : "text-[#78716C] font-medium hover:text-[#1C1917] hover:bg-[#F5F3EE]/80 active:scale-[0.985]",
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
                          <div className="w-56 rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/98 p-1.5 shadow-claude-float backdrop-blur-2xl">
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

            {/* RIGHT: Combined User & Workspace Controls / Notifications Hub (Far Right) */}
            <div className="flex items-center gap-2.5 shrink-0 ml-auto">
              {/* Bell alert Popover button container (Click to Open) */}
              <div className="relative group py-1 -my-1">
                <button
                  type="button"
                  onClick={() => void handleCommandHubOpen()}
                  className={cn(
                    "relative flex h-8.5 items-center justify-center rounded-xl px-2.5 transition-all duration-150 group outline-none focus-visible:ring-2 focus-visible:ring-[#43718E]/20 cursor-pointer min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0",
                    bellBadgeCount > 0
                      ? "bg-[#D97757]/10 border border-[#D97757]/20 text-[#D97757] hover:bg-[#D97757]/15 shadow-sm shadow-[#D97757]/5"
                      : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 border border-transparent",
                    commandHubOpen &&
                      "bg-[#F5F3EE] text-[#1C1917] font-medium border-[#E5E0D6] shadow-sm",
                  )}
                  title="待办与通知中心"
                  aria-label="待办与通知中心"
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

                {commandHubLoaded && (
                  <UnifiedCommandHub
                    open={commandHubOpen}
                    onOpenChange={setCommandHubOpen}
                    activeTab={commandHubTab}
                    onTabChange={setCommandHubTab}
                    isAdmin={isAdmin}
                    pendingApprovalsCount={approvalBadgeCount}
                    onPendingCountChange={handleHubPendingCountChange}
                    canViewOrphanDetails={canViewOrphanDetails}
                    orphanExemptionCount={orphanExemptionCount}
                  />
                )}
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

"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Zap, ChevronDown } from "lucide-react";
import { getNavGroups } from "@/components/nav-bar-items";
import type { NavGroup, NavSubItem } from "@/components/nav-bar-items";
import { WorkspacePicker } from "@/components/workspace-picker";
import { UserWorkspacePopover } from "@/components/user-workspace-popover";
import { cn } from "@/lib/utils";
import type { Permissions } from "@/types";
import { isLocalNotification, useNotifications } from "@/components/notifications/notification-store";
import {
  initDashboardStore,
  getDashboardSnapshot,
  subscribeDashboardStore,
} from "@/lib/dashboard-store";
import { getCommandHubDefaultTab } from "@/lib/exemption-approvals";

const UnifiedCommandHub = dynamic(
  () => import("@/components/unified-command-hub").then((module) => module.UnifiedCommandHub),
  { ssr: false },
);

const PremiumSettingsModal = dynamic(
  () => import("@/components/premium-settings-modal").then((module) => module.PremiumSettingsModal),
  { ssr: false },
);

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
  permissions?: Permissions | null;
  showAdmin: boolean;
  showAiCopywriting?: boolean;
  showSystemSettings?: boolean;
  accounts?: Account[];
}

export function NavBarClient({
  name,
  role,
  permissions,
  showAdmin,
  showAiCopywriting = true,
  showSystemSettings = false,
  accounts = [],
}: NavBarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navGroups = useMemo(
    () => getNavGroups({ showAdmin, showAiCopywriting, showSystemSettings, permissions }),
    [permissions, showAdmin, showAiCopywriting, showSystemSettings],
  );

  const [isScrolled, setIsScrolled] = useState(false);
  const [commandHubOpen, setCommandHubOpen] = useState(false);
  const [commandHubLoaded, setCommandHubLoaded] = useState(false);
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "approvals" | "notifications">("todos");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdownGroup, setActiveDropdownGroup] = useState<string | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
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
      setIsMobileMenuOpen(false);
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

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  const [centerBadges, setCenterBadges] = useState<{
    cockpit: number;
    videos: number;
    content: number;
    conversion_hub: number;
    ai_channels: number;
  } | null>(null);

  const isAdmin = showAdmin;

  // Poll for admin center badges (video/content anomaly review queue counts)
  useEffect(() => {
    if (!showAdmin) return;
    let active = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/sidebar-badges", { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        if (active) setCenterBadges(json);
      } catch {}
    };
    void load();
    const id = setInterval(load, 120_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [showAdmin]);

  const loadPendingApprovalsCount = useCallback(async () => {
    if (!isAdmin) return 0;
    try {
      const res = await fetch("/api/exemptions/pending", { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      return typeof json.count === "number" ? json.count : json.data?.length ?? 0;
    } catch (err) {
      console.error("Failed to fetch pending count:", err);
      return null;
    }
  }, [isAdmin]);

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
  const snapshot = useSyncExternalStore(subscribeDashboardStore, getDashboardSnapshot, getDashboardSnapshot);
  const selectedAccountId = snapshot.selectedAccountId || accounts[0]?.id || "";

  useEffect(() => {
    if (accounts.length > 0) {
      initDashboardStore({ accounts });
    }
  }, [accounts]);

  // Fetch pending approvals count on mount (if admin)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      const nextCount = await loadPendingApprovalsCount();
      if (!cancelled && typeof nextCount === "number") {
        setPendingApprovalsCount(nextCount);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, loadPendingApprovalsCount]);

  // Load real notification counts
  const { notifications: allNotifications, activate } = useNotifications();
  const activeTodos = allNotifications.filter((n) => n.category === "todo" && n.status === "unread");
  const unreadAlerts = allNotifications.filter((n) => n.category !== "todo" && n.status === "unread");
  const totalAlertsCount = activeTodos.length + unreadAlerts.length;
  const approvalBadgeCount = isAdmin ? pendingApprovalsCount : 0;
  const bellBadgeCount = totalAlertsCount + approvalBadgeCount;

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  const handleCommandHubOpen = useCallback(async () => {
    setCommandHubLoaded(true);
    let nextApprovalCount = approvalBadgeCount;
    const localTodoCount = allNotifications.filter(
      (row) => isLocalNotification(row) && row.category === "todo" && row.status === "unread",
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
      const latestApprovalCount = await loadPendingApprovalsCount();
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
  }, [activate, activeTodos.length, allNotifications, approvalBadgeCount, isAdmin, loadPendingApprovalsCount]);

  const handleSettingsOpen = useCallback(() => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
  }, []);

  // Helper to get total badge count for a group
  const getGroupBadgeCount = (group: NavGroup): number => {
    if (!group.children) return 0;
    return group.children.reduce((acc, child) => {
      if (child.badgeKey && centerBadges?.[child.badgeKey]) {
        return acc + centerBadges[child.badgeKey];
      }
      return acc;
    }, 0);
  };

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "border-zinc-200 bg-white/95 py-2.5 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)]"
            : "border-zinc-200/50 bg-zinc-50/80 py-3.5 backdrop-blur-md"
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
                className="flex items-center gap-2.5 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5F82A8] rounded-xl p-0.5"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20 transition-all duration-300 ease-out group-hover:scale-105 group-hover:rotate-[3deg]">
                  <Zap className="size-[18px] stroke-[2] fill-current transition-transform duration-300 group-hover:scale-110" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-[12px] font-medium tracking-tight text-zinc-900 uppercase leading-none transition-colors duration-300 group-hover:text-zinc-950">
                    DYData <span className="text-[#D97757] font-medium text-[12px] transition-colors duration-300 group-hover:text-[#C9503B]">PREMIUM</span>
                  </div>
                  <div className="mt-1 text-[12px] font-normal tracking-[0.12em] text-zinc-500 uppercase leading-none transition-colors duration-300 group-hover:text-zinc-600">
                    短视频管理控制台
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

                  const groupBadgeCount = getGroupBadgeCount(group);
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
                          "relative inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-[13px] tracking-tight transition-all duration-200 ease-out group origin-center",
                          isGroupActive
                            ? "text-zinc-950 font-semibold scale-[1.03]"
                            : "text-zinc-600 font-medium hover:text-zinc-950 hover:bg-zinc-200/80 hover:scale-[1.03] active:scale-95"
                        )}
                      >
                        {isGroupActive && (
                          <span className="absolute bottom-0 inset-x-2.5 h-[2.5px] rounded-full bg-[#5F82A8] transition-all duration-200" />
                        )}
                        {Icon && (
                          <Icon className={cn("size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-transform duration-200 group-hover:scale-105", isGroupActive ? "text-[#5F82A8]" : "text-zinc-500 group-hover:text-zinc-800")} />
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
                          setActiveDropdownGroup((curr) => (curr === group.key ? null : group.key))
                        }
                        aria-expanded={isDropdownOpen}
                        className={cn(
                          "relative inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-[13px] tracking-tight transition-all duration-200 ease-out group origin-center",
                          isGroupActive || isDropdownOpen
                            ? "text-zinc-950 font-semibold scale-[1.03]"
                            : "text-zinc-600 font-medium hover:text-zinc-950 hover:bg-zinc-200/80 hover:scale-[1.03] active:scale-95"
                        )}
                      >
                        {isGroupActive && (
                          <span className="absolute bottom-0 inset-x-2.5 h-[2.5px] rounded-full bg-[#5F82A8] transition-all duration-200" />
                        )}
                        {GroupIcon && (
                          <GroupIcon
                            className={cn(
                              "size-3.5 stroke-[1.8] shrink-0 mr-0.5 transition-transform duration-200 group-hover:scale-105",
                              isGroupActive || isDropdownOpen
                                ? "text-[#5F82A8]"
                                : "text-zinc-500 group-hover:text-zinc-800"
                            )}
                          />
                        )}
                        <span className="whitespace-nowrap">{group.label}</span>

                        {groupBadgeCount > 0 && (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[10px] font-medium text-white tabular-nums">
                            {groupBadgeCount > 99 ? "99+" : groupBadgeCount}
                          </span>
                        )}

                        <ChevronDown
                          className={cn(
                            "size-3.5 stroke-[2] opacity-60 transition-transform duration-200 ease-out group-hover:opacity-100",
                            isDropdownOpen && "rotate-180 text-[#5F82A8]"
                          )}
                        />
                      </button>

                      {/* Dropdown Floating Panel */}
                      {isDropdownOpen && group.children && (
                        <div
                          className="absolute left-0 top-full pt-1 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
                          onMouseEnter={() => handleDropdownOpen(group.key)}
                          onMouseLeave={handleDropdownCloseLater}
                        >
                          <div className="w-56 rounded-2xl border border-zinc-200 bg-white/95 p-1.5 shadow-xl shadow-zinc-900/5 backdrop-blur-xl ring-1 ring-black/5">
                            <div className="space-y-0.5">
                              {group.children.map((child: NavSubItem) => {
                                const active = child.match(pathname);
                                const Icon = child.icon;
                                const badgeVal = child.badgeKey
                                  ? centerBadges?.[child.badgeKey] ?? 0
                                  : 0;
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    prefetch={false}
                                    onMouseEnter={() => prefetchOnHover(child.href)}
                                    onClick={() => setActiveDropdownGroup(null)}
                                    className={cn(
                                      "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[13px] transition-all duration-150 origin-left group/item",
                                      active
                                        ? "bg-[#5F82A8]/12 text-zinc-950 font-semibold scale-[1.02]"
                                        : "text-zinc-700 font-medium hover:bg-zinc-200/70 hover:text-zinc-950 hover:scale-[1.02]"
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {Icon && (
                                        <Icon
                                          className={cn(
                                            "size-4 stroke-[1.8] shrink-0 transition-transform duration-200 group-hover/item:scale-110",
                                            active ? "text-[#5F82A8]" : "text-zinc-400 group-hover/item:text-zinc-700"
                                          )}
                                        />
                                      )}
                                      <span className="truncate">{child.label}</span>
                                    </div>

                                    {badgeVal > 0 && (
                                      <span
                                        className={cn(
                                          "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums",
                                          active
                                            ? "bg-[#5F82A8] text-white"
                                            : "bg-[#D97757] text-white"
                                        )}
                                      >
                                        {badgeVal > 99 ? "99+" : badgeVal}
                                      </span>
                                    )}
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
            <div className="flex items-center gap-3 shrink-0 ml-auto">

              {/* Integrated Persona & Workspace Control */}
              <UserWorkspacePopover
                name={name}
                role={role}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onOpenSettings={handleSettingsOpen}
              />

              {/* Bell alert Popover button container (FAR RIGHT - Seamless Hover Expansion) */}
              <div
                className="relative group py-1 -my-1"
                onMouseEnter={() => {
                  if (!commandHubLoaded) setCommandHubLoaded(true);
                  setCommandHubOpen(true);
                }}
                onMouseLeave={() => setCommandHubOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => void handleCommandHubOpen()}
                  className={cn(
                    "relative flex h-8.5 items-center justify-center rounded-xl px-2.5 transition-all duration-200 group outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/30",
                    bellBadgeCount > 0
                      ? "bg-[#D97757]/10 border border-[#D97757]/20 text-[#D97757] hover:bg-[#D97757]/15 shadow-sm shadow-[#D97757]/5"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 active:scale-95",
                    commandHubOpen && "bg-zinc-900 text-white font-semibold shadow-md border-transparent"
                  )}
                  title="待办与通知中心"
                  aria-label="待办与通知中心"
                >
                  <Bell
                    className={cn(
                      "size-4 stroke-[1.9] transition-transform duration-300 ease-out group-hover:rotate-12 group-hover:scale-110",
                      bellBadgeCount > 0 && "text-[#D97757] fill-[#D97757]/20"
                    )}
                  />

                  {/* Functional Count Label */}
                  {bellBadgeCount > 0 && (
                    <span className="ml-1.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#D97757] px-1.5 text-[10.5px] font-semibold text-white tabular-nums shadow-sm">
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
                    onPendingCountChange={setPendingApprovalsCount}
                  />
                )}
              </div>

              {/* Mobile Hamburger Menu Button */}
              <button
                ref={mobileMenuButtonRef}
                type="button"
                onClick={() => setIsMobileMenuOpen((current) => !current)}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation-menu"
                className="flex size-8.5 items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/70 active:scale-95 lg:hidden group"
                title="导航菜单"
                aria-label="导航菜单"
              >
                <div className="relative size-4">
                  <span className={cn(
                    "absolute left-0 top-0.5 h-0.5 w-4 bg-current transition-all duration-300",
                    isMobileMenuOpen && "top-1.5 rotate-45 text-[#5F82A8]"
                  )} />
                  <span className={cn(
                    "absolute left-0 top-1.5 h-0.5 w-4 bg-current transition-all duration-300",
                    isMobileMenuOpen && "opacity-0"
                  )} />
                  <span className={cn(
                    "absolute left-0 top-2.5 h-0.5 w-4 bg-current transition-all duration-300",
                    isMobileMenuOpen && "top-1.5 -rotate-45 text-[#5F82A8]"
                  )} />
                </div>
              </button>

            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div
          id="mobile-navigation-menu"
          className={cn(
            "animate-in fade-in slide-in-from-top-4 fixed inset-x-0 top-[var(--app-top-offset,64px)] z-40 border-b bg-white/98 px-4 py-4 md:hidden shadow-xl flex flex-col gap-4 max-h-[calc(100vh-var(--app-top-offset,64px))] overflow-y-auto duration-200",
            "border-zinc-200 backdrop-blur-xl"
          )}
        >
          {/* Mobile Workspace Selector */}
          {accounts.length > 0 && (
            <div className="border-b border-zinc-100 pb-3 flex items-center justify-between">
              <span className="text-[12px] font-medium text-zinc-500">工作账号</span>
              <WorkspacePicker accounts={accounts} selectedAccountId={selectedAccountId} />
            </div>
          )}
          
          {/* Mobile 5-Group Nav Links */}
          <div className="flex flex-col gap-3">
            {navGroups.map((group) => {
              const isSingle = Boolean(group.href && group.match);
              if (isSingle) {
                const active = group.match!(pathname);
                const Icon = group.icon;
                return (
                  <Link
                    key={group.key}
                    href={group.href!}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex h-10 items-center justify-between rounded-xl px-3 text-[13px] font-medium transition-all duration-200",
                      active 
                        ? "bg-[#5F82A8]/10 text-[#5F82A8] font-semibold border-l-2 border-[#5F82A8]" 
                        : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon && <Icon className={cn("size-4 stroke-[1.8]", active ? "text-[#5F82A8]" : "text-zinc-400")} />}
                      <span>{group.label}</span>
                    </div>
                  </Link>
                );
              }

              // Group Header with Children list
              const isGroupActive = group.children?.some((c) => c.match(pathname));

              return (
                <div key={group.key} className="flex flex-col gap-1 rounded-xl bg-zinc-50/80 p-2 border border-zinc-100">
                  <div className="px-2 py-1 flex items-center justify-between">
                    <span className={cn("text-[11px] font-semibold uppercase tracking-wider", isGroupActive ? "text-[#5F82A8]" : "text-zinc-400")}>
                      {group.label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.children?.map((child: NavSubItem) => {
                      const active = child.match(pathname);
                      const Icon = child.icon;
                      const badgeVal = child.badgeKey ? centerBadges?.[child.badgeKey] ?? 0 : 0;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "flex h-9 items-center justify-between rounded-lg px-2.5 text-[13px] font-medium transition-all duration-200",
                            active
                              ? "bg-white text-[#5F82A8] font-semibold shadow-sm border border-zinc-200"
                              : "text-zinc-700 hover:bg-white/60 hover:text-zinc-900"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {Icon && <Icon className={cn("size-3.5 stroke-[1.8]", active ? "text-[#5F82A8]" : "text-zinc-400")} />}
                            <span>{child.label}</span>
                          </div>
                          {badgeVal > 0 && (
                            <span className="bg-[#D97757] text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5">
                              {badgeVal}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {settingsLoaded && (
        <PremiumSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          profileName={name}
          profileRole={role}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
        />
      )}
    </>
  );
}


/* [规范对齐] 批次三：顶栏导航指示器改为下划线 */

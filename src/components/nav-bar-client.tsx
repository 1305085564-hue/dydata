"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Wrench, Zap, UsersRound, Settings, Sparkles } from "lucide-react";
import { getNavItems } from "@/components/nav-bar-items";
import { WorkspacePicker } from "@/components/workspace-picker";
import { UnifiedCommandHub } from "@/components/unified-command-hub";
import { PremiumSettingsModal } from "@/components/premium-settings-modal";
import { cn } from "@/lib/utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import { isLocalNotification, useNotifications } from "@/components/notifications/notification-store";
import {
  initDashboardStore,
  getDashboardSnapshot,
  subscribeDashboardStore,
} from "@/lib/dashboard-store";
import { getCommandHubDefaultTab } from "@/lib/exemption-approvals";

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
  businessRole?: BusinessRole | null;
  permissions?: Permissions | null;
  showAdmin: boolean;
  showAiCopywriting?: boolean;
  showSystemSettings?: boolean;
  accounts?: Account[];
}

export function NavBarClient({
  name,
  role,
  businessRole,
  permissions,
  showAdmin,
  showAiCopywriting = true,
  showSystemSettings = false,
  accounts = [],
}: NavBarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = useMemo(
    () => getNavItems({ showAdmin, showAiCopywriting, showSystemSettings, businessRole, permissions }),
    [businessRole, permissions, showAdmin, showAiCopywriting, showSystemSettings],
  );

  const [isScrolled, setIsScrolled] = useState(false);
  const [commandHubOpen, setCommandHubOpen] = useState(false);
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "approvals" | "notifications">("todos");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wrenchOpen, setWrenchOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const wrenchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleWrenchMouseEnter = useCallback(() => {
    if (wrenchTimeoutRef.current) clearTimeout(wrenchTimeoutRef.current);
    setWrenchOpen(true);
  }, []);

  const handleWrenchMouseLeave = useCallback(() => {
    wrenchTimeoutRef.current = setTimeout(() => {
      setWrenchOpen(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (wrenchTimeoutRef.current) clearTimeout(wrenchTimeoutRef.current);
    };
  }, []);
  const [centerBadges, setCenterBadges] = useState<{
    cockpit: number;
    videos: number;
    content: number;
    conversion_hub: number;
    ai_channels: number;
  } | null>(null);

  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole || "");

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

  const isOwner = role === "owner" || businessRole === "owner";

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  const handleCommandHubOpen = useCallback(async () => {
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

   const primaryLinkClass = (active: boolean) =>
    cn(
      "relative inline-flex h-9 shrink-0 items-center rounded-lg px-2 md:px-1.5 lg:px-2.5 text-[12px] lg:text-[13px] font-medium tracking-tight transition-colors duration-200 ease-out z-10",
      active ? "text-stone-900" : "text-stone-500 hover:text-stone-700",
    );

  return (
    <>
      <motion.nav
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "border-stone-200 bg-white/90 py-2 backdrop-blur-lg shadow-[0_2px_8px_-3px_rgba(0,0,0,0.02)]"
            : "border-stone-200/40 bg-stone-50/80 py-4 backdrop-blur-md"
        )}
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            
            {/* LEFT: Branding & Navigation links */}
            <div className="flex items-center gap-2.5 lg:gap-3.5 min-w-0">
              <Link
                href="/dashboard"
                prefetch={false}
                onMouseEnter={() => prefetchOnHover("/dashboard")}
                className="flex items-center gap-2.5 shrink-0 group"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20 transition-all duration-300 ease-out group-hover:scale-105 group-hover:rotate-[3deg]">
                  <Zap className="size-[18px] stroke-[2] fill-current transition-transform duration-300 group-hover:scale-110" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-[12px] font-medium tracking-tight text-stone-900 uppercase leading-none transition-colors duration-300 group-hover:text-stone-950">
                    DYData <span className="text-[#D97757] font-medium text-[12px] transition-colors duration-300 group-hover:text-[#C9503B]">PREMIUM</span>
                  </div>
                  <div className="mt-1 text-[12px] font-normal tracking-[0.12em] text-stone-500 uppercase leading-none transition-colors duration-300 group-hover:text-stone-600">
                    短视频管理控制台
                  </div>
                </div>
              </Link>
  
              {/* Separator */}
              <div className="hidden h-5 w-px bg-stone-200 lg:block" />
  
              {/* Primary Navigation links */}
              <div
                className="hidden min-w-0 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex"
                aria-label="主导航"
              >
                {navItems.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  const badgeValue = item.badgeKey ? centerBadges?.[item.badgeKey] ?? 0 : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onMouseEnter={() => prefetchOnHover(item.href)}
                      className={cn(primaryLinkClass(active), "group")}
                    >
                      {active && (
                        <motion.div
                          layoutId="activeNavIndicator"
                          className="absolute inset-0 bg-white border rounded-lg -z-10 shadow-[0_2px_12px_-3px_rgba(217,119,87,0.12)] border-[#D97757]/15"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                      {!active && (
                        <span className="absolute inset-0 rounded-lg bg-stone-100/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10" />
                      )}
                      {Icon && (
                        <Icon className={cn("size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-all duration-300 ease-out group-hover:-translate-y-0.5", active ? "text-[#D97757]" : "text-stone-500")} />
                      )}
                      <span className="whitespace-nowrap">{item.label}</span>
                      {badgeValue > 0 && (
                        <span
                          className={cn(
                            "ml-1.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[11px] font-medium tabular-nums transition-colors duration-150",
                            active
                              ? "bg-[#D97757] text-white"
                              : "bg-stone-200/60 text-stone-500",
                          )}
                        >
                          {badgeValue > 99 ? "99+" : badgeValue}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
  
            {/* RIGHT: Switchers / Alerts / Settings / Avatar */}
            <div className="flex items-center gap-3 shrink-0 ml-auto">

              {/* 主导航与右侧切换器的隔离竖线 */}
              {accounts.length > 0 && (
                <div className="hidden h-5 w-px bg-stone-200 md:block mr-0.5" />
              )}

              {/* Workspace Selector (Visible only if accounts are loaded) */}
              {accounts.length > 0 && (
                <div className="hidden md:block shrink-0">
                  <WorkspacePicker accounts={accounts} selectedAccountId={selectedAccountId} />
                </div>
              )}

              {/* Separator */}
              <div className="hidden h-5 w-px bg-stone-200 sm:block" />

              {/* System Maintenance (Wrench dropdown) */}
              {showSystemSettings && (
                <div
                  className="relative"
                  onMouseEnter={handleWrenchMouseEnter}
                  onMouseLeave={handleWrenchMouseLeave}
                >
                  <button
                    type="button"
                    className={cn(
                      "relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 group",
                      "text-stone-500 hover:text-[#D97757] active:scale-95",
                      (wrenchOpen || pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/modules") || pathname.startsWith("/admin/ai-config")) &&
                        "text-[#D97757] dark:text-[#D97757]"
                    )}
                    title="系统维护"
                  >
                    <Wrench className="size-4 stroke-[1.8] transition-transform duration-300 ease-out group-hover:rotate-[30deg] group-active:scale-90" />
                  </button>

                  <AnimatePresence>
                    {wrenchOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
                        className={cn(
                          "absolute right-0 mt-2 z-50 w-56 origin-top-right overflow-hidden rounded-2xl border bg-white p-2 shadow-xl",
                          "border-stone-200 bg-white/95 backdrop-blur-xl"
                        )}
                      >
                        <div className="mb-1.5 border-b border-stone-200 px-2.5 py-2">
                          <div className="text-[12px] font-medium text-stone-900">
                            系统运行维护
                          </div>
                          <div className="mt-1 text-[12px] text-stone-500 leading-normal">
                            管理团队架构与 AI 模块
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <Link
                            href="/admin/modules"
                            prefetch={false}
                            onClick={() => setWrenchOpen(false)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-700 transition-all duration-200 hover:bg-stone-100 hover:text-stone-900 group"
                          >
                            <UsersRound className="size-4 stroke-[1.8] text-stone-400 group-hover:text-[#D97757] transition-colors" />
                            <span>团队与成员</span>
                          </Link>

                          <Link
                            href="/admin/settings"
                            prefetch={false}
                            onClick={() => setWrenchOpen(false)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-700 transition-all duration-200 hover:bg-stone-100 hover:text-stone-900 group"
                          >
                            <Settings className="size-4 stroke-[1.8] text-stone-400 group-hover:text-[#D97757] transition-colors" />
                            <span>系统维护与产量</span>
                          </Link>

                          {isOwner && (
                            <Link
                              href="/admin/ai-config"
                              prefetch={false}
                              onClick={() => setWrenchOpen(false)}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-700 transition-all duration-200 hover:bg-stone-100 hover:text-stone-900 group"
                            >
                              <Sparkles className="size-4 stroke-[1.8] text-stone-400 group-hover:text-[#D97757] transition-colors" />
                              <span>AI 配置</span>
                            </Link>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Bell alert drawer button */}
              <button
                type="button"
                onClick={() => void handleCommandHubOpen()}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 group",
                  "text-stone-500 hover:text-stone-700 active:scale-95",
                  commandHubOpen && "text-[#D97757] bg-white border border-[#D97757]/15 shadow-[0_2px_12px_-3px_rgba(217,119,87,0.15)]"
                )}
                title="待办与通知中心"
              >
                <Bell className="size-4 stroke-[1.8] transition-transform duration-300 ease-out group-hover:rotate-[15deg] group-active:scale-90" />
                {bellBadgeCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#D97757] to-[#C9503B] px-1 text-[12px] font-medium text-white ring-2 ring-white tabular-nums animate-pulse">
                    {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
                  </span>
                )}
              </button>

              {/* Mobile Hamburger Menu Button */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:text-stone-700 active:scale-95 md:hidden group"
                title="导航菜单"
              >
                <div className="relative size-4">
                  <span className={cn(
                    "absolute left-0 top-0.5 h-0.5 w-4 bg-current transition-all duration-300",
                    isMobileMenuOpen && "top-1.5 rotate-45"
                  )} />
                  <span className={cn(
                    "absolute left-0 top-1.5 h-0.5 w-4 bg-current transition-all duration-300",
                    isMobileMenuOpen && "opacity-0"
                  )} />
                  <span className={cn(
                    "absolute left-0 top-2.5 h-0.5 w-4 bg-current transition-all duration-300",
                    isMobileMenuOpen && "top-1.5 -rotate-45"
                  )} />
                </div>
              </button>

              {/* User profile avatar info */}
              <div className="h-5 w-px bg-stone-200" />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 text-left rounded-lg focus:outline-none group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-100 text-[12px] font-medium text-stone-700 transition-all duration-200 group-hover:border-[#8AA8C7] group-hover:bg-[#8AA8C7]/10 group-hover:text-[#8AA8C7]">
                  {name.trim().slice(0, 1).toUpperCase() || "?"}
                </div>
                <div className="hidden lg:flex flex-col transition-colors duration-200 group-hover:text-stone-900">
                  <span className="text-[12px] font-medium text-stone-700 leading-tight group-hover:text-stone-900">
                    {name.split(" ")[0]}
                  </span>
                  <span className="mt-0.5 text-[12px] font-normal text-stone-500 leading-none tracking-wider uppercase group-hover:text-[#8AA8C7]">
                    {role === "owner" ? "创始人" : role === "admin" ? "管理员" : "成员"}
                  </span>
                </div>
              </button>

            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "fixed inset-x-0 top-[var(--app-top-offset)] z-40 border-b bg-white/98 px-4 py-4 md:hidden shadow-lg flex flex-col gap-4 max-h-[calc(100vh-var(--app-top-offset))] overflow-y-auto",
              "border-stone-200 backdrop-blur-xl"
            )}
          >
            {/* Mobile Workspace Selector */}
            {accounts.length > 0 && (
              <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
                <span className="text-[12px] font-medium text-stone-500">工作账号</span>
                <WorkspacePicker accounts={accounts} selectedAccountId={selectedAccountId} />
              </div>
            )}
            
            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                const badgeValue = item.badgeKey ? centerBadges?.[item.badgeKey] ?? 0 : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex h-10 items-center justify-between rounded-xl px-3 text-[13px] font-medium transition-all duration-200",
                      active 
                        ? "bg-[#D97757]/10 text-[#D97757]" 
                        : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon && <Icon className={cn("size-4 stroke-[1.8]", active ? "text-[#D97757]" : "text-stone-400")} />}
                      <span>{item.label}</span>
                    </div>
                    {badgeValue > 0 && (
                      <span className="bg-[#D97757] text-white text-[11px] font-medium rounded-full px-2 py-0.5">
                        {badgeValue}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Unified Hubs Drawer and Modals */}
      <UnifiedCommandHub
        open={commandHubOpen}
        onOpenChange={setCommandHubOpen}
        activeTab={commandHubTab}
        onTabChange={setCommandHubTab}
        isAdmin={isAdmin}
        pendingApprovalsCount={approvalBadgeCount}
        onPendingCountChange={setPendingApprovalsCount}
      />

      <PremiumSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profileName={name}
        profileRole={role}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
      />
    </>
  );
}

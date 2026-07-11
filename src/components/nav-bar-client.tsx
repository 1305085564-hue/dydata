"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, Bell, Wrench, Zap } from "lucide-react";
import { getNavItems } from "@/components/nav-bar-items";
import { AdminCenterNav } from "@/components/admin-layout/admin-top-nav";
import { isManagementPath, shouldShowAdminCenterNav } from "@/components/nav-mode";
import { WorkspacePicker } from "@/components/workspace-picker";
import { UnifiedCommandHub } from "@/components/unified-command-hub";
import { PremiumSettingsModal } from "@/components/premium-settings-modal";
import { cn } from "@/lib/utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";
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
    () => getNavItems({ showAdmin, showAiCopywriting, showSystemSettings }),
    [showAdmin, showAiCopywriting, showSystemSettings],
  );

  const [isScrolled, setIsScrolled] = useState(false);
  const [commandHubOpen, setCommandHubOpen] = useState(false);
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "approvals" | "notifications">("todos");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wrenchOpen, setWrenchOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole || "");

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

  const showAdminCenter = showAdmin;
  const isAdminPath = isManagementPath(pathname);
  const showAdminCenterNav = shouldShowAdminCenterNav(pathname);
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
      "inline-flex h-9 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-medium tracking-tight transition-all duration-200 ease-out",
      active ? "bg-white text-stone-900 border border-stone-200" : "text-stone-500 hover:text-stone-700",
    );

  return (
    <>
      <motion.nav
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "border-stone-200 bg-white/95 py-2 backdrop-blur-xl"
            : "border-transparent bg-stone-50 py-4"
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
                className="flex items-center gap-2.5 shrink-0"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20">
                  <Zap className="size-[18px] stroke-[2] fill-current" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-[12px] font-medium tracking-tight text-stone-900 uppercase leading-none">
                    DYData <span className="text-[#D97757] font-medium text-[12px]">PREMIUM</span>
                  </div>
                  <div className="mt-1 text-[12px] font-normal tracking-[0.12em] text-stone-500 uppercase leading-none">
                    短视频管理控制台
                  </div>
                </div>
              </Link>

              {/* Separator */}
              <div className="hidden h-5 w-px bg-stone-200 lg:block" />

              {/* Primary Navigation links / Admin secondary links depending on page url */}
              {showAdminCenterNav ? (
                <div className="hidden min-w-0 items-center gap-1.5 md:flex">
                  <AdminCenterNav
                    userRole={role as UserRole}
                    businessRole={businessRole}
                    permissions={permissions}
                  />
                </div>
              ) : (
                <div
                  className="hidden min-w-0 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex"
                  aria-label="主导航"
                >
                  {navItems.map((item) => {
                    const active = item.match(pathname);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onMouseEnter={() => prefetchOnHover(item.href)}
                        className={primaryLinkClass(active)}
                      >
                        {Icon && (
                          <Icon className={cn("size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-colors", active ? "text-[#D97757]" : "text-stone-500")} />
                        )}
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Switchers / Alerts / Settings / Avatar */}
            <div className="flex items-center gap-3 shrink-0 ml-auto">
              
              {/* Perspective Switcher (Visible only if user has admin permission context) */}
              {showAdminCenter && (
                <button
                  type="button"
                  onClick={() => {
                    router.push(isAdminPath ? "/dashboard" : "/admin/content");
                  }}
                  className="group relative flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 transition-all duration-200 hover:bg-stone-100 hover:text-stone-900 active:scale-[0.98]"
                >
                  <ArrowLeftRight className="size-3 text-stone-500 transition-colors duration-300 group-hover:text-stone-700 group-hover:rotate-180" />
                  <span>{isAdminPath ? "组员视角" : "管理视角"}</span>
                </button>
              )}

              {/* Separator */}
              {showAdminCenter && <div className="hidden h-5 w-px bg-stone-200 md:block" />}

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
                  onMouseEnter={() => setWrenchOpen(true)}
                  onMouseLeave={() => setWrenchOpen(false)}
                >
                  <button
                    type="button"
                    className={cn(
                      "relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                      "text-stone-500 hover:text-[#D97757] active:scale-95",
                      (wrenchOpen || pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/modules") || pathname.startsWith("/admin/ai-config")) &&
                        "text-[#D97757] dark:text-[#D97757]"
                    )}
                    title="系统维护"
                  >
                    <Wrench className="size-4 stroke-[1.8]" />
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
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-100"
                          >
                            <span>团队与成员</span>
                          </Link>

                          {isOwner && (
                            <Link
                              href="/admin/ai-config"
                              prefetch={false}
                              onClick={() => setWrenchOpen(false)}
                              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-100"
                            >
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
                  "relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                  "text-stone-500 hover:text-stone-700 active:scale-95"
                )}
                title="待办与通知中心"
              >
                <Bell className="size-4 stroke-[1.8]" />
                {bellBadgeCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#D97757] to-[#C9503B] px-1 text-[12px] font-medium text-white ring-2 ring-white tabular-nums">
                    {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
                  </span>
                )}
              </button>

              {/* User profile avatar info */}
              <div className="h-5 w-px bg-stone-200" />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 text-left rounded-lg hover:opacity-85 focus:outline-none"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-100 text-[12px] font-medium text-stone-700">
                  {name.trim().slice(0, 1).toUpperCase() || "?"}
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-[12px] font-medium text-stone-700 leading-tight">
                    {name.split(" ")[0]}
                  </span>
                  <span className="mt-0.5 text-[12px] font-normal text-stone-500 leading-none tracking-wider uppercase">
                    {role === "owner" ? "创始人" : role === "admin" ? "管理员" : "成员"}
                  </span>
                </div>
              </button>

            </div>
          </div>
        </div>
      </motion.nav>

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

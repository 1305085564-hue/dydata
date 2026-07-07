"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Wrench, Zap } from "lucide-react";
import { getNavItems } from "@/components/nav-bar-items";
import { AdminCenterNav } from "@/components/admin-layout/admin-top-nav";
import { WorkspacePicker } from "@/components/workspace-picker";
import { UnifiedCommandHub } from "@/components/unified-command-hub";
import { PremiumSettingsModal } from "@/components/premium-settings-modal";
import { cn } from "@/lib/utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import { useNotifications } from "@/components/notifications/notification-store";
import {
  initDashboardStore,
  getDashboardSnapshot,
  subscribeDashboardStore,
} from "@/lib/dashboard-store";

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
    const fetchPendingCount = async () => {
      try {
        const res = await fetch("/api/exemptions/pending", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setPendingApprovalsCount(typeof json.count === "number" ? json.count : json.data?.length ?? 0);
        }
      } catch (err) {
        console.error("Failed to fetch pending count:", err);
      }
    };
    fetchPendingCount();
  }, [isAdmin]);

  // Load real notification counts
  const { notifications: allNotifications } = useNotifications();
  const activeTodos = allNotifications.filter((n) => n.category === "todo" && n.status === "unread");
  const unreadAlerts = allNotifications.filter((n) => n.category !== "todo" && n.status === "unread");
  const totalAlertsCount = activeTodos.length + unreadAlerts.length;
  const approvalBadgeCount = isAdmin ? pendingApprovalsCount : 0;
  const bellBadgeCount = totalAlertsCount + approvalBadgeCount;

  const showAdminCenter = showAdmin;
  const isAdminPath =
    pathname.startsWith("/admin") &&
    !["/admin/settings", "/admin/modules", "/admin/ai-config"].some((p) =>
      pathname.startsWith(p)
    );
  const isOwner = role === "owner" || businessRole === "owner";

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

   const primaryLinkClass = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-semibold tracking-tight transition-all duration-200 ease-out",
      active ? "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300",
    );

  return (
    <>
      <motion.nav
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "py-2 bg-white/75 dark:bg-stone-950/75 backdrop-blur-xl border-stone-300/60 dark:border-stone-800/50 shadow-sm"
            : "py-4 bg-stone-100/50 dark:bg-stone-950/20 border-transparent"
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
                  <div className="text-xs font-black tracking-tight text-stone-950 dark:text-white uppercase leading-none">
                    DYData <span className="text-[#D97757] font-semibold text-[10px]">PREMIUM</span>
                  </div>
                  <div className="text-[9px] font-medium tracking-[0.18em] text-stone-500 dark:text-stone-600 uppercase leading-none mt-1">
                    短视频管理控制台
                  </div>
                </div>
              </Link>

              {/* Separator */}
              <div className="hidden lg:block h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />

              {/* Primary Navigation links / Admin secondary links depending on page url */}
              {isAdminPath ? (
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
                <div className="relative flex items-center bg-stone-200 dark:bg-stone-900 p-0.5 rounded-xl border border-stone-300/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                  <button
                    type="button"
                    onClick={() => {
                      if (isAdminPath) router.push("/dashboard");
                    }}
                    className={cn(
                      "relative z-10 px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors duration-200",
                      !isAdminPath ? "text-stone-900 dark:text-white" : "text-stone-600 hover:text-stone-700"
                    )}
                  >
                    {!isAdminPath && (
                      <motion.div
                        layoutId="activePerspectivePill"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute inset-0 bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-300/10"
                      />
                    )}
                    <span className="relative z-10">员工</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!isAdminPath) router.push("/admin/content");
                    }}
                    className={cn(
                      "relative z-10 px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors duration-200",
                      isAdminPath ? "text-stone-900 dark:text-white" : "text-stone-600 hover:text-stone-700"
                    )}
                  >
                    {isAdminPath && (
                      <motion.div
                        layoutId="activePerspectivePill"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute inset-0 bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-300/10"
                      />
                    )}
                    <span className="relative z-10">管理</span>
                  </button>
                </div>
              )}

              {/* Separator */}
              {showAdminCenter && <div className="hidden md:block h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />}

              {/* Workspace Selector (Visible only if accounts are loaded) */}
              {accounts.length > 0 && (
                <div className="hidden md:block shrink-0">
                  <WorkspacePicker accounts={accounts} selectedAccountId={selectedAccountId} />
                </div>
              )}

              {/* Separator */}
              <div className="hidden sm:block h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />

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
                      "text-stone-500 hover:text-[#D97757] dark:text-stone-400 dark:hover:text-[#D97757] active:scale-95",
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
                          "border-stone-200/80 dark:border-stone-800/80 dark:bg-stone-950 backdrop-blur-xl bg-white/95 dark:bg-stone-950/95"
                        )}
                      >
                        <div className="px-2.5 py-2 border-b border-stone-100 dark:border-stone-900 mb-1.5">
                          <div className="text-[12px] font-bold text-stone-900 dark:text-stone-100">
                            系统运行维护
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-stone-600 mt-1 leading-normal">
                            管理团队架构与 AI 模块
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <Link
                            href="/admin/modules"
                            prefetch={false}
                            onClick={() => setWrenchOpen(false)}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-900/40 transition-colors"
                          >
                            <span>团队与成员</span>
                          </Link>

                          {isOwner && (
                            <Link
                              href="/admin/ai-config"
                              prefetch={false}
                              onClick={() => setWrenchOpen(false)}
                              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-900/40 transition-colors"
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
                onClick={() => {
                  if (activeTodos.length > 0) {
                    setCommandHubTab("todos");
                  } else if (isAdmin && approvalBadgeCount > 0) {
                    setCommandHubTab("approvals");
                  } else {
                    setCommandHubTab("notifications");
                  }
                  setCommandHubOpen(true);
                }}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                  "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 active:scale-95"
                )}
                title="待办与通知中心"
              >
                <Bell className="size-4 stroke-[1.8]" />
                {bellBadgeCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#D97757] to-[#C9503B] px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-stone-950 tabular-nums">
                    {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
                  </span>
                )}
              </button>

              {/* User profile avatar info */}
              <div className="h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 text-left rounded-lg hover:opacity-85 focus:outline-none"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-[11px] font-black text-white dark:bg-stone-800 shadow-sm border border-stone-300/10">
                  {name.trim().slice(0, 1).toUpperCase() || "?"}
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-[10px] font-bold text-stone-800 dark:text-stone-200 leading-tight">
                    {name.split(" ")[0]}
                  </span>
                  <span className="text-[8px] font-semibold text-stone-500 leading-none mt-0.5 tracking-wider uppercase">
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

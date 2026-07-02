"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Settings, Zap } from "lucide-react";
import { getNavItems } from "@/components/nav-bar-items";
import { AdminCenterNav } from "@/components/admin-layout/admin-top-nav";
import { WorkspacePicker } from "@/components/workspace-picker";
import { UnifiedCommandHub } from "@/components/unified-command-hub";
import { PremiumSettingsModal } from "@/components/premium-settings-modal";
import { cn } from "@/lib/utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";
import { motion } from "framer-motion";
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
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "notifications">("todos");
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Load real notification counts
  const { notifications: allNotifications } = useNotifications();
  const activeTodos = allNotifications.filter((n) => n.category === "todo" && n.status === "unread");
  const unreadAlerts = allNotifications.filter((n) => n.category !== "todo" && n.status === "unread");
  const totalAlertsCount = activeTodos.length + unreadAlerts.length;

  const showAdminCenter = showAdmin;
  const isAdminPath = pathname.startsWith("/admin");

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  const primaryLinkClass = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-semibold tracking-tight transition-all duration-200 ease-out",
      active ? "bg-zinc-150 text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
    );

  return (
    <>
      <motion.nav
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out border-b pt-[max(env(safe-area-inset-top),0px)]",
          isScrolled
            ? "py-2 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-xl border-zinc-200/60 dark:border-zinc-800/50 shadow-sm"
            : "py-4 bg-zinc-50/50 dark:bg-zinc-950/20 border-transparent"
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
                <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20">
                  <Zap className="size-[18px] stroke-[2] fill-current" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-black tracking-tight text-zinc-950 dark:text-white uppercase leading-none">
                    DYData <span className="text-[#D97757] font-semibold text-[10px]">PREMIUM</span>
                  </div>
                  <div className="text-[9px] font-medium tracking-[0.18em] text-zinc-400 dark:text-zinc-500 uppercase leading-none mt-1">
                    短视频管理控制台
                  </div>
                </div>
              </Link>

              {/* Separator */}
              <div className="hidden lg:block h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

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
                          <Icon className={cn("size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-colors", active ? "text-[#D97757]" : "text-zinc-400")} />
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
                <div className="relative flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-200/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                  <button
                    type="button"
                    onClick={() => {
                      if (isAdminPath) router.push("/dashboard");
                    }}
                    className={cn(
                      "relative z-10 px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors duration-200",
                      !isAdminPath ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    {!isAdminPath && (
                      <motion.div
                        layoutId="activePerspectivePill"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200/10"
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
                      isAdminPath ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    {isAdminPath && (
                      <motion.div
                        layoutId="activePerspectivePill"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200/10"
                      />
                    )}
                    <span className="relative z-10">管理</span>
                  </button>
                </div>
              )}

              {/* Separator */}
              {showAdminCenter && <div className="hidden md:block h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800" />}

              {/* Workspace Selector (Visible only if accounts are loaded) */}
              {accounts.length > 0 && (
                <div className="hidden md:block shrink-0">
                  <WorkspacePicker accounts={accounts} selectedAccountId={selectedAccountId} />
                </div>
              )}

              {/* Separator */}
              <div className="hidden sm:block h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

              {/* Bell alert drawer button */}
              <button
                type="button"
                onClick={() => {
                  setCommandHubTab(activeTodos.length > 0 ? "todos" : "notifications");
                  setCommandHubOpen(true);
                }}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200",
                  "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 active:scale-95"
                )}
                title="待办与通知中心"
              >
                <Bell className="size-4 stroke-[1.8] text-zinc-500 dark:text-zinc-400" />
                {totalAlertsCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#D97757] to-[#C9503B] px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-zinc-950 tabular-nums">
                    {totalAlertsCount > 99 ? "99+" : totalAlertsCount}
                  </span>
                )}
              </button>

              {/* Settings gear trigger */}
              {showSystemSettings && (
                <Link
                  href="/admin/settings"
                  prefetch={false}
                  onMouseEnter={() => prefetchOnHover("/admin/settings")}
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200",
                    "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 active:scale-95",
                    pathname.startsWith("/admin/settings") && "border-zinc-400 bg-zinc-50 dark:border-zinc-650"
                  )}
                  title="网站参数设置"
                >
                  <Settings className="size-4 stroke-[1.8] text-zinc-500 dark:text-zinc-400" />
                </Link>
              )}

              {/* User profile avatar info */}
              <div className="h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800" />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 text-left rounded-lg hover:opacity-85 focus:outline-none"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-[11px] font-black text-white dark:bg-zinc-800 shadow-sm border border-zinc-200/10">
                  {name.trim().slice(0, 1).toUpperCase() || "?"}
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 leading-tight">
                    {name.split(" ")[0]}
                  </span>
                  <span className="text-[8px] font-semibold text-zinc-400 leading-none mt-0.5 tracking-wider uppercase">
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

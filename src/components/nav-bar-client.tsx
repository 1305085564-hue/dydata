"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, ListTodo, LogOut, Settings, Zap } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getNavItems } from "@/components/nav-bar-items";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AdminCenterNav } from "@/components/admin-layout/admin-top-nav";
import { TodayTodoDrawer } from "@/components/admin-layout/today-todo-drawer";
import { cn } from "@/lib/utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";
import {
  initDashboardStore,
  getDashboardSnapshot,
  subscribeDashboardStore,
  setDashboardAccount,
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

const ProfileEditDialog = dynamic(
  () => import("./profile-edit-dialog").then((mod) => mod.ProfileEditDialog),
  { ssr: false },
);

const TODO_POLL_MS = 120_000;

function useTodoCount(enabled: boolean, intervalMs = TODO_POLL_MS) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/sidebar-badges", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { cockpit?: number };
        if (active) setCount(json.cockpit ?? 0);
      } catch {}
    };
    void load();
    const id = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
  return enabled ? count : 0;
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
  const initial = name?.trim()?.slice(0, 1)?.toUpperCase() || "?";
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);

  const showAdminCenter = showAdmin;
  const todoCount = useTodoCount(showAdminCenter);

  const snapshot = useSyncExternalStore(subscribeDashboardStore, getDashboardSnapshot, getDashboardSnapshot);
  const selectedAccountId = snapshot.selectedAccountId || accounts[0]?.id || "";
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;

  useEffect(() => {
    if (accounts.length > 0) initDashboardStore({ accounts });
  }, [accounts]);

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-account-menu]")) setIsAccountMenuOpen(false);
    }
    if (isAccountMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isAccountMenuOpen]);

  const primaryLinkClass = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-[14px] font-medium tracking-tight transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] active:translate-y-0",
      active ? "bg-zinc-100 text-zinc-800" : "text-zinc-400 hover:bg-zinc-100/50 hover:text-zinc-700",
    );

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200/50 bg-zinc-50/80 backdrop-blur-md pt-[max(env(safe-area-inset-top),0px)]">
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-6">
          <div className="flex min-h-[var(--app-nav-height)] items-end gap-3 px-2 pb-2 sm:gap-4 sm:px-3.5">
            {/* 左：logo + 一级 tab 字链 */}
            <div className="flex min-w-0 shrink items-end gap-2.5 sm:gap-3">
              <Link
                href="/dashboard"
                prefetch={false}
                onMouseEnter={() => prefetchOnHover("/dashboard")}
                className="active:translate-y-0 inline-flex shrink-0 items-center gap-2 rounded-2xl border border-transparent px-1.5 py-1 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-white">
                  <Zap className="size-[18px] stroke-[1.5] fill-current" />
                </div>
                <div className="hidden min-w-0 sm:block">
                  <div className="text-[14px] font-semibold tracking-tight text-zinc-800">
                    DYData <span className="font-normal text-zinc-400">CNSL</span>
                  </div>
                  <div className="text-[11px] font-medium uppercase leading-none tracking-[0.25em] text-zinc-400">
                    短视频团队管理系统
                  </div>
                </div>
              </Link>

              {pathname.startsWith("/admin") ? (
                <div className="hidden min-w-0 items-center gap-1.5 md:flex">
                  <AdminCenterNav
                    userRole={role as UserRole}
                    businessRole={businessRole}
                    permissions={permissions}
                  />
                </div>
              ) : (
                <div
                  className="hidden min-w-0 items-center gap-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex"
                  aria-label="主导航"
                >
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onMouseEnter={() => prefetchOnHover(item.href)}
                      className={primaryLinkClass(item.match(pathname))}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}

              {/* 分隔线与视角切换胶囊 (仅管理员可见) */}
              {showAdminCenter && (
                <>
                  <div className="hidden h-4 w-[1px] bg-zinc-200/85 md:block" />
                  <div className="hidden items-center bg-zinc-200/50 p-0.5 rounded-lg md:flex shrink-0">
                    <Link
                      href="/dashboard"
                      prefetch={false}
                      className={cn(
                        "px-3.5 py-1 text-[12px] font-medium rounded-md transition-all duration-150 ease-out",
                        !pathname.startsWith("/admin")
                          ? "bg-white text-zinc-800 shadow-sm font-semibold"
                          : "text-zinc-500 hover:text-zinc-800"
                      )}
                    >
                      用户
                    </Link>
                    <Link
                      href="/admin/content"
                      prefetch={false}
                      className={cn(
                        "px-3.5 py-1 text-[12px] font-medium rounded-md transition-all duration-150 ease-out",
                        pathname.startsWith("/admin")
                          ? "bg-white text-zinc-800 shadow-sm font-semibold"
                          : "text-zinc-500 hover:text-zinc-800"
                      )}
                    >
                      管理
                    </Link>
                  </div>
                </>
              )}
            </div>

            {/* 右：用户区 → ⚙ 系统 → ☑ 待办 → 🔔 通知 → 退出 */}
            <div className="ml-auto flex shrink-0 items-end gap-2 sm:gap-2.5">
              {accounts.length > 1 ? (
                <div className="relative" data-account-menu>
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((open) => !open)}
                    className={cn(
                      "group flex items-center justify-between gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-2.5 py-1 transition-all duration-150 hover:bg-zinc-50 hover:border-zinc-300 shadow-[0_1px_3px_rgba(0,0,0,0.02)]",
                      isAccountMenuOpen && "border-zinc-300 bg-zinc-50"
                    )}
                    aria-expanded={isAccountMenuOpen}
                    aria-haspopup="listbox"
                  >
                    <div className="min-w-0 flex flex-col items-start text-left">
                      <span className="max-w-[90px] truncate text-[11px] font-semibold leading-tight text-zinc-900">
                        {name}
                      </span>
                      {selectedAccount && (
                        <span className="max-w-[100px] truncate text-[10px] font-medium leading-none text-zinc-500 mt-0.5 tracking-tight">
                          {selectedAccount.display_name}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={12}
                      className={cn(
                        "text-zinc-500 transition-transform shrink-0 ml-0.5",
                        isAccountMenuOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {isAccountMenuOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-sm"
                    >
                      <div className="px-2.5 py-1.5 text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
                        切换账号
                      </div>
                      <div className="max-h-64 space-y-0.5 overflow-y-auto">
                        {accounts.map((account) => {
                          const isSelected = account.id === selectedAccountId;
                          return (
                            <button
                              key={account.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setDashboardAccount(account.id);
                                setIsAccountMenuOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                                isSelected ? "bg-zinc-50 text-zinc-800" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium tracking-tight">{account.display_name}</span>
                                <span className={cn("mt-0.5 block truncate text-[12px]", isSelected ? "text-zinc-500" : "text-zinc-400")}>
                                  {account.content_direction ?? "未设置方向"}
                                </span>
                              </span>
                              {isSelected && <Check className="size-3.5 shrink-0 stroke-[1.5] text-[#D97757]" />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1 border-t border-zinc-100 pt-1">
                        <ProfileEditDialog currentName={name} role={role} accounts={accounts} trigger="menu-item">
                          <div className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800">
                            <Settings className="size-3.5 stroke-[1.5] shrink-0" />
                            <span>编辑资料</span>
                          </div>
                        </ProfileEditDialog>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <ProfileEditDialog currentName={name} role={role} accounts={accounts} trigger="menu-item">
                    <div className="group flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-2.5 py-1.5 transition-all duration-150 hover:bg-zinc-50 hover:border-zinc-300 shadow-[0_1px_3px_rgba(0,0,0,0.02)] cursor-pointer">
                      <div className="min-w-0 flex flex-col items-start text-left">
                        <span className="max-w-[90px] truncate text-[11px] font-semibold leading-tight text-zinc-900">
                          {name}
                        </span>
                        {selectedAccount && (
                          <span className="max-w-[100px] truncate text-[10px] font-medium leading-none text-zinc-500 mt-0.5 tracking-tight">
                            {selectedAccount.display_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </ProfileEditDialog>
                </div>
              )}

              {showSystemSettings && (
                <Link
                  href="/admin/settings"
                  prefetch={false}
                  onMouseEnter={() => prefetchOnHover("/admin/settings")}
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    pathname.startsWith("/admin/settings")
                      ? "border-zinc-200/80 bg-white text-zinc-800"
                      : "border-zinc-200/80 text-zinc-500 hover:bg-white hover:text-zinc-800",
                  )}
                  title="系统设置"
                >
                  <Settings className="size-3.5 stroke-[1.5]" />
                </Link>
              )}

              {showAdminCenter && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setTodoOpen(true)}
                  className="relative h-8 px-2.5 sm:px-2.5"
                  aria-label={todoCount > 0 ? `今日待办，${todoCount} 项` : "今日待办"}
                  title="今日待办"
                >
                  <ListTodo className="size-3.5 stroke-[1.5]" />
                  {todoCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[12px] font-medium leading-none text-white tabular-nums">
                      {todoCount > 99 ? "99+" : todoCount}
                    </span>
                  ) : null}
                </Button>
              )}

              <NotificationBell />

              <form action={signOut}>
                <Button variant="outline" size="sm" type="submit" className="h-8 px-2.5 sm:px-3">
                  <LogOut className="size-3.5 stroke-[1.5]" />
                  <span className="hidden sm:inline">退出</span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <TodayTodoDrawer open={todoOpen} onOpenChange={setTodoOpen} />
    </>
  );
}

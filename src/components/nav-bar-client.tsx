"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, LogOut, Settings, Zap } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getNavItems } from "@/components/nav-bar-items";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";
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
  showAdmin: boolean;
  showAiCopywriting?: boolean;
  showSystemSettings?: boolean;
  accounts?: Account[];
}

const ProfileEditDialog = dynamic(
  () => import("./profile-edit-dialog").then((mod) => mod.ProfileEditDialog),
  { ssr: false },
);

export function NavBarClient({ name, role, showAdmin, showAiCopywriting = true, showSystemSettings = false, accounts = [] }: NavBarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = useMemo(() => getNavItems({ showAdmin, showAiCopywriting, showSystemSettings }), [showAdmin, showAiCopywriting, showSystemSettings]);
  const initial = name?.trim()?.slice(0, 1)?.toUpperCase() || "?";
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const snapshot = useSyncExternalStore(subscribeDashboardStore, getDashboardSnapshot, getDashboardSnapshot);
  const selectedAccountId = snapshot.selectedAccountId || accounts[0]?.id || "";
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;

  useEffect(() => {
    if (accounts.length > 0) {
      initDashboardStore({ accounts });
    }
  }, [accounts]);

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) {
        router.prefetch(href);
      }
    },
    [pathname, router],
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-account-menu]")) {
        setIsAccountMenuOpen(false);
      }
    }
    if (isAccountMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isAccountMenuOpen]);

  const linkClass = (href: string, active = pathname === href) =>
    cn(
      "inline-flex h-8 shrink-0 items-center rounded-xl border px-3 text-[12px] font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
      active
        ? "border-zinc-200/80 bg-white text-zinc-800"
        : "border-transparent text-zinc-500 hover:bg-white hover:text-zinc-800 active:translate-y-0",
    );

  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-zinc-200 bg-[#FAFAFB] pt-[max(env(safe-area-inset-top),0px)]">
      <div className="mx-auto px-3 sm:px-6">
        <div className="flex min-h-[var(--app-nav-height)] items-center gap-3 px-2 py-2 sm:gap-4 sm:px-3.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              href="/dashboard"
              prefetch={false}
              onMouseEnter={() => prefetchOnHover("/dashboard")}
              className="active:translate-y-0 inline-flex shrink-0 items-center gap-2 rounded-2xl border border-transparent px-1.5 py-1 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-white">
                <Zap className="size-3.5 stroke-[1.5] fill-current" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <div className="text-[13px] font-semibold tracking-tight text-zinc-800">
                  DYData <span className="font-normal text-zinc-400">CNSL</span>
                </div>
                <div className="text-[10px] font-medium uppercase leading-none tracking-[0.25em] text-zinc-400">
                  短视频团队管理系统
                </div>
              </div>
            </Link>
            <div
              className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="主导航"
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onMouseEnter={() => prefetchOnHover(item.href)}
                  className={linkClass(item.href, item.match(pathname))}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            {accounts.length > 1 ? (
              <div className="relative" data-account-menu>
                <button
                  type="button"
                  onClick={() => setIsAccountMenuOpen((open) => !open)}
                  className="group flex items-center gap-2.5 rounded-2xl border border-zinc-200/80 px-2 py-1.5 transition-colors hover:border-zinc-200 hover:bg-white"
                  aria-expanded={isAccountMenuOpen}
                  aria-haspopup="listbox"
                >
                  <div className="hidden items-center gap-2 sm:flex">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-[12px] font-medium text-white ">
                      {initial}
                    </div>
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="max-w-24 truncate text-[12px] font-medium leading-none text-zinc-800">{name}</span>
                      {selectedAccount && (
                        <>
                          <span className="text-[12px] text-zinc-300">|</span>
                          <span className="max-w-28 truncate text-[11px] font-semibold leading-none text-zinc-500">{selectedAccount.display_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="max-w-24 truncate text-[12px] font-medium text-zinc-700 sm:hidden">
                    {name}
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-[12px] font-medium text-white sm:hidden">
                    {initial}
                  </div>
                  <ChevronDown
                    size={12}
                    className={cn(
                      "hidden text-zinc-400 transition-transform sm:block",
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
                              isSelected
                                ? "bg-zinc-50 text-zinc-800"
                                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium tracking-tight">{account.display_name}</span>
                              <span
                                className={cn(
                                  "mt-0.5 block truncate text-[12px]",
                                  isSelected ? "text-zinc-500" : "text-zinc-400",
                                )}
                              >
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
              <div className="flex items-center gap-2">
                <ProfileEditDialog currentName={name} role={role} accounts={accounts} trigger="menu-item">
                  <div className="group flex items-center gap-2 rounded-2xl border border-zinc-200/80 px-2 py-1.5 transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-200 hover:bg-white">
                    <div className="hidden items-center gap-2 sm:flex">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-[12px] font-medium text-white ">
                        {initial}
                      </div>
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="max-w-24 truncate text-[12px] font-medium leading-none text-zinc-800">{name}</span>
                        {selectedAccount && (
                          <>
                            <span className="text-[12px] text-zinc-300">|</span>
                            <span className="max-w-28 truncate text-[11px] font-semibold leading-none text-zinc-500">{selectedAccount.display_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="max-w-24 truncate text-[12px] font-medium text-zinc-700 sm:hidden">
                      {name}
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-[12px] font-medium text-white sm:hidden">
                      {initial}
                    </div>
                  </div>
                </ProfileEditDialog>
              </div>
            )}
            <NotificationBell />
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
            <form action={signOut}>
              <Button
                variant="outline"
                size="sm"
                type="submit"
                className="h-8 px-2.5 sm:px-3"
              >
                <LogOut className="size-3.5 stroke-[1.5]" />
                <span className="hidden sm:inline">退出</span>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}

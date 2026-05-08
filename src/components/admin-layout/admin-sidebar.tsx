"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Blocks,
  Bot,
  Gauge,
  Menu,
  Pencil,
  Sparkles,
  Video,
  FileText,
  X,
} from "lucide-react";

import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresOwner?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "中控总览", icon: Gauge },
  { href: "/admin/analytics", label: "经营分析", icon: BarChart3 },
  { href: "/admin/content", label: "内容管理", icon: FileText },
  { href: "/admin/videos", label: "视频管理", icon: Video },
  { href: "/admin/modules", label: "功能模块", icon: Blocks },
  { href: "/admin/ai-assistant", label: "AI助手", icon: Bot },
  { href: "/admin/ai-channels", label: "AI功能区", icon: Sparkles, requiresOwner: true },
  { href: "/admin/ai-rewrite", label: "文案改写", icon: Pencil, requiresOwner: true },
];

function getVisibleNavItems(userRole: UserRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requiresOwner) return userRole === "owner";
    return true;
  });
}

function getRoleLabel(role: UserRole | null | undefined): string {
  switch (role) {
    case "owner":
      return "创建人";
    case "admin":
      return "管理员";
    default:
      return "成员";
  }
}

interface AdminSidebarProps {
  userRole: UserRole | null | undefined;
  userName: string;
}

export function AdminSidebar({ userRole, userName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = getVisibleNavItems(userRole);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm lg:hidden"
        aria-label="打开导航"
      >
        <Menu className="size-5 text-zinc-950" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-zinc-200 bg-white transition-transform duration-300 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-5">
          <span className="text-sm font-black tracking-[0.12em] uppercase text-zinc-950">
            ADMIN
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-50 lg:hidden"
            aria-label="关闭导航"
          >
            <X className="size-4 text-zinc-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="后台导航">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-zinc-50 text-zinc-950"
                        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span
                      className={cn(
                        "absolute left-0 h-5 w-[3px] rounded-r-full bg-zinc-950 transition-opacity",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active ? "text-zinc-950" : "text-zinc-400 group-hover:text-zinc-600"
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: User */}
        <div className="border-t border-zinc-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-950">
                {userName}
              </p>
              <p className="text-xs text-zinc-400">{getRoleLabel(userRole)}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

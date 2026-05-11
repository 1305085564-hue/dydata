"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Blocks,
  Gauge,
  Menu,
  Sparkles,
  Target,
  Video,
  FileText,
  ShieldAlert,
  X,
} from "lucide-react";

import type { Permissions, UserRole } from "@/types";
import { hasPermission } from "@/lib/permission-utils";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresOwner?: boolean;
  requiresPermission?: keyof Permissions;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "中控台", icon: Gauge },
  { href: "/admin/analytics", label: "经营分析", icon: BarChart3 },
  { href: "/admin/videos", label: "视频资产", icon: Video },
  { href: "/admin/content", label: "内容复盘", icon: FileText },
  { href: "/admin/conversion-hub", label: "转化中心", icon: Target },
  { href: "/admin/violations", label: "违规复核", icon: ShieldAlert, requiresPermission: "manage_violations" },
  { href: "/admin/modules", label: "权限模块", icon: Blocks },
  { href: "/admin/ai-channels", label: "AI 配置中心", icon: Sparkles, requiresOwner: true },
];

function getVisibleNavItems(userRole: UserRole | null | undefined, permissions: Permissions): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requiresOwner) return userRole === "owner";
    if (item.requiresPermission) return hasPermission(userRole ?? "member", permissions, item.requiresPermission);
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
  permissions?: Permissions | null;
  userName: string;
}

export function AdminSidebar({ userRole, permissions, userName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = getVisibleNavItems(userRole, permissions ?? {});

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
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-zinc-50 active:translate-y-0 lg:hidden"
        aria-label="打开导航"
      >
        <Menu className="size-4 stroke-[1.5] text-zinc-800" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-zinc-200 bg-[#FAFAFB] transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-5">
          <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-zinc-400">
            ADMIN
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800 lg:hidden"
            aria-label="关闭导航"
          >
            <X className="size-4 stroke-[1.5]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="后台导航">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium tracking-tight transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] active:translate-y-0",
                      active
                        ? "bg-white text-zinc-800"
                        : "text-zinc-500 hover:bg-white hover:text-zinc-800"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[#D97757]"
                        aria-hidden
                      />
                    )}
                    <Icon
                      className={cn(
                        "size-4 shrink-0 stroke-[1.5] transition-[color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        active ? "text-zinc-800" : "text-zinc-400 group-hover:text-zinc-500"
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-medium text-zinc-500">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium tracking-tight text-zinc-800">
                {userName}
              </p>
              <p className="text-[12px] text-zinc-400">{getRoleLabel(userRole)}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

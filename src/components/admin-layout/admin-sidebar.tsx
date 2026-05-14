"use client";

import { useEffect, useState } from "react";
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
  X,
} from "lucide-react";

import type { Permissions, UserRole } from "@/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresOwner?: boolean;
  badgeKey?: keyof SidebarBadges;
}

type SidebarBadges = {
  cockpit: number;
  videos: number;
  content: number;
  conversion_hub: number;
  ai_channels: number;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "中控台", icon: Gauge, badgeKey: "cockpit" },
  { href: "/admin/analytics", label: "经营分析", icon: BarChart3 },
  { href: "/admin/videos", label: "视频资产", icon: Video, badgeKey: "videos" },
  { href: "/admin/content", label: "内容复盘", icon: FileText, badgeKey: "content" },
  { href: "/admin/conversion-hub", label: "转化中心", icon: Target, badgeKey: "conversion_hub" },
  { href: "/admin/modules", label: "权限模块", icon: Blocks },
  { href: "/admin/ai-channels", label: "AI 配置", icon: Sparkles, requiresOwner: true },
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

function useSidebarBadges(intervalMs = 30_000): SidebarBadges | null {
  const [data, setData] = useState<SidebarBadges | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/sidebar-badges", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as SidebarBadges;
        if (active) setData(json);
      } catch {}
    };
    void load();
    const id = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return data;
}

const AI_CHANNELS_CHANGED_EVENT = "ai-channels:changed";

interface AdminSidebarProps {
  userRole: UserRole | null | undefined;
  permissions?: Permissions | null;
  userName: string;
}

export function AdminSidebar({ userRole, userName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const badges = useSidebarBadges();
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
          "fixed inset-y-0 left-0 z-50 flex w-[170px] flex-col border-r border-zinc-200 bg-[#FAFAFB] transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
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
        <nav className="flex-1 px-2 pt-3 pb-2" aria-label="后台导航">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              const badgeValue = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2 overflow-hidden rounded-lg px-2.5 py-2 text-[12px] font-medium tracking-tight transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      active ? "bg-white text-zinc-800" : "text-zinc-500 hover:bg-white hover:text-zinc-800",
                    )}
                  >
                    {active && (
                      <span
                        className="absolute inset-y-1 left-0 w-[2px] rounded-r-full bg-[#D97757]"
                        aria-hidden
                      />
                    )}
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0 stroke-[1.5] transition-[color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        active ? "text-zinc-800" : "text-zinc-400 group-hover:text-zinc-500",
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badgeValue > 0 && (
                      <span
                        className={cn(
                          "min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold tabular-nums",
                          active
                            ? "bg-[#D97757]/10 text-[#D97757]"
                            : "bg-zinc-100 text-zinc-500 group-hover:bg-[#D97757]/10 group-hover:text-[#D97757]",
                        )}
                        aria-label={`${badgeValue} 条待办`}
                      >
                        {badgeValue > 99 ? "99+" : badgeValue}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: User */}
        <div className="border-t border-zinc-200 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-medium text-zinc-500">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium tracking-tight text-zinc-800">
                {userName}
              </p>
              <p className="text-[11px] text-zinc-400">{getRoleLabel(userRole)}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export const AI_CHANNELS_CHANGED = AI_CHANNELS_CHANGED_EVENT;

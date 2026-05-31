"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, Gauge, Video } from "lucide-react";

import type { Permissions, UserRole } from "@/types";
import type { BusinessRole } from "@/lib/business-role";
import { hasPermission } from "@/lib/permission-utils";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresOwner?: boolean;
  badgeKey?: keyof TopNavBadges;
  requiresManageMembers?: boolean;
  requiresPermission?: keyof Permissions;
}

type TopNavBadges = {
  cockpit: number;
  videos: number;
  content: number;
  conversion_hub: number;
  ai_channels: number;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "今日待办", icon: Gauge, badgeKey: "cockpit" },
  { href: "/admin/analytics", label: "经营分析", icon: BarChart3 },
  { href: "/admin/videos", label: "素材库", icon: Video, badgeKey: "videos" },
  { href: "/admin/content", label: "批改台", icon: FileText, badgeKey: "content" },
];

function getVisibleNavItems(input: {
  userRole: UserRole | null | undefined;
  businessRole: BusinessRole | null | undefined;
  permissions: Permissions;
}): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requiresOwner) return input.businessRole === "owner" || input.userRole === "owner";
    if (item.requiresManageMembers) {
      return (
        input.businessRole === "owner" ||
        input.businessRole === "team_admin" ||
        hasPermission(input.businessRole ?? "member", input.permissions, "manage_members")
      );
    }
    if (item.requiresPermission) {
      return hasPermission(input.businessRole ?? "member", input.permissions, item.requiresPermission);
    }
    return true;
  });
}

const TOP_NAV_BADGES_POLL_MS = 120_000;

function useTopNavBadges(intervalMs = TOP_NAV_BADGES_POLL_MS) {
  const [data, setData] = useState<TopNavBadges | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/sidebar-badges", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as TopNavBadges;
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

interface AdminTopNavProps {
  userRole: UserRole | null | undefined;
  businessRole?: BusinessRole | null;
  permissions?: Permissions | null;
}

export function AdminTopNav({ userRole, businessRole, permissions }: AdminTopNavProps) {
  const pathname = usePathname();
  const badges = useTopNavBadges();
  const items = getVisibleNavItems({ userRole, businessRole, permissions: permissions ?? {} });
  const navRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label="团队管理子导航"
      className="sticky top-0 z-30 border-b border-zinc-200 bg-white"
    >
      <div className="mx-auto flex h-11 max-w-[1400px] items-stretch overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex shrink-0 items-stretch">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const badgeValue = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
            return (
              <li key={item.href} className="flex shrink-0 items-stretch">
                <Link
                  ref={active ? activeRef : undefined}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative inline-flex items-center gap-2 px-4 text-[13px] tracking-tight transition-[color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    active
                      ? "font-semibold text-zinc-800"
                      : "font-medium text-zinc-500 hover:text-zinc-800 focus-visible:text-zinc-800",
                    "outline-none focus-visible:ring-0",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 stroke-[1.5] transition-[color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      active
                        ? "text-[#D97757]"
                        : "text-zinc-400 group-hover:text-zinc-600",
                    )}
                  />
                  <span className="whitespace-nowrap">{item.label}</span>
                  {badgeValue > 0 ? (
                    <span
                      className={cn(
                        "text-[11px] tabular-nums transition-[color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        active
                          ? "font-semibold text-[#D97757]"
                          : "font-medium text-zinc-400 group-hover:text-zinc-500",
                      )}
                      aria-label={`${badgeValue} 项待办`}
                    >
                      {badgeValue > 99 ? "99+" : badgeValue}
                    </span>
                  ) : null}

                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-[background-color,opacity,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      active
                        ? "bg-[#D97757] opacity-100 scale-x-100"
                        : "bg-zinc-300 opacity-0 scale-x-50 group-hover:opacity-50 group-hover:scale-x-90",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

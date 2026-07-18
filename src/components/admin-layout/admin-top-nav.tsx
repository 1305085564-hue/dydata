"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Permissions, UserRole } from "@/types";
import type { BusinessRole } from "@/lib/business-role";
import { hasPermission } from "@/lib/permission-utils";
import { cn } from "@/lib/utils";

import { FileEdit, Library, LineChart, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: keyof CenterNavBadges;
  requiresOwner?: boolean;
  requiresManageMembers?: boolean;
  requiresPermission?: keyof Permissions;
}

type CenterNavBadges = {
  cockpit: number;
  videos: number;
  content: number;
  conversion_hub: number;
  ai_channels: number;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/content", label: "视频复盘", icon: FileEdit, badgeKey: "content" },
  { href: "/admin/videos", label: "素材库", icon: Library, badgeKey: "videos" },
  { href: "/admin/analytics", label: "经营分析", icon: LineChart },
  { href: "/admin/fulfillment", label: "发布管理", icon: CalendarDays },
];

export function getVisibleNavItems(input: {
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

const CENTER_NAV_BADGES_POLL_MS = 120_000;

function useCenterNavBadges(intervalMs = CENTER_NAV_BADGES_POLL_MS) {
  const [data, setData] = useState<CenterNavBadges | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/sidebar-badges", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as CenterNavBadges;
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

interface AdminCenterNavProps {
  userRole: UserRole | null | undefined;
  businessRole?: BusinessRole | null;
  permissions?: Permissions | null;
}

export function AdminCenterNav({ userRole, businessRole, permissions }: AdminCenterNavProps) {
  const pathname = usePathname();
  const badges = useCenterNavBadges();
  const items = getVisibleNavItems({ userRole, businessRole, permissions: permissions ?? {} });

  const isActive = (href: string) => {
    if (href === "/admin/content") {
      return pathname === "/admin" || pathname === href || pathname.startsWith(`${href}/`);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  if (items.length === 0) return null;

  return (
    <nav aria-label="内容中心主导航" className="flex h-8 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(item.href);
          const badgeValue = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
          return (
            <li key={item.href} className="flex shrink-0 items-center">
              <Link
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium tracking-tight transition-all duration-200 ease-out active:translate-y-0",
                  active
                    ? "border border-stone-200 bg-white text-stone-900"
                    : "text-stone-500 hover:text-stone-700",
                )}
              >
                <item.icon
                  className={cn(
                    "size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-colors",
                    active ? "text-[#B4532F]" : "text-stone-500"
                  )}
                />
                <span className="whitespace-nowrap">{item.label}</span>
                {badgeValue > 0 ? (
                  <span
                    className={cn(
                      "ml-1.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[12px] font-medium tabular-nums transition-colors duration-150",
                      active
                        ? "bg-[#B4532F] text-white"
                        : "bg-stone-200/60 text-stone-500",
                    )}
                    aria-label={`${badgeValue} 项`}
                  >
                    {badgeValue > 99 ? "99+" : badgeValue}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Permissions, UserRole } from "@/types";
import type { BusinessRole } from "@/lib/business-role";
import { hasPermission } from "@/lib/permission-utils";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
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
  { href: "/admin/content", label: "批改台", badgeKey: "content" },
  { href: "/admin/videos", label: "素材库", badgeKey: "videos" },
  { href: "/admin/analytics", label: "经营分析" },
  { href: "/admin/fulfillment", label: "发布履约" },
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
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium tracking-tight transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] active:translate-y-0",
                  active
                    ? "bg-zinc-100 text-zinc-800 font-semibold"
                    : "text-zinc-400 hover:bg-zinc-100/50 hover:text-zinc-700",
                )}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {badgeValue > 0 ? (
                  <span
                    className={cn(
                      "text-[11px] tabular-nums transition-[color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                      active ? "font-semibold text-[#D97757]" : "font-medium text-zinc-400 group-hover:text-zinc-500",
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

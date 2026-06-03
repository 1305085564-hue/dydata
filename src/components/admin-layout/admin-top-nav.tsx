"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  const isActive = (href: string) => {
    if (href === "/admin/content") {
      return pathname === "/admin" || pathname === href || pathname.startsWith(`${href}/`);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const activeIndex = items.findIndex((item) => isActive(item.href));

  useLayoutEffect(() => {
    if (activeIndex < 0) return;
    const container = containerRef.current;
    const el = itemRefs.current[activeIndex];
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({
      left: elRect.left - containerRect.left,
      width: elRect.width,
    });
  }, [activeIndex, pathname]);

  const indicatorVisible = activeIndex >= 0 && indicator.width > 0;

  if (items.length === 0) return null;

  return (
    <nav aria-label="内容中心主导航" className="flex shrink-0 items-stretch">
      <ul ref={containerRef} className="relative flex shrink-0 items-stretch gap-1">
        {items.map((item, index) => {
          const active = index === activeIndex;
          const badgeValue = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
          return (
            <li key={item.href} className="flex shrink-0 items-stretch">
              <Link
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] tracking-tight transition-[color,background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:translate-y-0",
                  active
                    ? "font-semibold text-zinc-800"
                    : "font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/60 focus-visible:text-zinc-800",
                  "outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5",
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
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -bottom-2 h-[2px] rounded-full bg-[#D97757] transition-[transform,width,opacity] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
            indicatorVisible ? "opacity-100" : "opacity-0",
          )}
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width ? `${indicator.width}px` : 0,
          }}
        />
      </ul>
    </nav>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface AdminSecondaryNavItem {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  requiresAdmin?: boolean;
  hideWhenPrefixed?: boolean;
}

export const ADMIN_SECONDARY_NAV_ITEMS: AdminSecondaryNavItem[] = [
  {
    href: "/admin",
    label: "中控总览",
    match: (pathname) => pathname === "/admin",
    requiresAdmin: true,
  },
  {
    href: "/admin/analytics",
    label: "经营分析",
    match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
  },
  {
    href: "/admin/ai-channels",
    label: "AI 渠道",
    match: (pathname) => pathname === "/admin/ai-channels" || pathname.startsWith("/admin/ai-channels/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/ai-features",
    label: "AI 功能区",
    match: (pathname) => pathname === "/admin/ai-features" || pathname.startsWith("/admin/ai-features/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/ai-rewrite",
    label: "文案改写配置",
    match: (pathname) => pathname === "/admin/ai-rewrite" || pathname.startsWith("/admin/ai-rewrite/"),
    requiresAdmin: true,
    hideWhenPrefixed: true,
  },
];

export function getAdminSecondaryNavItems(options: { canManageAdmin: boolean }) {
  return ADMIN_SECONDARY_NAV_ITEMS.filter((item) => !item.requiresAdmin || options.canManageAdmin);
}

interface AdminSecondaryNavProps {
  pathname: string;
  canManageAdmin: boolean;
  className?: string;
  hrefPrefix?: string;
}

export function AdminSecondaryNav({ pathname, canManageAdmin, className, hrefPrefix = "" }: AdminSecondaryNavProps) {
  const items = getAdminSecondaryNavItems({ canManageAdmin }).filter(
    (item) => !(hrefPrefix && item.hideWhenPrefixed),
  );

  return (
    <nav className={cn("admin-subnav", className)} aria-label="后台二级导航">
      {items.map((item) => {
        const active = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={`${hrefPrefix}${item.href}`}
            aria-current={active ? "page" : undefined}
            className={cn("admin-subnav-link", active && "admin-subnav-link-active")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

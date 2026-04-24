import Link from "next/link";
import type { ComponentType } from "react";
import {
  BarChart3,
  Blocks,
  Gauge,
  Settings2,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminSecondaryNavItem {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "neutral";
  match: (pathname: string) => boolean;
  requiresAdmin?: boolean;
  hideWhenPrefixed?: boolean;
}

export const ADMIN_SECONDARY_NAV_ITEMS: AdminSecondaryNavItem[] = [
  {
    href: "/admin",
    label: "中控总览",
    description: "查看团队日报状态与关键待办",
    icon: Gauge,
    tone: "primary",
    match: (pathname) => pathname === "/admin",
    requiresAdmin: true,
  },
  {
    href: "/admin/analytics",
    label: "经营分析",
    description: "查看经营数据、视频表现和趋势",
    icon: BarChart3,
    tone: "success",
    match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
  },
  {
    href: "/admin/ai-channels",
    label: "AI 渠道",
    description: "管理模型渠道、策略切换和状态",
    icon: Waypoints,
    tone: "warning",
    match: (pathname) => pathname === "/admin/ai-channels" || pathname.startsWith("/admin/ai-channels/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/ai-features",
    label: "AI 功能区",
    description: "统一配置 AI 功能开关与可用范围",
    icon: Sparkles,
    tone: "neutral",
    match: (pathname) => pathname === "/admin/ai-features" || pathname.startsWith("/admin/ai-features/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/ai-rewrite",
    label: "文案改写配置",
    description: "调整改写模板、参数和输出规则",
    icon: Settings2,
    tone: "primary",
    match: (pathname) => pathname === "/admin/ai-rewrite" || pathname.startsWith("/admin/ai-rewrite/"),
    requiresAdmin: true,
    hideWhenPrefixed: true,
  },
  {
    href: "/admin/modules",
    label: "功能模块",
    description: "管理后台可用模块与账号可见配置",
    icon: Blocks,
    tone: "warning",
    match: (pathname) => pathname === "/admin/modules" || pathname.startsWith("/admin/modules/"),
    requiresAdmin: true,
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
    <nav className={cn("admin-subnav app-shell-metric-strip", className)} aria-label="后台二级导航">
      {items.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={`${hrefPrefix}${item.href}`}
            aria-current={active ? "page" : undefined}
            data-tone={item.tone}
            className={cn(
              "admin-subnav-link app-shell-metric dashboard-top-action-card",
              active && "admin-subnav-link-active",
            )}
          >
            <div className="admin-subnav-link-head dashboard-top-action-card-head">
              <span className="admin-subnav-link-icon dashboard-top-action-icon">
                <Icon className="size-4" />
              </span>
              <span className="admin-subnav-link-title dashboard-top-action-title">{item.label}</span>
            </div>
            <span className="admin-subnav-link-description app-shell-metric-hint">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}

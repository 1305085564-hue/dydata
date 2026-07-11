import Link from "next/link";
import type { ComponentType } from "react";
import { BarChart3, CalendarCheck, FileText, FolderOpen, Gauge } from "lucide-react";

import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

export type AdminPanelKey =
  | "overview"
  | "analytics"
  | "content"
  | "videos"
  | "fulfillment";

export interface AdminSecondaryNavItem {
  href: string;
  panel: AdminPanelKey;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "neutral";
  group?: "daily";
  match: (pathname: string) => boolean;
  requiresAdmin?: boolean;
  requiresManageMembers?: boolean;
  requiresOwner?: boolean;
  hideWhenPrefixed?: boolean;
}

export const ADMIN_SECONDARY_NAV_ITEMS: AdminSecondaryNavItem[] = [
  {
    href: "/admin",
    panel: "overview",
    label: "今日待办",
    description: "谁没交、谁待复盘、谁需要反馈，今天该处理的一眼看清。",
    icon: Gauge,
    tone: "primary",
    group: "daily",
    match: (pathname) => pathname === "/admin",
    requiresAdmin: true,
  },
  {
    href: "/admin/analytics",
    panel: "analytics",
    label: "经营分析",
    description: "查看经营数据、视频表现与趋势，快速定位重点信号。",
    icon: BarChart3,
    tone: "success",
    group: "daily",
    match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/content",
    panel: "content",
    label: "批改台",
    description: "异常作品复盘、内部分析和反馈下发。",
    icon: FileText,
    tone: "success",
    group: "daily",
    match: (pathname) => pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/videos",
    panel: "videos",
    label: "素材库",
    description: "原始视频、24h 快照、标签与异常状态管理。",
    icon: FolderOpen,
    tone: "neutral",
    group: "daily",
    match: (pathname) => pathname === "/admin/videos" || pathname.startsWith("/admin/videos/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/fulfillment",
    panel: "fulfillment",
    label: "发布履约",
    description: "谁没发、什么原因、本月履约全局一目了然。",
    icon: CalendarCheck,
    tone: "warning",
    group: "daily",
    match: (pathname) => pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/"),
    requiresAdmin: true,
  },
];
// Note: 转化中心、合规审核 已迁至 /violations 导粉中心下 perspective tabs。

export function getAdminSecondaryNavItems(options: {
  canManageAdmin: boolean;
  canManageMembers?: boolean;
  userRole?: UserRole | null;
  group?: "daily";
}) {
  return ADMIN_SECONDARY_NAV_ITEMS.filter((item) => {
    if (options.group && item.group !== options.group) return false;
    if (item.requiresManageMembers) {
      return options.userRole === "owner" || options.canManageMembers === true;
    }
    return !item.requiresAdmin || options.canManageAdmin;
  });
}

interface AdminSecondaryNavProps {
  pathname: string;
  canManageAdmin: boolean;
  canManageMembers?: boolean;
  className?: string;
  hrefPrefix?: string;
  panelBasePath?: string;
  userRole?: UserRole | null;
  renderMode?: "link" | "button";
  activePanel?: AdminPanelKey | null;
  groupFilter?: "daily";
  onItemSelect?: (item: AdminSecondaryNavItem) => void;
  onItemPreload?: (item: AdminSecondaryNavItem) => void;
}

function getCardClassName(active: boolean) {
  return cn(
    "admin-subnav-link dashboard-top-action-card group flex min-w-[220px] flex-1 shrink-0 flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-left transition-[background-color,border-color] duration-150 ease-out hover:border-[#D97757]/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-300 sm:min-w-[240px] xl:min-w-[200px]",
    active && "admin-subnav-link-active border-[#D97757]/50 bg-[#D97757]/5",
  );
}

export function AdminSecondaryNav({
  pathname,
  canManageAdmin,
  canManageMembers,
  className,
  hrefPrefix = "",
  panelBasePath,
  userRole,
  renderMode = "link",
  activePanel,
  groupFilter,
  onItemSelect,
  onItemPreload,
}: AdminSecondaryNavProps) {
  const items = getAdminSecondaryNavItems({ canManageAdmin, canManageMembers, userRole, group: groupFilter }).filter(
    (item) => !(hrefPrefix && item.hideWhenPrefixed),
  );

  return (
    <nav
      className={cn(
        "admin-subnav flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      aria-label="后台二级导航"
    >
      {items.map((item) => {
        const active = activePanel ? item.panel === activePanel : item.match(pathname);
        const Icon = item.icon;
        const content = (
          <>
            <div className="admin-subnav-link-head dashboard-top-action-card-head flex items-start gap-3">
              <span className="admin-subnav-link-icon dashboard-top-action-icon flex size-11 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-700 transition group-hover:border-[#D97757]/30 group-hover:text-[#D97757]">
                <Icon className="size-5" />
              </span>
              <span className="admin-subnav-link-title dashboard-top-action-title flex-1 pt-1 text-[18px] font-medium tracking-[-0.02em] text-stone-900">
                {item.label}
              </span>
            </div>
            <span className="admin-subnav-link-description app-shell-metric-hint text-[13px] font-normal leading-6 text-stone-500">
              {item.description}
            </span>
          </>
        );

        if (renderMode === "button") {
          return (
            <button
              key={item.href}
              type="button"
              aria-pressed={active}
              data-tone={item.tone}
              className={getCardClassName(active)}
              onClick={() => onItemSelect?.(item)}
              onMouseEnter={() => onItemPreload?.(item)}
              onFocus={() => onItemPreload?.(item)}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={item.href}
            href={
              panelBasePath
                ? item.panel === "overview"
                  ? panelBasePath
                  : `${panelBasePath}?panel=${item.panel}`
                : `${hrefPrefix}${item.href}`
            }
            prefetch={false}
            aria-current={active ? "page" : undefined}
            data-tone={item.tone}
            className={getCardClassName(active)}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

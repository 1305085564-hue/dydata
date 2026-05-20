import Link from "next/link";
import type { ComponentType } from "react";
import { BarChart3, FileText, FolderOpen, Gauge, ShieldAlert, Target } from "lucide-react";

import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

export type AdminPanelKey =
  | "overview"
  | "analytics"
  | "content"
  | "videos"
  | "conversion"
  | "violations";

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
  requiresOwner?: boolean;
  requiresConversionPermission?: boolean;
  requiresViolationPermission?: boolean;
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
    label: "内容复盘",
    description: "文案拆解、次日复盘、内容判断和下一步动作。",
    icon: FileText,
    tone: "success",
    group: "daily",
    match: (pathname) => pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/videos",
    panel: "videos",
    label: "视频素材",
    description: "原始视频、24h 快照、标签与异常状态管理。",
    icon: FolderOpen,
    tone: "neutral",
    group: "daily",
    match: (pathname) => pathname === "/admin/videos" || pathname.startsWith("/admin/videos/"),
    requiresAdmin: true,
  },
  {
    href: "/admin/conversion-hub",
    panel: "conversion",
    label: "转化中心",
    description: "把转化话术、违规风险、每周筛选和复核结论串成闭环。",
    icon: Target,
    tone: "success",
    group: "daily",
    match: (pathname) =>
      pathname === "/admin/conversion-hub" ||
      pathname.startsWith("/admin/conversion-hub/") ||
      pathname === "/admin/advice" ||
      pathname.startsWith("/admin/advice/") ||
      pathname === "/admin/guidance" ||
      pathname.startsWith("/admin/guidance/"),
    requiresConversionPermission: true,
  },
  {
    href: "/admin/violations",
    panel: "violations",
    label: "违规复核",
    description: "审核员工提交的违规/非违规案例。",
    icon: ShieldAlert,
    tone: "warning",
    group: "daily",
    match: (pathname) => pathname === "/admin/violations" || pathname.startsWith("/admin/violations/"),
    requiresViolationPermission: true,
  },
];

export function getAdminSecondaryNavItems(options: {
  canManageAdmin: boolean;
  canManageMembers?: boolean;
  canViewConversion?: boolean;
  canManageViolations?: boolean;
  userRole?: UserRole | null;
  group?: "daily";
}) {
  return ADMIN_SECONDARY_NAV_ITEMS.filter((item) => {
    if (options.group && item.group !== options.group) return false;
    if (item.requiresViolationPermission) {
      return options.userRole === "owner" || options.canManageViolations === true;
    }
    if (item.requiresConversionPermission) {
      return options.userRole === "owner" || options.canViewConversion === true || options.canManageViolations === true;
    }
    return !item.requiresAdmin || options.canManageAdmin;
  });
}

interface AdminSecondaryNavProps {
  pathname: string;
  canManageAdmin: boolean;
  canManageMembers?: boolean;
  canViewConversion?: boolean;
  canManageViolations?: boolean;
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
    "admin-subnav-link dashboard-top-action-card group flex min-w-[220px] flex-1 shrink-0 flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition duration-200 ease-out hover:border-[#D97757]/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5 sm:min-w-[240px] xl:min-w-[200px]",
    active && "admin-subnav-link-active border-[#D97757]/50 bg-[#D97757]/5 shadow-md",
  );
}

export function AdminSecondaryNav({
  pathname,
  canManageAdmin,
  canManageMembers,
  canViewConversion,
  canManageViolations,
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
  const items = getAdminSecondaryNavItems({ canManageAdmin, canManageMembers, canViewConversion, canManageViolations, userRole, group: groupFilter }).filter(
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
              <span className="admin-subnav-link-icon dashboard-top-action-icon flex size-11 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700 transition group-hover:border-[#D97757]/30 group-hover:text-[#D97757]">
                <Icon className="size-5" />
              </span>
              <span className="admin-subnav-link-title dashboard-top-action-title flex-1 pt-1 text-[18px] font-semibold tracking-[-0.02em] text-zinc-800">
                {item.label}
              </span>
            </div>
            <span className="admin-subnav-link-description app-shell-metric-hint text-sm leading-6 text-zinc-500">
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

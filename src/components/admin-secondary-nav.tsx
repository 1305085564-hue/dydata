import Link from "next/link";
import type { ComponentType } from "react";
import {
  BarChart3,
  Blocks,
  Gauge,
  Settings2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

export type AdminPanelKey =
  | "overview"
  | "analytics"
  | "ai-channels"
  | "ai-rewrite"
  | "modules"
  | "violations";

export interface AdminSecondaryNavItem {
  href: string;
  panel: AdminPanelKey;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "neutral";
  match: (pathname: string) => boolean;
  requiresAdmin?: boolean;
  requiresOwner?: boolean;
  requiresViolationPermission?: boolean;
  hideWhenPrefixed?: boolean;
}

export const ADMIN_SECONDARY_NAV_ITEMS: AdminSecondaryNavItem[] = [
  {
    href: "/admin",
    panel: "overview",
    label: "中控总览",
    description: "查看团队日报状态、关键待办和今日整体节奏。",
    icon: Gauge,
    tone: "primary",
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
    match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
  },
  {
    href: "/admin/ai-channels",
    panel: "ai-channels",
    label: "AI 功能区",
    description: "管理模型渠道、优先级切换、功能开关与提示词配置。",
    icon: Sparkles,
    tone: "warning",
    match: (pathname) => pathname === "/admin/ai-channels" || pathname.startsWith("/admin/ai-channels/") || pathname === "/admin/ai-features" || pathname.startsWith("/admin/ai-features/"),
    requiresOwner: true,
  },
  {
    href: "/admin/ai-rewrite",
    panel: "ai-rewrite",
    label: "文案改写配置",
    description: "维护改写模板、运行规则、路由与输出约束。",
    icon: Settings2,
    tone: "primary",
    match: (pathname) => pathname === "/admin/ai-rewrite" || pathname.startsWith("/admin/ai-rewrite/"),
    requiresOwner: true,
    hideWhenPrefixed: true,
  },
  {
    href: "/admin/violations",
    panel: "violations",
    label: "违规复核",
    description: "审核员工提交的违规/非违规案例。",
    icon: ShieldAlert,
    tone: "warning",
    match: (pathname) => pathname === "/admin/violations" || pathname.startsWith("/admin/violations/"),
    requiresViolationPermission: true,
  },
  {
    href: "/admin/modules",
    panel: "modules",
    label: "功能模块",
    description: "集中处理权限、数据修正、导出和审计日志。",
    icon: Blocks,
    tone: "warning",
    match: (pathname) => pathname === "/admin/modules" || pathname.startsWith("/admin/modules/"),
    requiresAdmin: true,
  },
];

export function getAdminSecondaryNavItems(options: {
  canManageAdmin: boolean;
  canManageViolations?: boolean;
  userRole?: UserRole | null;
}) {
  return ADMIN_SECONDARY_NAV_ITEMS.filter((item) => {
    if (item.requiresOwner) {
      return options.userRole === "owner";
    }
    if (item.requiresViolationPermission) {
      return options.userRole === "owner" || options.canManageViolations === true;
    }

    return !item.requiresAdmin || options.canManageAdmin;
  });
}

interface AdminSecondaryNavProps {
  pathname: string;
  canManageAdmin: boolean;
  canManageViolations?: boolean;
  className?: string;
  hrefPrefix?: string;
  panelBasePath?: string;
  userRole?: UserRole | null;
  renderMode?: "link" | "button";
  activePanel?: AdminPanelKey | null;
  onItemSelect?: (item: AdminSecondaryNavItem) => void;
  onItemPreload?: (item: AdminSecondaryNavItem) => void;
}

function getCardClassName(active: boolean) {
  return cn(
    "admin-subnav-link dashboard-top-action-card group flex min-w-[220px] flex-1 shrink-0 flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#D97757]/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/30 sm:min-w-[240px] xl:min-w-[200px]",
    active && "admin-subnav-link-active border-[#D97757]/50 bg-[#D97757]/5 shadow-md",
  );
}

export function AdminSecondaryNav({
  pathname,
  canManageAdmin,
  canManageViolations,
  className,
  hrefPrefix = "",
  panelBasePath,
  userRole,
  renderMode = "link",
  activePanel,
  onItemSelect,
  onItemPreload,
}: AdminSecondaryNavProps) {
  const items = getAdminSecondaryNavItems({ canManageAdmin, canManageViolations, userRole }).filter(
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
              <span className="admin-subnav-link-title dashboard-top-action-title flex-1 pt-1 text-base font-semibold tracking-[-0.02em] text-zinc-800">
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

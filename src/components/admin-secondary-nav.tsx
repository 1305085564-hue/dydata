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

import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

export type AdminPanelKey =
  | "overview"
  | "analytics"
  | "ai-channels"
  | "ai-features"
  | "ai-rewrite"
  | "modules";

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
    label: "AI 渠道",
    description: "管理模型渠道、优先级切换与渠道健康状态。",
    icon: Waypoints,
    tone: "warning",
    match: (pathname) => pathname === "/admin/ai-channels" || pathname.startsWith("/admin/ai-channels/"),
    requiresOwner: true,
  },
  {
    href: "/admin/ai-features",
    panel: "ai-features",
    label: "AI 功能区",
    description: "统一配置 AI 功能开关、模型、渠道和提示词。",
    icon: Sparkles,
    tone: "neutral",
    match: (pathname) => pathname === "/admin/ai-features" || pathname.startsWith("/admin/ai-features/"),
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
  userRole?: UserRole | null;
}) {
  return ADMIN_SECONDARY_NAV_ITEMS.filter((item) => {
    if (item.requiresOwner) {
      return options.userRole === "owner";
    }

    return !item.requiresAdmin || options.canManageAdmin;
  });
}

interface AdminSecondaryNavProps {
  pathname: string;
  canManageAdmin: boolean;
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
    "admin-subnav-link dashboard-top-action-card group flex min-w-[220px] flex-1 shrink-0 flex-col gap-3 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(244,248,255,0.92))] p-5 text-left shadow-[0_18px_48px_-28px_rgba(15,23,42,0.32)] backdrop-blur-[18px] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_22px_60px_-28px_rgba(37,99,235,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:min-w-[240px] xl:min-w-[200px]",
    active && "admin-subnav-link-active border-primary/40 bg-[linear-gradient(160deg,rgba(239,246,255,0.98),rgba(255,255,255,0.96))] shadow-[0_24px_70px_-32px_rgba(37,99,235,0.35)]",
  );
}

export function AdminSecondaryNav({
  pathname,
  canManageAdmin,
  className,
  hrefPrefix = "",
  panelBasePath,
  userRole,
  renderMode = "link",
  activePanel,
  onItemSelect,
  onItemPreload,
}: AdminSecondaryNavProps) {
  const items = getAdminSecondaryNavItems({ canManageAdmin, userRole }).filter(
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
              <span className="admin-subnav-link-icon dashboard-top-action-icon flex size-11 items-center justify-center rounded-2xl border border-white/70 bg-white/85 text-[var(--color-text-primary)] shadow-[var(--shadow-light)] transition group-hover:border-primary/20 group-hover:text-primary">
                <Icon className="size-5" />
              </span>
              <span className="admin-subnav-link-title dashboard-top-action-title flex-1 pt-1 text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                {item.label}
              </span>
            </div>
            <span className="admin-subnav-link-description app-shell-metric-hint text-sm leading-6 text-[var(--color-text-secondary)]">
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

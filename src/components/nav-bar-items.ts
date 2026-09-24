import {
  LayoutDashboard,
  Compass,
  Sparkles,
  FileEdit,
  CalendarDays,
  Lightbulb,
  UsersRound,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PermissionKey, Permissions } from "@/types";

export type NavSubItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  match: (pathname: string) => boolean;
};

export type NavGroup = {
  key: string;
  label: string;
  icon?: LucideIcon;
  href?: string;
  match?: (pathname: string) => boolean;
  children?: NavSubItem[];
};

export type NavItem = NavSubItem;

export type GetNavItemsInput = {
  showAdmin: boolean;
  showAiCopywriting?: boolean;
  showSystemSettings?: boolean;
  canAccessTeamManagement?: boolean;
  permissions?: Permissions | null;
};

function hasNavPermission(
  input: GetNavItemsInput,
  key: PermissionKey,
  fallback?: boolean,
) {
  if (input.permissions !== undefined && input.permissions !== null) {
    return input.permissions[key] === true;
  }
  return fallback === true;
}

export function getNavGroups(input: GetNavItemsInput): NavGroup[] {
  const shouldShowTeamManagement = hasNavPermission(
    input,
    "manage_members",
    input.canAccessTeamManagement,
  );

  const groups: NavGroup[] = [
    {
      key: "dashboard",
      label: "工作台",
      icon: LayoutDashboard,
      href: "/dashboard",
      match: (pathname) => pathname === "/dashboard",
    },
    {
      key: "topics",
      label: "选题库",
      icon: Lightbulb,
      href: "/topics",
      match: (pathname) => pathname === "/topics" || pathname.startsWith("/topics/"),
    },
  ];

  // 洞察分组：数据分析常驻，视频复盘与数据管理按权限追加
  const insightsChildren: NavSubItem[] = [
    {
      href: "/growth",
      label: "数据分析",
      icon: Compass,
      match: (pathname) => pathname === "/growth" || pathname.startsWith("/growth/"),
    },
  ];

  if (hasNavPermission(input, "review_content") || hasNavPermission(input, "manage_videos")) {
    insightsChildren.push({
      href: "/admin/content",
      label: "视频复盘",
      icon: FileEdit,
      match: (pathname) =>
        pathname === "/admin" || pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
    });
  }

  if (hasNavPermission(input, "view_analytics")) {
    insightsChildren.push({
      href: "/admin/collaboration",
      label: "数据管理",
      icon: UsersRound,
      match: (pathname) =>
        pathname === "/admin/collaboration" || pathname.startsWith("/admin/collaboration/"),
    });
  }

  if (insightsChildren.length > 0) {
    groups.push({
      key: "insights",
      label: "洞察",
      icon: Compass,
      children: insightsChildren,
    });
  }

  // 管理分组：发布管理、成员管理、AI 配置、系统设置
  const managementChildren: NavSubItem[] = [];

  if (hasNavPermission(input, "manage_fulfillment")) {
    managementChildren.push({
      href: "/admin/fulfillment",
      label: "发布管理",
      icon: CalendarDays,
      match: (pathname) => pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/"),
    });
  }

  if (shouldShowTeamManagement) {
    managementChildren.push({
      href: "/admin/modules",
      label: "成员管理",
      icon: UsersRound,
      match: (pathname) => pathname === "/admin/modules" || pathname.startsWith("/admin/modules/"),
    });
  }

  if (hasNavPermission(input, "manage_system", input.showSystemSettings)) {
    managementChildren.push(
      {
        href: "/admin/ai-config",
        label: "AI 配置",
        icon: Sparkles,
        match: (pathname) => pathname === "/admin/ai-config" || pathname.startsWith("/admin/ai-config/"),
      },
      {
        href: "/admin/settings",
        label: "系统设置",
        icon: Settings,
        match: (pathname) => pathname === "/admin/settings" || pathname.startsWith("/admin/settings/"),
      },
    );
  }

  if (managementChildren.length > 0) {
    groups.push({
      key: "management",
      label: "管理",
      icon: Settings,
      children: managementChildren,
    });
  }

  return groups;
}

/*
 * Keep the flat-item API for callers that build direct/mobile shortcuts.
 * The unified nav group structure above remains the source of truth.
 */
export function getNavItems(input: GetNavItemsInput): NavItem[] {
  const groups = getNavGroups(input);
  const items: NavItem[] = [];

  for (const group of groups) {
    if (group.href && group.match) {
      items.push({
        href: group.href,
        label: group.label,
        icon: group.icon,
        match: group.match,
      });
    } else if (group.children) {
      for (const child of group.children) {
        items.push(child);
      }
    }
  }

  return items;
}

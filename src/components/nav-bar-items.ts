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

  if (hasNavPermission(input, "review_content") || hasNavPermission(input, "manage_videos")) {
    groups.push({
      key: "video-review",
      label: "视频复盘",
      icon: FileEdit,
      href: "/admin/content",
      match: (pathname) =>
        pathname === "/admin" || pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
    });
  }

  if (hasNavPermission(input, "view_analytics")) {
    groups.push({
      key: "data-management",
      label: "数据管理",
      icon: UsersRound,
      href: "/admin/collaboration",
      match: (pathname) =>
        pathname === "/admin/collaboration" || pathname.startsWith("/admin/collaboration/"),
    });
  }

  // 管理中心保留业务入口，子项按各自权限单独显示；/growth 继续保持登录可见。
  const adminChildren: NavSubItem[] = [];
  if (hasNavPermission(input, "use_ai_copy", input.showAiCopywriting)) {
    adminChildren.push({
      href: "/content-tools/rewrite",
      label: "文案助手",
      icon: Sparkles,
      match: (pathname) =>
        pathname === "/content-tools/rewrite" || pathname.startsWith("/content-tools/rewrite/"),
    });
  }
  adminChildren.push({
    href: "/growth",
    label: "数据分析",
    icon: Compass,
    match: (pathname) => pathname === "/growth" || pathname.startsWith("/growth/"),
  });

  if (hasNavPermission(input, "manage_fulfillment")) {
    adminChildren.push({
      href: "/admin/fulfillment",
      label: "发布管理",
      icon: CalendarDays,
      match: (pathname) => pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/"),
    });
  }

  if (shouldShowTeamManagement) {
    adminChildren.push({
      href: "/admin/modules",
      label: "成员管理",
      icon: UsersRound,
      match: (pathname) => pathname === "/admin/modules" || pathname.startsWith("/admin/modules/"),
    });
  }

  if (hasNavPermission(input, "manage_system", input.showSystemSettings)) {
    adminChildren.push(
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

  // 数据分析(/growth)对全体登录用户常驻 ⇒ adminChildren 恒非空 ⇒ 管理中心始终可见。
  // 此守卫是防御性写法（当前永不隐藏管理中心），保留以防将来移除 /growth 常驻时误露空分组。
  if (adminChildren.length > 0) {
    groups.push({
      key: "admin-center",
      label: "管理中心",
      icon: Settings,
      children: adminChildren,
    });
  }

  return groups;
}

/*
 * Keep the old flat-item API for callers that build direct/mobile shortcuts.
 * Group membership is intentionally not exposed here; the unified nav group
 * structure above remains the source of truth for desktop and mobile.
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

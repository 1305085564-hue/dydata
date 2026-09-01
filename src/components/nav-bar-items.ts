import {
  LayoutDashboard,
  Compass,
  Sparkles,
  FileEdit,
  Library,
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

  // 内容中心只展示当前账号真实有权限使用的页面。
  const contentChildren: NavSubItem[] = [];
  if (hasNavPermission(input, "use_ai_copy", input.showAiCopywriting)) {
    contentChildren.push({
      href: "/content-tools/rewrite",
      label: "文案助手",
      icon: Sparkles,
      match: (pathname) =>
        pathname === "/content-tools/rewrite" || pathname.startsWith("/content-tools/rewrite/"),
    });
  }
  if (hasNavPermission(input, "review_content")) {
    contentChildren.push({
      href: "/admin/content",
      label: "视频复盘",
      icon: FileEdit,
      match: (pathname) =>
        pathname === "/admin" || pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
    });
  }
  if (hasNavPermission(input, "manage_videos")) {
    contentChildren.push({
      href: "/admin/videos",
      label: "素材库",
      icon: Library,
      match: (pathname) => pathname === "/admin/videos" || pathname.startsWith("/admin/videos/"),
    });
  }

  if (contentChildren.length > 0) {
    groups.push({
      key: "content-center",
      label: "内容中心",
      icon: Sparkles,
      children: contentChildren,
    });
  }

  // /growth 保持登录可见；岗位管理需要 view_analytics。
  const dataChildren: NavSubItem[] = [
    {
      href: "/growth",
      label: "数据分析",
      icon: Compass,
      match: (pathname) => pathname === "/growth" || pathname.startsWith("/growth/"),
    },
  ];
  if (hasNavPermission(input, "view_analytics")) {
    dataChildren.push({
      href: "/admin/collaboration",
      label: "岗位管理",
      icon: UsersRound,
      match: (pathname) =>
        pathname === "/admin/collaboration" || pathname.startsWith("/admin/collaboration/"),
    });
  }

  groups.push({
    key: "data-center",
    label: "数据中心",
    icon: Compass,
    children: dataChildren,
  });

  const adminChildren: NavSubItem[] = [];
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
        href: "/admin/settings",
        label: "系统设置",
        icon: Settings,
        match: (pathname) => pathname === "/admin/settings" || pathname.startsWith("/admin/settings/"),
      },
      {
        href: "/admin/ai-config",
        label: "AI 配置",
        icon: Sparkles,
        match: (pathname) => pathname === "/admin/ai-config" || pathname.startsWith("/admin/ai-config/"),
      },
    );
  }

  if (hasNavPermission(input, "manage_fulfillment")) {
    adminChildren.push({
      href: "/admin/fulfillment",
      label: "发布管理",
      icon: CalendarDays,
      match: (pathname) => pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/"),
    });
  }

  if (input.showAdmin && adminChildren.length > 0) {
    groups.push({
      key: "admin-center",
      label: "管理中心",
      icon: Settings,
      children: adminChildren,
    });
  }

  return groups;
}

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

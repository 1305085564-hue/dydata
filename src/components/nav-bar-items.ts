import {
  LayoutDashboard,
  Compass,
  Sparkles,
  FileEdit,
  Library,
  LineChart,
  CalendarDays,
  Lightbulb,
  UsersRound,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BusinessRole } from "@/lib/business-role";
import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

export type NavSubItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  match: (pathname: string) => boolean;
  badgeKey?: "content" | "videos";
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
  userRole?: UserRole | null;
  businessRole?: BusinessRole | null;
  permissions?: Permissions | null;
};

export function getNavGroups(input: GetNavItemsInput): NavGroup[] {
  const role = input.businessRole ?? input.userRole ?? (input.showAdmin ? "admin" : "member");
  const permissions = input.permissions ?? {};

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

  // 3. 内容中心 (分组下拉)
  const contentChildren: NavSubItem[] = [];

  if (input.showAiCopywriting !== false) {
    contentChildren.push({
      href: "/content-tools/rewrite",
      label: "文案助手",
      icon: Sparkles,
      match: (pathname) =>
        pathname === "/content-tools/rewrite" || pathname.startsWith("/content-tools/rewrite/"),
    });
  }

  if (input.showAdmin) {
    if (
      role === "owner" ||
      hasPermission(role, permissions, "view_content_review") ||
      hasPermission(role, permissions, "view_analytics")
    ) {
      contentChildren.push({
        href: "/admin/content",
        label: "视频复盘",
        icon: FileEdit,
        badgeKey: "content",
        match: (pathname) =>
          pathname === "/admin" || pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
      });
    }

    if (
      role === "owner" ||
      hasPermission(role, permissions, "manage_video_assets") ||
      hasPermission(role, permissions, "view_analytics")
    ) {
      contentChildren.push({
        href: "/admin/videos",
        label: "素材库",
        icon: Library,
        badgeKey: "videos",
        match: (pathname) => pathname === "/admin/videos" || pathname.startsWith("/admin/videos/"),
      });
    }

    if (
      role === "owner" ||
      role === "team_admin" ||
      role === "group_leader" ||
      hasPermission(role, permissions, "view_analytics") ||
      hasPermission(role, permissions, "view_all_data")
    ) {
      contentChildren.push({
        href: "/admin/fulfillment",
        label: "发布管理",
        icon: CalendarDays,
        match: (pathname) => pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/"),
      });
    }
  }

  if (contentChildren.length > 0) {
    groups.push({
      key: "content-center",
      label: "内容中心",
      icon: Sparkles,
      children: contentChildren,
    });
  }

  // 4. 数据中心 (分组下拉)
  const dataChildren: NavSubItem[] = [
    {
      href: "/growth",
      label: "数据分析",
      icon: Compass,
      match: (pathname) => pathname === "/growth" || pathname.startsWith("/growth/"),
    },
  ];

  if (input.showAdmin) {
    if (
      role === "owner" ||
      hasPermission(role, permissions, "view_analytics") ||
      hasPermission(role, permissions, "view_all_data")
    ) {
      dataChildren.push({
        href: "/admin/analytics",
        label: "经营分析",
        icon: LineChart,
        match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
      });
    }
  }

  if (dataChildren.length > 0) {
    groups.push({
      key: "data-center",
      label: "数据中心",
      icon: Compass,
      children: dataChildren,
    });
  }

  // 5. 管理中心 (分组下拉)
  const adminChildren: NavSubItem[] = [];

  if (input.showAdmin) {
    if (
      role === "owner" ||
      role === "team_admin" ||
      hasPermission(role, permissions, "manage_members")
    ) {
      adminChildren.push({
        href: "/admin/modules",
        label: "成员管理",
        icon: UsersRound,
        match: (pathname) => pathname === "/admin/modules" || pathname.startsWith("/admin/modules/"),
      });
    }

    if (input.showSystemSettings) {
      adminChildren.push({
        href: "/admin/settings",
        label: "系统维护",
        icon: Settings,
        match: (pathname) => pathname === "/admin/settings" || pathname.startsWith("/admin/settings/"),
      });
    }

    if (role === "owner") {
      adminChildren.push({
        href: "/admin/ai-config",
        label: "AI 配置",
        icon: Sparkles,
        match: (pathname) => pathname === "/admin/ai-config" || pathname.startsWith("/admin/ai-config/"),
      });
    }
  }

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


import { LayoutDashboard, Compass, Sparkles, FileEdit, Library, LineChart, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BusinessRole } from "@/lib/business-role";
import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

export type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  match: (pathname: string) => boolean;
  badgeKey?: "content" | "videos";
};

export function getNavItems(input: {
  showAdmin: boolean;
  showAiCopywriting?: boolean;
  showSystemSettings?: boolean;
  userRole?: UserRole | null;
  businessRole?: BusinessRole | null;
  permissions?: Permissions | null;
}): NavItem[] {
  const role = input.businessRole ?? input.userRole ?? (input.showAdmin ? "admin" : "member");
  const permissions = input.permissions ?? {};
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "今日工作台",
      icon: LayoutDashboard,
      match: (pathname) => pathname === "/dashboard",
    },
    {
      href: "/growth",
      label: "成长大盘",
      icon: Compass,
      match: (pathname) => pathname === "/growth",
    },
  ];

  if (input.showAiCopywriting !== false) {
    items.push({
      href: "/content-tools/rewrite",
      label: "文案助手",
      icon: Sparkles,
      match: (pathname) => pathname === "/content-tools/rewrite" || pathname.startsWith("/content-tools/rewrite/"),
    });
  }

  if (input.showAdmin) {
    if (
      role === "owner" ||
      hasPermission(role, permissions, "view_content_review") ||
      hasPermission(role, permissions, "view_analytics")
    ) {
      items.push({
        href: "/admin/content",
        label: "视频复盘",
        icon: FileEdit,
        badgeKey: "content",
        match: (pathname) => pathname === "/admin" || pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
      });
    }

    if (
      role === "owner" ||
      hasPermission(role, permissions, "manage_video_assets") ||
      hasPermission(role, permissions, "view_analytics")
    ) {
      items.push({
        href: "/admin/videos",
        label: "素材库",
        icon: Library,
        badgeKey: "videos",
        match: (pathname) => pathname === "/admin/videos" || pathname.startsWith("/admin/videos/"),
      });
    }

    if (
      role === "owner" ||
      hasPermission(role, permissions, "view_analytics") ||
      hasPermission(role, permissions, "view_all_data")
    ) {
      items.push({
        href: "/admin/analytics",
        label: "经营分析",
        icon: LineChart,
        match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
      });
    }

    if (
      role === "owner" ||
      role === "team_admin" ||
      role === "group_leader" ||
      hasPermission(role, permissions, "view_analytics") ||
      hasPermission(role, permissions, "view_all_data")
    ) {
      items.push({
        href: "/admin/fulfillment",
        label: "发布履约",
        icon: CalendarDays,
        match: (pathname) => pathname === "/admin/fulfillment" || pathname.startsWith("/admin/fulfillment/"),
      });
    }
  }

  return items;
}

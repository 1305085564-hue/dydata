import { LayoutDashboard, Compass, Sparkles, FileEdit, Library, LineChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
}): NavItem[] {
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
    items.push(
      {
        href: "/admin/content",
        label: "视频复盘",
        icon: FileEdit,
        badgeKey: "content",
        match: (pathname) => pathname === "/admin" || pathname === "/admin/content" || pathname.startsWith("/admin/content/"),
      },
      {
        href: "/admin/videos",
        label: "素材库",
        icon: Library,
        badgeKey: "videos",
        match: (pathname) => pathname === "/admin/videos" || pathname.startsWith("/admin/videos/"),
      },
      {
        href: "/admin/analytics",
        label: "经营分析",
        icon: LineChart,
        match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
      }
    );
  }

  return items;
}

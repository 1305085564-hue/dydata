import { LayoutDashboard, Compass, ShieldAlert, Video, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  match: (pathname: string) => boolean;
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
      label: "个人成长",
      icon: Compass,
      match: (pathname) => pathname === "/growth",
    },
    {
      href: "/violations",
      label: "导粉中心",
      icon: ShieldAlert,
      match: (pathname) => pathname.startsWith("/violations"),
    },
    {
      href: "/video-review",
      label: "视频审核",
      icon: Video,
      match: (pathname) => pathname.startsWith("/video-review"),
    },
  ];

  if (input.showAiCopywriting !== false) {
    items.push({
      href: "/content-tools/rewrite",
      label: "文案助手",
      icon: Sparkles,
      match: (pathname) => pathname === "/content-tools/rewrite",
    });
  }

  if (input.showAdmin) {
    items.push({
      href: "/admin/content",
      label: "内容中心",
      icon: LayoutDashboard,
      match: (pathname) => pathname.startsWith("/admin"),
    });
  }

  return items;
}

import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  match: (pathname: string) => boolean;
};

export function getNavItems(input: { showAdmin: boolean; showAiCopywriting?: boolean; showSystemSettings?: boolean }): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "今日工作台",
      match: (pathname) => pathname === "/dashboard",
    },
    {
      href: "/growth",
      label: "个人成长",
      match: (pathname) => pathname === "/growth",
    },
    {
      href: "/violations",
      label: "话术案例库",
      match: (pathname) => pathname.startsWith("/violations"),
    },
  ];

  if (input.showAiCopywriting !== false) {
    items.push({
      href: "/content-tools/rewrite",
      label: "文案助手",
      match: (pathname) => pathname === "/content-tools/rewrite",
    });
  }

  if (input.showAdmin) {
    items.push({
      href: "/admin",
      label: "团队管理",
      match: (pathname) => pathname === "/admin" || (pathname.startsWith("/admin/") && !pathname.startsWith("/admin/settings")),
    });
  }

  return items;
}

export type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

export function getNavItems(input: { showAdmin: boolean }): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "数据填报",
      match: (pathname) => pathname === "/dashboard",
    },
    {
      href: "/growth",
      label: "成长分析",
      match: (pathname) => pathname === "/growth",
    },
    {
      href: "/violations",
      label: "违规库",
      match: (pathname) => pathname.startsWith("/violations"),
    },
    {
      href: "/content-tools/rewrite",
      label: "AI助手",
      match: (pathname) => pathname === "/content-tools/rewrite",
    },
  ];

  if (input.showAdmin) {
    items.push({
      href: "/admin",
      label: "后台管理",
      match: (pathname) => pathname === "/admin" || pathname.startsWith("/admin/"),
    });
  }

  return items;
}

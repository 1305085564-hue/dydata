export type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

export function getNavItems(input: { showAnalytics: boolean; showAdmin: boolean }): NavItem[] {
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
      href: "/content-tools/rewrite",
      label: "AI助手",
      match: (pathname) => pathname === "/content-tools/rewrite",
    },
  ];

  if (input.showAnalytics) {
    items.push({
      href: "/analytics",
      label: "爆款分析",
      match: (pathname) => pathname === "/analytics",
    });
  }

  if (input.showAdmin) {
    items.push(
      {
        href: "/admin/content",
        label: "内容管理",
        match: (pathname) => pathname.startsWith("/admin/content"),
      },
      {
        href: "/admin",
        label: "后台管理",
        match: (pathname) => pathname === "/admin",
      }
    );
  }

  return items;
}

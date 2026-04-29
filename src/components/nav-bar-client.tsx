"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getNavItems } from "@/components/nav-bar-items";
import { cn } from "@/lib/utils";

interface NavBarClientProps {
  name: string;
  showAdmin: boolean;
  showAnalytics: boolean;
}

export function NavBarClient({ name, showAdmin, showAnalytics }: NavBarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = useMemo(() => getNavItems({ showAnalytics, showAdmin }), [showAdmin, showAnalytics]);

  useEffect(() => {
    for (const item of navItems) {
      if (item.href !== pathname) {
        router.prefetch(item.href);
      }
    }
  }, [navItems, pathname, router]);

  const linkClass = (href: string, active = pathname === href) =>
    cn(
      "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
      active
        ? "border border-primary/20 bg-primary/12 text-primary shadow-[var(--shadow-light)]"
        : "border border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/75 hover:text-foreground hover:-translate-y-px",
    );

  return (
    <nav className="app-toolbar glass-nav fixed inset-x-0 top-0 z-40 pt-[max(env(safe-area-inset-top),0px)]">
      <div className="mx-auto px-3 sm:px-6">
        <div className="app-toolbar-inner flex min-h-[var(--app-nav-height)] items-center gap-3 px-3 py-2 sm:gap-4 sm:px-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-transparent px-1.5 py-1 transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:-translate-y-px hover:bg-background/70"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius-button)-2px)] border border-primary/25 bg-[linear-gradient(180deg,rgba(10,132,255,0.18),rgba(10,132,255,0.1))] text-[11px] font-semibold tracking-[0.12em] text-primary shadow-[var(--shadow-light)]">
                DY
              </div>
              <div className="hidden min-w-0 sm:block">
                <div className="text-sm font-semibold tracking-tight text-foreground">DYData</div>
                <div className="text-[11px] leading-none text-muted-foreground">统一后台视图</div>
              </div>
            </Link>
            <div
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-border/65 bg-background/55 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="主导航"
            >
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.href, item.match(pathname))}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 sm:flex">
              <span className="size-2 rounded-full bg-[var(--color-success)] shadow-[0_0_0_4px_rgba(52,199,89,0.12)]" aria-hidden />
              <span className="max-w-28 truncate text-sm text-muted-foreground">
                {name}
              </span>
            </div>
            <span className="sm:hidden max-w-28 truncate text-sm text-muted-foreground">
              {name}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary sm:hidden">
              {name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit" className="h-7 rounded-full">
                退出
              </Button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}

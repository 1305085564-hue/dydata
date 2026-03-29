"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getNavItems } from "@/components/nav-bar-items";

interface NavBarClientProps {
  name: string;
  showAdmin: boolean;
  showAnalytics: boolean;
}

export function NavBarClient({ name, showAdmin, showAnalytics }: NavBarClientProps) {
  const pathname = usePathname();

  const linkClass = (href: string, active = pathname === href) =>
    `inline-flex h-8 shrink-0 items-center rounded-[calc(var(--radius-button)-1px)] px-3 text-sm font-medium transition-[background-color,color,box-shadow,border-color] duration-[var(--duration-fast)] ${
      active
        ? "border border-primary/20 bg-primary/12 text-primary shadow-[var(--shadow-light)]"
        : "border border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/70 hover:text-foreground"
    }`;

  return (
    <nav className="app-toolbar fixed inset-x-0 top-0 z-40 pt-[max(env(safe-area-inset-top),0px)]">
      <div className="mx-auto px-3 sm:px-6">
        <div className="app-toolbar-inner flex h-[var(--app-nav-height)] items-center gap-2 px-2.5 sm:gap-3 sm:px-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Link href="/dashboard" className="flex shrink-0 items-center gap-2 rounded-[var(--radius-button)] px-1.5 py-1 transition-colors hover:bg-background/70">
              <div className="flex h-7 w-7 items-center justify-center rounded-[calc(var(--radius-button)-2px)] border border-primary/25 bg-primary/12 text-[11px] font-semibold tracking-wide text-primary">
                DY
              </div>
              <span className="text-sm font-semibold tracking-tight">DYData</span>
            </Link>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-[var(--radius-button)] border border-border/65 bg-background/55 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {getNavItems({ showAnalytics, showAdmin }).map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.href, item.match(pathname))}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <span className="hidden max-w-28 truncate text-sm text-muted-foreground sm:inline">
              {name}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary sm:hidden">
              {name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit" className="h-7">
                退出
              </Button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}

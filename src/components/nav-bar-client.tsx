"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

interface NavBarClientProps {
  name: string;
  showAdmin: boolean;
  showAnalytics: boolean;
}

export function NavBarClient({ name, showAdmin, showAnalytics }: NavBarClientProps) {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `rounded-md px-3 py-1.5 transition-colors ${
      pathname === href
        ? "bg-primary/10 text-primary font-medium"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b bg-background/90 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-[var(--app-nav-height)] max-w-5xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              DY
            </div>
            <span className="text-sm font-semibold">DYData</span>
          </Link>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/dashboard" className={linkClass("/dashboard")}>
              数据填报
            </Link>
            <Link href="/growth" className={linkClass("/growth")}>
              成长分析
            </Link>
            {showAnalytics && (
              <Link href="/analytics" className={linkClass("/analytics")}>
                爆款分析
              </Link>
            )}
            {showAdmin && (
              <Link href="/admin" className={linkClass("/admin")}>
                管理后台
              </Link>
            )}
            {showAdmin && (
              <Link
                href="/admin/content"
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  pathname.startsWith("/admin/content")
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                内容管理
              </Link>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {name}
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary sm:hidden">
            {name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              退出
            </Button>
          </form>
        </div>
      </div>
    </nav>
  );
}

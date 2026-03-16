"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

interface NavBarClientProps {
  name: string;
  isAdmin: boolean;
}

export function NavBarClient({ name, isAdmin }: NavBarClientProps) {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `rounded-md px-3 py-1.5 transition-colors ${
      pathname === href
        ? "bg-primary/10 text-primary font-medium"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              DY
            </div>
            <span className="font-semibold text-sm">DYData</span>
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <Link href="/dashboard" className={linkClass("/dashboard")}>
              数据填报
            </Link>
            {isAdmin && (
              <Link href="/admin" className={linkClass("/admin")}>
                管理后台
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/analytics" className={linkClass("/admin/analytics")}>
                数据分析
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{name}</span>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutPanelTop, Lock, LogOut, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const demoNavItems = [
  {
    href: "/demo/dashboard",
    label: "今日工作台",
    match: (pathname: string) => pathname === "/demo/dashboard",
  },
  {
    href: "/demo/growth",
    label: "个人成长",
    match: (pathname: string) => pathname === "/demo/growth",
  },

  {
    href: "/demo/admin/content",
    label: "内容管理",
    match: (pathname: string) => pathname.startsWith("/demo/admin/content"),
  },
  {
    href: "/demo/admin/ai-assistant",
    label: "文案助手",
    match: (pathname: string) => pathname.startsWith("/demo/admin/ai-assistant"),
  },
  {
    href: "/demo/admin",
    label: "团队管理",
    match: (pathname: string) =>
      pathname === "/demo/admin" ||
      pathname.startsWith("/demo/admin/analytics") ||
      pathname.startsWith("/demo/admin/ai-channels"),
  },
];

export function DemoNav() {
  const pathname = usePathname();

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[45] flex h-9 items-center justify-center gap-3 bg-[#D99E55] px-4 text-[13px] font-medium text-[#27272A]">
        <span>演示模式 — 所有数据为模拟数据，不可提交</span>
        <Link
          href="/login"
          className="active:translate-y-0 inline-flex items-center gap-1 rounded-full bg-[#27272A]/10 px-2.5 py-0.5 text-[12px] transition-[background-color] duration-150 hover:bg-[#27272A]/20"
        >
          <LogOut className="size-3" />
          退出演示
        </Link>
      </div>
      <nav className="app-toolbar fixed inset-x-0 top-9 z-40 pt-[max(env(safe-area-inset-top),0px)]">
        <div className="mx-auto px-3 sm:px-6">
          <div className="app-toolbar-inner flex min-h-[var(--app-nav-height)] flex-col gap-2 px-3 py-2 sm:gap-3 sm:px-3.5">
            <div className="flex w-full items-center justify-between gap-3">
              <Link
                href="/demo/dashboard"
                className="active:translate-y-0 inline-flex shrink-0 items-center gap-2 rounded-full border border-transparent px-1.5 py-1 transition-[background-color] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-background/70"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius-button)-2px)] border border-primary/25 bg-[linear-gradient(180deg,rgba(10,132,255,0.18),rgba(10,132,255,0.1))] text-[11px] font-semibold tracking-[0.12em] text-primary shadow-[var(--shadow-light)]">
                  DY
                </div>
                <div className="hidden min-w-0 sm:block">
                  <div className="text-sm font-semibold tracking-tight text-foreground">DYData Demo</div>
                  <div className="text-[11px] leading-none text-muted-foreground">15 人 / 30 天虚拟数据</div>
                </div>
              </Link>
              <Link
                href="/login?from=demo"
                className="active:translate-y-0 inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow-light)] transition-[background-color,color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:border-border hover:bg-background/80 hover:text-foreground"
              >
                <div className="hidden items-center gap-2 lg:flex">
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                  只读演示
                  <span className="text-border">|</span>
                  <Shield className="h-3.5 w-3.5 text-emerald-600" />
                  不含真实团队数据
                  <span className="text-border">|</span>
                </div>
                <LogOut className="h-3.5 w-3.5" />
                退出演示
              </Link>
            </div>

            <div
              className="flex w-full items-center gap-1 overflow-x-auto rounded-full border border-border/65 bg-background/55 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="演示导航"
            >
              {demoNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow,border-color] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                    item.match(pathname)
                      ? "border border-primary/20 bg-primary/12 text-primary shadow-[var(--shadow-light)]"
                      : "border border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/75 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

export function DemoModeChip() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/20 bg-zinc-100/10 px-3 py-1.5 text-xs text-[#D99E55] shadow-[var(--shadow-light)]">
      <Sparkles className="size-3.5" />
      演示模式
      <span className="text-amber-500/60">|</span>
      <LayoutPanelTop className="size-3.5" />
      布局完整，写入锁定
    </div>
  );
}

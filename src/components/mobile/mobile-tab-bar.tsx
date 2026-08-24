"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px]"
      aria-hidden="true"
    >
      <path d="M3 10.6 12 3l9 7.6" />
      <path d="M5.5 9.4V20h13V9.4" />
    </svg>
  );
}

function TopicsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px]"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px]"
      aria-hidden="true"
    >
      <path d="M4 20V12.5M9.3 20V6M14.7 20V14M20 20V9.5" />
    </svg>
  );
}

function MeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px]"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

const TABS = [
  { href: "/m", label: "首页", exact: true, icon: <HomeIcon /> },
  { href: "/m/topics", label: "选题", exact: false, icon: <TopicsIcon /> },
  { href: "/m/data", label: "数据", exact: false, icon: <DataIcon /> },
  { href: "/m/me", label: "我的", exact: false, icon: <MeIcon /> },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-2">
      <div className="flex items-center justify-around rounded-full border border-claude-border bg-claude-surface/90 px-2 py-1.5 shadow-claude-float backdrop-blur-md">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors",
                active ? "text-claude-action" : "text-claude-ink-600",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

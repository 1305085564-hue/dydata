"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/components/nav-bar-items";
import { cn } from "@/lib/utils";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[20px] shrink-0", className)}
      style={{ width: 20, height: 20 }}
      aria-hidden="true"
    >
      <path d="M3 10.6 12 3l9 7.6" />
      <path d="M5.5 9.4V20h13V9.4" />
    </svg>
  );
}

function TopicsIcon({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[20px] shrink-0", className)}
      style={{ width: 20, height: 20 }}
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function DataIcon({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[20px] shrink-0", className)}
      style={{ width: 20, height: 20 }}
      aria-hidden="true"
    >
      <path d="M4 20V12.5M9.3 20V6M14.7 20V14M20 20V9.5" />
    </svg>
  );
}

function MeIcon({ className }: { className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[20px] shrink-0", className)}
      style={{ width: 20, height: 20 }}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export interface DirectMobileTab {
  key: string;
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  isActive: (path: string) => boolean;
}

export function getMobileDirectTabs(navGroups: NavGroup[]): DirectMobileTab[] {
  const PINNED = ["/dashboard", "/topics", "/growth"];
  const allAvailable: {
    key: string;
    href: string;
    label: string;
    match: (p: string) => boolean;
    icon?: React.ComponentType<{ className?: string }>;
  }[] = [];

  for (const group of navGroups) {
    if (group.href && group.match) {
      allAvailable.push({
        key: group.key,
        href: group.href,
        label: group.label,
        match: group.match,
        icon: group.icon,
      });
    }
    if (group.children) {
      for (const child of group.children) {
        allAvailable.push({
          key: `${group.key}-${child.href}`,
          href: child.href,
          label: child.label,
          match: child.match,
          icon: child.icon,
        });
      }
    }
  }

  const tabs: DirectMobileTab[] = [];
  const addedHrefs = new Set<string>();

  for (const pinnedHref of PINNED) {
    const found = allAvailable.find((item) => item.href === pinnedHref);
    if (found && !addedHrefs.has(found.href)) {
      const icon =
        found.href === "/dashboard"
          ? HomeIcon
          : found.href.includes("topic")
            ? TopicsIcon
            : found.href.includes("growth") || found.href.includes("data")
              ? DataIcon
              : (found.icon as React.ComponentType<{ className?: string }>) ?? HomeIcon;

      tabs.push({
        key: found.key,
        href: found.href,
        label: found.label,
        icon,
        isActive: found.match,
      });
      addedHrefs.add(found.href);
    }
  }

  // 极端兜底：若 PINNED 均不存在，则取前 3 个可用项
  if (tabs.length === 0) {
    for (const item of allAvailable) {
      if (tabs.length >= 3) break;
      const icon =
        item.href === "/dashboard"
          ? HomeIcon
          : item.href.includes("topic")
            ? TopicsIcon
            : item.href.includes("growth") || item.href.includes("data")
              ? DataIcon
              : (item.icon as React.ComponentType<{ className?: string }>) ?? HomeIcon;

      tabs.push({
        key: item.key,
        href: item.href,
        label: item.label,
        icon,
        isActive: item.match,
      });
    }
  }

  return tabs;
}

export function isMobileMoreActive(
  directTabs: DirectMobileTab[],
  pathname: string,
): boolean {
  const isInDirectTabs = directTabs.some((t) => t.isActive(pathname));
  return !isInDirectTabs && pathname !== "/";
}

export interface MobileTabBarProps {
  navGroups: NavGroup[];
  onOpenMore: () => void;
  isMoreOpen?: boolean;
  moreButtonRef?: React.RefObject<HTMLButtonElement | null>;
  badgeCount?: number;
}

export function MobileTabBar({
  navGroups,
  onOpenMore,
  isMoreOpen = false,
  moreButtonRef,
  badgeCount = 0,
}: MobileTabBarProps) {
  const pathname = usePathname();

  const directTabs = React.useMemo(
    () => getMobileDirectTabs(navGroups),
    [navGroups],
  );

  const isMoreActive = React.useMemo(() => {
    const isInDirectTabs = directTabs.some((t) => t.isActive(pathname));
    return !isInDirectTabs && pathname !== "/";
  }, [directTabs, pathname]);

  return (
    <nav
      aria-label="移动端主导航"
      className="fixed inset-x-4 bottom-[calc(1rem+var(--app-safe-bottom,0px))] z-40 mx-auto max-w-[340px] rounded-full border border-[#E2E2DF] bg-white/92 px-2 py-1 shadow-claude-float backdrop-blur-xl md:hidden ring-1 ring-black/5"
    >
      <div className="flex h-13 items-center justify-around">
        {directTabs.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon ?? HomeIcon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 transition-transform duration-150 ease-out active:scale-[0.99] active:duration-120",
                active
                  ? "text-[#D97757]"
                  : "text-[#78716C] hover:text-[#1C1917]",
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "transition-colors duration-150",
                    active ? "text-[#D97757]" : "text-[#78716C]",
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-0.5 text-[11px] tracking-tight leading-none transition-colors",
                  active
                    ? "font-medium text-[#D97757]"
                    : "font-normal text-[#78716C]",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* 更多 / 个人中心抽屉入口 */}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={onOpenMore}
          aria-expanded={isMoreOpen}
          aria-controls="mobile-navigation-menu"
          aria-label="更多与个人中心"
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 transition-transform duration-150 ease-out active:scale-[0.99] active:duration-120",
            isMoreActive || isMoreOpen
              ? "text-[#D97757]"
              : "text-[#78716C] hover:text-[#1C1917]",
          )}
        >
          <div className="relative">
            <MeIcon
              className={cn(
                "transition-colors duration-150",
                isMoreActive || isMoreOpen
                  ? "text-[#D97757]"
                  : "text-[#78716C]",
              )}
            />
            {badgeCount > 0 && (
              <span className="absolute -top-0.5 -right-1 flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D97757] opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-[#D97757]" />
              </span>
            )}
          </div>
          <span
            className={cn(
              "mt-0.5 text-[11px] tracking-tight leading-none transition-colors",
              isMoreActive || isMoreOpen
                ? "font-medium text-[#D97757]"
                : "font-normal text-[#78716C]",
            )}
          >
            我的
          </span>
        </button>
      </div>
    </nav>
  );
}

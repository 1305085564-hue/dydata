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
  const tabs: DirectMobileTab[] = [];

  for (const group of navGroups) {
    if (group.href && group.match) {
      const icon =
        group.href === "/dashboard"
          ? HomeIcon
          : group.href.includes("topic")
            ? TopicsIcon
            : group.icon ?? HomeIcon;

      tabs.push({
        key: group.key,
        href: group.href,
        label: group.label,
        icon,
        isActive: group.match,
      });
    } else if (group.children && group.children.length > 0) {
      // 多项分组：仅取首个子项作为快捷直达入口，但高亮只能匹配该子项自身
      const firstChild = group.children[0];
      if (firstChild && firstChild.href) {
        const icon =
          firstChild.href.includes("growth") || firstChild.href.includes("data")
            ? DataIcon
            : firstChild.href.includes("topic") || firstChild.href.includes("rewrite")
              ? TopicsIcon
              : firstChild.icon ?? group.icon ?? DataIcon;

        tabs.push({
          key: `${group.key}-${firstChild.href}`,
          href: firstChild.href,
          label: firstChild.label,
          icon,
          isActive: firstChild.match,
        });
      }
    }
    if (tabs.length >= 4) break; // 最多放4个底栏高频直达项，其余收口至“我的/更多”
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
      className="fixed inset-x-4 bottom-[calc(1rem+var(--app-safe-bottom,0px))] z-40 mx-auto max-w-[340px] rounded-full border border-[#E5E0D6] bg-[#FAF8F4]/92 px-2 py-1 shadow-claude-float backdrop-blur-xl md:hidden ring-1 ring-black/5"
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

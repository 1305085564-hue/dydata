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
          firstChild.href.includes("data")
            ? DataIcon
            : firstChild.href.includes("topic")
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
      className="fixed inset-x-4 bottom-[calc(1rem+var(--app-safe-bottom,0px))] z-40 mx-auto max-w-[340px] rounded-full border border-[#E2E2DF] bg-white px-2 py-1 shadow-card-ring md:hidden"
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
                "relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 transition-colors duration-150",
                active
                  ? "text-[#141413]"
                  : "text-[#78716C] hover:text-[#141413]",
              )}
            >
              <div
                className={cn(
                  "relative -m-1 rounded-md p-1 transition-colors duration-150",
                  active && "bg-[#F1F1F0]",
                )}
              >
                <Icon
                  className={cn(
                    "transition-colors duration-150",
                    active ? "text-[#141413]" : "text-[#78716C]",
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-0.5 text-[12px] tracking-tight leading-none transition-colors",
                  active
                    ? "font-normal text-[#141413]"
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
          aria-label={badgeCount > 0 ? `我的：待办 ${badgeCount > 99 ? "99+" : badgeCount} 项` : "我的"}
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 transition-colors duration-150",
            isMoreActive || isMoreOpen
              ? "text-[#141413]"
              : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          <div
            className={cn(
              "relative -m-1 rounded-md p-1 transition-colors duration-150",
              (isMoreActive || isMoreOpen) && "bg-[#F1F1F0]",
            )}
          >
            <MeIcon
              className={cn(
                "transition-colors duration-150",
                isMoreActive || isMoreOpen
                  ? "text-[#141413]"
                  : "text-[#78716C]",
              )}
            />
            {/* 有待办时直接写数字，不用闪烁红点（效率美学禁脉冲） */}
            {badgeCount > 0 && (
              <span className="absolute -right-2.5 -top-1 text-[12px] leading-none tabular-nums text-[#D97757]">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </div>
          <span
            className={cn(
              "mt-0.5 text-[12px] tracking-tight leading-none transition-colors",
              isMoreActive || isMoreOpen
                ? "font-normal text-[#141413]"
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

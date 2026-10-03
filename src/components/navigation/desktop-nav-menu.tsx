"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { NavGroup, NavSubItem } from "@/lib/navigation/domain/navigation";
import { isNavGroupActive } from "@/lib/navigation/domain/navigation";
import { cn } from "@/lib/utils";
import { hasHoverPointer, HOVER_MENU_CLOSE_DELAY_MS } from "@/lib/hover-pointer";

type OpenDropdown = {
  key: string;
  /** 点击（或键盘）打开的菜单是锁定的，指针移开不会自动收起。 */
  pinned: boolean;
};

export function DesktopNavMenu({ navGroups }: { navGroups: NavGroup[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown | null>(null);
  const dropdownCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownContainersRef = useRef<Record<string, HTMLDivElement | null>>({});

  const clearDropdownCloseTimer = useCallback(() => {
    if (dropdownCloseTimerRef.current) {
      clearTimeout(dropdownCloseTimerRef.current);
      dropdownCloseTimerRef.current = null;
    }
  }, []);

  const closeDropdown = useCallback(() => {
    clearDropdownCloseTimer();
    setOpenDropdown(null);
  }, [clearDropdownCloseTimer]);

  const scheduleDropdownClose = useCallback((key: string) => {
    clearDropdownCloseTimer();
    dropdownCloseTimerRef.current = setTimeout(() => {
      dropdownCloseTimerRef.current = null;
      setOpenDropdown((current) =>
        current?.key === key && !current.pinned ? null : current,
      );
    }, HOVER_MENU_CLOSE_DELAY_MS);
  }, [clearDropdownCloseTimer]);

  const handleDropdownHoverOpen = useCallback((key: string) => {
    if (!hasHoverPointer()) return;
    clearDropdownCloseTimer();
    setOpenDropdown((current) =>
      current?.key === key ? current : { key, pinned: false },
    );
  }, [clearDropdownCloseTimer]);

  const handleDropdownHoverLeave = useCallback(
    (key: string, event: ReactMouseEvent<HTMLDivElement>) => {
      if (!hasHoverPointer()) return;
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
      scheduleDropdownClose(key);
    },
    [scheduleDropdownClose],
  );

  const handleDropdownTriggerClick = useCallback((key: string) => {
    clearDropdownCloseTimer();
    setOpenDropdown((current) =>
      current?.key === key && current.pinned ? null : { key, pinned: true },
    );
  }, [clearDropdownCloseTimer]);

  useEffect(() => () => clearDropdownCloseTimer(), [clearDropdownCloseTimer]);

  useEffect(() => {
    if (!openDropdown) return;
    const handlePointerDown = (event: MouseEvent) => {
      const container = dropdownContainersRef.current[openDropdown.key];
      if (container && !container.contains(event.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openDropdown]);

  useEffect(() => {
    const timer = setTimeout(() => setOpenDropdown(null), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  const prefetchOnHover = useCallback(
    (href: string) => {
      if (href !== pathname) router.prefetch(href);
    },
    [pathname, router],
  );

  return (
    <div
      className="hidden min-w-0 items-center gap-1 lg:flex"
      aria-label="主导航"
    >
      {navGroups.map((group) => {
        const isSingle = Boolean(group.href && group.match);
        const isGroupActive = isNavGroupActive(group, pathname);
        const isDropdownOpen = openDropdown?.key === group.key;

        if (isSingle) {
          const Icon = group.icon;
          return (
            <Link
              key={group.key}
              href={group.href!}
              aria-current={isGroupActive ? "page" : undefined}
              prefetch={false}
              onMouseEnter={() => prefetchOnHover(group.href!)}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] tracking-tight transition-colors duration-100 ease-out group origin-center select-none",
                isGroupActive
                  ? "text-[#141413] font-medium bg-[#F1F1F0] shadow-input"
                  : "text-[#78716C] font-normal hover:text-[#141413] hover:bg-[#EBEBE9]/80 active:scale-[0.99] active:duration-120",
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "size-3.5 stroke-[1.8] shrink-0 mr-1.5 transition-transform duration-200 group-hover:scale-105",
                    isGroupActive
                      ? "text-[#D97757]"
                      : "text-[#78716C] group-hover:text-[#1F1E1D]",
                  )}
                />
              )}
              <span className="whitespace-nowrap">{group.label}</span>
            </Link>
          );
        }

        const GroupIcon = group.icon;
        return (
          <div
            key={group.key}
            className="relative"
            ref={(node) => {
              dropdownContainersRef.current[group.key] = node;
            }}
            onMouseEnter={() => handleDropdownHoverOpen(group.key)}
            onMouseLeave={(event) => handleDropdownHoverLeave(group.key, event)}
          >
            <button
              type="button"
              onClick={() => handleDropdownTriggerClick(group.key)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-[13px] tracking-tight transition-colors duration-100 ease-out group origin-center select-none",
                isGroupActive || isDropdownOpen
                  ? "text-[#141413] font-medium bg-[#F1F1F0] shadow-input"
                  : "text-[#78716C] font-normal hover:text-[#141413] hover:bg-[#EBEBE9]/80 active:scale-[0.99] active:duration-120",
              )}
            >
              {isGroupActive && <span className="absolute bottom-0 inset-x-3 h-[2px] rounded-full bg-[#141413] transition-all duration-150" />}
              {GroupIcon && (
                <GroupIcon
                  className={cn(
                    "size-3.5 stroke-[1.8] shrink-0 mr-0.5 transition-transform duration-200 group-hover:scale-105",
                    isGroupActive || isDropdownOpen
                      ? "text-status-info"
                      : "text-[#78716C] group-hover:text-[#1F1E1D]",
                  )}
                />
              )}
              <span className="whitespace-nowrap">{group.label}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 stroke-[2] opacity-50 transition-transform duration-200 ease-out group-hover:opacity-100",
                  isDropdownOpen && "rotate-180 text-status-info opacity-100",
                )}
              />
            </button>

            {isDropdownOpen && group.children && (
              <div className="absolute left-0 top-full pt-1.5 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150">
                <div className="w-56 rounded-xl bg-white/98 p-1.5 shadow-claude-float backdrop-blur-2xl">
                  <div className="space-y-0.5">
                    {group.children.map((child: NavSubItem) => {
                      const active = child.match(pathname);
                      const Icon = child.icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          prefetch={false}
                          onMouseEnter={() => prefetchOnHover(child.href)}
                          onClick={() => closeDropdown()}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13px] transition-colors duration-150 group/item",
                            active
                              ? "bg-[#F1F1F0] text-[#141413] font-medium"
                              : "text-[#1F1E1D] font-normal hover:bg-[#EBEBE9] hover:text-[#141413]",
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {Icon && (
                              <Icon
                                className={cn(
                                  "size-4 stroke-[1.8] shrink-0 transition-transform duration-150 group-hover/item:scale-105",
                                  active
                                    ? "text-[#D97757]"
                                    : "text-[#78716C] group-hover/item:text-[#141413]",
                                )}
                              />
                            )}
                            <span className="truncate">{child.label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

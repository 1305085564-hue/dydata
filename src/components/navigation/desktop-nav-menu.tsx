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

/** 顶栏导航项：只有字。当前页只用一种记号——深字 + 浅砂底（美学宝典 §3.9），不叠阴影、横线、变色图标。 */
const ITEM =
  "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-status-info/20 lg:px-3 lg:text-[14px]";
const ITEM_ON = "bg-[#F1F1F0] text-[#141413]";
const ITEM_OFF = "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]";
/** 下拉浮层：白底 + 浮层阴影，不做毛玻璃 */
const PANEL = "absolute left-0 top-full z-50 pt-1";
const PANEL_BODY = "w-44 rounded-xl border border-[#E2E2DF] bg-white p-1 shadow-claude-float";
const MENU_ITEM = "flex w-full items-center rounded-md px-2.5 py-2 text-[14px] transition-colors duration-150";
const MENU_ON = "bg-[#F1F1F0] text-[#141413]";
const MENU_OFF = "text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]";

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

  const compactVisibleGroups = navGroups.slice(0, 4);
  const compactMoreGroups = navGroups.slice(4);
  const compactMoreKey = "compact-more";
  const compactMoreOpen = openDropdown?.key === compactMoreKey;

  const menuLink = (child: NavSubItem) => {
    const active = child.match(pathname);
    return (
      <Link
        key={child.href}
        href={child.href}
        prefetch={false}
        aria-current={active ? "page" : undefined}
        onMouseEnter={() => prefetchOnHover(child.href)}
        onClick={() => closeDropdown()}
        className={cn(MENU_ITEM, active ? MENU_ON : MENU_OFF)}
      >
        <span className="truncate">{child.label}</span>
      </Link>
    );
  };

  return (
    <nav className="hidden min-w-0 items-center gap-0.5 md:flex" aria-label="主导航">
      {navGroups.map((group, index) => {
        const compactHidden = index >= compactVisibleGroups.length;
        const isSingle = Boolean(group.href && group.match);
        const isGroupActive = isNavGroupActive(group, pathname);
        const isDropdownOpen = openDropdown?.key === group.key;

        if (isSingle) {
          return (
            <Link
              key={group.key}
              href={group.href!}
              aria-current={isGroupActive ? "page" : undefined}
              prefetch={false}
              onMouseEnter={() => prefetchOnHover(group.href!)}
              className={cn(ITEM, compactHidden && "hidden lg:inline-flex", isGroupActive ? ITEM_ON : ITEM_OFF)}
            >
              {group.label}
            </Link>
          );
        }

        return (
          <div
            key={group.key}
            className={cn("relative", compactHidden && "hidden lg:block")}
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
              className={cn(ITEM, isGroupActive || isDropdownOpen ? ITEM_ON : ITEM_OFF)}
            >
              {group.label}
              <ChevronDown
                aria-hidden="true"
                className={cn("size-3.5 transition-transform duration-150", isDropdownOpen && "rotate-180")}
              />
            </button>

            {isDropdownOpen && group.children && (
              <div className={PANEL}>
                <div className={PANEL_BODY}>{group.children.map(menuLink)}</div>
              </div>
            )}
          </div>
        );
      })}

      {compactMoreGroups.length > 0 && (
        <div
          className="relative lg:hidden"
          ref={(node) => {
            dropdownContainersRef.current[compactMoreKey] = node;
          }}
        >
          <button
            type="button"
            onClick={() => handleDropdownTriggerClick(compactMoreKey)}
            aria-expanded={compactMoreOpen}
            aria-haspopup="true"
            className={cn(
              ITEM,
              compactMoreOpen || compactMoreGroups.some((group) => isNavGroupActive(group, pathname)) ? ITEM_ON : ITEM_OFF,
            )}
          >
            更多
            <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-150", compactMoreOpen && "rotate-180")} />
          </button>

          {compactMoreOpen && (
            <div className={PANEL}>
              <div className={PANEL_BODY}>
                {compactMoreGroups.map((group) => {
                  if (group.href && group.match) {
                    return menuLink({ href: group.href, label: group.label, match: group.match });
                  }
                  return (
                    <div key={group.key} className="pt-1">
                      <div className="px-2.5 pb-1 pt-2 text-[12px] text-[#78716C]">{group.label}</div>
                      {group.children?.map(menuLink)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

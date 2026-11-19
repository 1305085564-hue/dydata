"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LogOut, Settings } from "lucide-react";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { cn } from "@/lib/utils";
import { hasHoverPointer, HOVER_MENU_CLOSE_DELAY_MS } from "@/lib/hover-pointer";
import { selectDashboardAccount } from "@/lib/dashboard-store";
import { createClient } from "@/lib/supabase/client";
import { clearScreenshotGrant } from "@/components/screenshot-grant";
import { useExitMotion } from "@/hooks/use-exit-motion";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface UserWorkspacePopoverProps {
  name: string;
  accounts: Account[];
  selectedAccountId: string;
  onOpenSettings: () => void;
}

/**
 * 顶栏右侧的「名字 ▾」。菜单只放三样：切换工作账号（有两个以上才出现）、账号与偏好设置、退出登录。
 * 成员管理入口只在「管理中心」一处；没权限的人不看到点不了的灰项。
 */
export function UserWorkspacePopover({
  name,
  accounts = [],
  selectedAccountId,
  onOpenSettings,
}: UserWorkspacePopoverProps) {
  const [menu, setMenu] = useState({ open: false, pinned: false });
  const isOpen = menu.open;
  const menuMotion = useExitMotion(isOpen);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuId = useId();

  const clearCloseTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const closeMenu = () => {
    clearCloseTimer();
    setMenu({ open: false, pinned: false });
  };

  // 悬停只负责“临时展开”，不覆盖点击锁定；触屏没有真实悬停，整体不启用。
  const handleMouseEnter = () => {
    if (!hasHoverPointer()) return;
    clearCloseTimer();
    setMenu((current) =>
      current.open ? current : { open: true, pinned: false },
    );
  };

  const handleMouseLeave = () => {
    if (!hasHoverPointer()) return;
    clearCloseTimer();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      // 到点再判一次：期间被点击锁定的菜单不收起。
      setMenu((current) =>
        current.open && !current.pinned
          ? { open: false, pinned: false }
          : current,
      );
    }, HOVER_MENU_CLOSE_DELAY_MS);
  };

  // 悬停已经展开时点击应当“锁定”，而不是反向收起。
  const handleTriggerClick = () => {
    clearCloseTimer();
    setMenu((current) =>
      current.open && current.pinned
        ? { open: false, pinned: false }
        : { open: true, pinned: true },
    );
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setMenu({ open: false, pinned: false });
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setMenu({ open: false, pinned: false });
      triggerRef.current?.focus();
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    await clearScreenshotGrant();
    window.location.href = "/login";
  };

  const MENU_ITEM =
    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] text-[#1F1E1D] transition-colors duration-150 hover:bg-[#EBEBE9] hover:text-[#141413]";

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={handleTriggerClick}
        className={cn(
          "inline-flex h-8 max-w-[180px] items-center gap-2 rounded-md px-2 text-[14px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-status-info/20",
          isOpen ? "bg-[#F1F1F0] text-[#141413]" : "text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]",
        )}
      >
        <InitialAvatar name={name} size="xs" />
        <span className="truncate">{name.trim() || "我的"}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 text-[#78716C] transition-transform duration-150", isOpen && "rotate-180")}
        />
      </button>

      {menuMotion.shown && (
        <div
          id={menuId}
          {...menuMotion.exitProps}
          className={cn(
            menuMotion.closing ? "animate-out fade-out pointer-events-none" : "animate-in fade-in",
            "absolute right-0 top-full z-50 mt-1 w-60 rounded-xl border border-[#E2E2DF] bg-white p-1 shadow-claude-float duration-150",
          )}
        >
          {accounts.length > 1 && (
            <>
              <div className="px-2.5 pb-1 pt-2 text-[12px] text-[#78716C]">工作账号</div>
              <div role="group" aria-label="工作账号列表" className="max-h-52 overflow-y-auto">
                {accounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  const cleanName = account.display_name.replace(/^(抖音|小红书|视频号|B站)-/, "").trim();
                  const secondary =
                    cleanName.toLowerCase() === account.name.trim().toLowerCase()
                      ? account.content_direction
                      : `@${account.name}`;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        selectDashboardAccount(account.id);
                        closeMenu();
                      }}
                      className={cn(
                        "flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors duration-150",
                        isSelected ? "bg-[#F1F1F0] text-[#141413]" : "text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]",
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px]">{account.display_name}</span>
                        {isSelected && <Check className="size-3.5 shrink-0 text-[#141413]" aria-hidden="true" />}
                      </span>
                      {secondary && <span className="truncate text-[12px] text-[#78716C]">{secondary}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="my-1 border-t border-[#E2E2DF]" />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              closeMenu();
              onOpenSettings();
            }}
            className={MENU_ITEM}
          >
            <Settings className="size-4 text-[#78716C]" aria-hidden="true" />
            账号与偏好设置
          </button>
          <button type="button" onClick={handleSignOut} className={MENU_ITEM}>
            <LogOut className="size-4 text-[#78716C]" aria-hidden="true" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

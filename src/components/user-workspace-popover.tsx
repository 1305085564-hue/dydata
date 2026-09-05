"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  User,
  UsersRound,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setDashboardAccount } from "@/lib/dashboard-store";
import { createClient } from "@/lib/supabase/client";
import { getRoleLabel } from "@/lib/role-label";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface UserWorkspacePopoverProps {
  name: string;
  role: string;
  companyRole?: string | null;
  canAccessTeamManagement?: boolean;
  accounts: Account[];
  selectedAccountId: string;
  onOpenSettings: () => void;
}

export function UserWorkspacePopover({
  name,
  role,
  companyRole,
  canAccessTeamManagement = false,
  accounts = [],
  selectedAccountId,
  onOpenSettings,
}: UserWorkspacePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuId = useId();

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
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
    window.location.href = "/login";
  };

  const selectedAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  return (
    <div
      className="relative animate-in fade-in duration-150"
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Integrated Combined Topbar Control Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 items-center justify-center sm:justify-start gap-2 rounded-xl p-1 pr-2 text-left transition-all duration-200 group focus-visible:ring-2 focus-visible:ring-[#43718E]/20 outline-none",
          "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]/70 active:scale-[0.99] active:duration-120",
          isOpen && "text-[#1C1917] bg-[#F5F3EE]/80 font-semibold",
        )}
      >
        {/* User Avatar */}
        <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full border border-[#E5E0D6] bg-[#F5F3EE] text-[12px] font-medium text-[#292524] transition-all duration-200 group-hover:border-[#E5E0D6] group-hover:bg-[#E5E0D6]/70 group-hover:text-[#1C1917]">
          {name.trim().slice(0, 1).toUpperCase() || "?"}
        </div>

        {/* Account Info label */}
        <div className="hidden sm:flex flex-col min-w-0">
          <span className="truncate text-[12px] font-medium leading-tight text-[#1C1917] max-w-[110px]">
            {selectedAccount?.display_name || name.split(" ")[0]}
          </span>
          <span className="truncate text-[11px] font-normal leading-none text-[#78716C] mt-0.5 max-w-[115px] tracking-tight">
            {getRoleLabel(role, { companyRole })}
          </span>
        </div>

        <ChevronDown
          size={13}
          className={cn(
            "text-[#78716C] transition-transform duration-200 shrink-0 group-hover:text-[#292524]",
            isOpen && "rotate-180 text-[#1C1917]",
          )}
        />
      </button>

      {/* Floating Popover Panel */}
      {isOpen && (
        <div
          id={menuId}
          className={cn(
            "animate-in fade-in zoom-in-95 slide-in-from-top-2 absolute right-0 mt-1.5 z-50 w-68 origin-top-right overflow-hidden rounded-xl border border-[#E5E0D6] bg-white/98 p-1.5 shadow-claude-float ring-1 ring-[#1C1917]/5 duration-150 backdrop-blur-xl",
          )}
        >
          {/* Section 1: Workspace Selector */}
          {accounts.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-medium text-[#78716C] uppercase tracking-wider">
                工作账号 ({accounts.length})
              </div>
              <div
                role="group"
                aria-label="工作账号列表"
                className="max-h-52 space-y-0.5 overflow-y-auto"
              >
                {accounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setDashboardAccount(account.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-100 group/item",
                        isSelected
                          ? "bg-[#43718E]/10 text-[#43718E]"
                          : "hover:bg-[#F5F3EE] text-[#292524] hover:text-[#1C1917]",
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span
                          className={cn(
                            "truncate text-[12px] font-medium tracking-tight",
                            isSelected
                              ? "text-[#43718E] font-semibold"
                              : "text-[#292524]",
                          )}
                        >
                          {account.display_name}
                        </span>
                        <span className="truncate text-[11px] font-normal text-[#78716C] mt-0.5">
                          {(() => {
                            const cleanName = account.display_name
                              .replace(/^(抖音|小红书|视频号|B站)-/, "")
                              .trim();
                            const isDuplicate =
                              cleanName.toLowerCase() ===
                              account.name.trim().toLowerCase();
                            return isDuplicate
                              ? `方向: ${account.content_direction || "未分类"}`
                              : `@${account.name}`;
                          })()}
                        </span>
                      </div>

                      {isSelected && (
                        <Check className="size-3.5 shrink-0 text-[#43718E]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Separator */}
          <div className="my-1 border-t border-[#ECE7DE]" />

          {/* Section 2: Account & System Actions */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-[#292524] transition-colors duration-100 hover:bg-[#F5F3EE] hover:text-[#1C1917] group/btn"
            >
              <User className="size-4 text-[#78716C] group-hover/btn:text-[#43718E] transition-colors" />
              <span>账号与偏好设置</span>
            </button>

            {canAccessTeamManagement ? (
              <a
                href="/admin/modules"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-[#292524] transition-colors duration-100 hover:bg-[#F5F3EE] hover:text-[#1C1917] group/btn"
              >
                <UsersRound className="size-4 text-[#78716C] group-hover/btn:text-[#43718E] transition-colors" />
                <span>成员与团队架构</span>
              </a>
            ) : (
              <div
                aria-disabled="true"
                title="当前账号没有成员管理权限"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-[#78716C]"
              >
                <UsersRound className="size-4 text-[#E5E0D6]" />
                <span>成员与团队架构</span>
                <span className="ml-auto text-[11px] text-[#78716C]">需权限</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-[#292524] transition-colors duration-100 hover:bg-[#F5F3EE] hover:text-[#C0685C] group/btn"
            >
              <LogOut className="size-4 text-[#78716C] group-hover/btn:text-[#C0685C] transition-colors" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

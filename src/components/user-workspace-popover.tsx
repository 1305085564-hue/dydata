"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check, User, UsersRound, LogOut, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { setDashboardAccount } from "@/lib/dashboard-store";
import { createClient } from "@/lib/supabase/client";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface UserWorkspacePopoverProps {
  name: string;
  role: string;
  accounts: Account[];
  selectedAccountId: string;
  onOpenSettings: () => void;
}

export function UserWorkspacePopover({
  name,
  role,
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  return (
    <div
      className="relative animate-in fade-in duration-300"
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
          "flex items-center gap-2 rounded-xl p-1 pr-2 text-left transition-all duration-200 group focus-visible:ring-2 focus-visible:ring-[#5F82A8]/30 outline-none",
          "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 active:scale-[0.98]",
          isOpen && "text-zinc-900 bg-zinc-100/80 font-semibold"
        )}
      >
        {/* User Avatar */}
        <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[12px] font-medium text-zinc-700 transition-all duration-200 group-hover:border-[#5F82A8] group-hover:bg-[#5F82A8]/10 group-hover:text-[#5F82A8]">
          {name.trim().slice(0, 1).toUpperCase() || "?"}
        </div>

        {/* Account Info label */}
        <div className="hidden sm:flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium leading-tight text-zinc-900 max-w-[110px]">
              {selectedAccount?.display_name || name.split(" ")[0]}
            </span>
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#16A34A]/40 motion-safe:animate-ping" />
              <span className="relative size-1.5 rounded-full bg-[#16A34A]" />
            </span>
          </div>
          <span className="truncate text-[10px] font-normal leading-none text-zinc-400 mt-0.5 max-w-[115px] tracking-tight">
            {role === "owner" ? "创始人" : role === "admin" ? "管理员" : "成员"}
          </span>
        </div>

        <ChevronDown
          size={13}
          className={cn(
            "text-zinc-400 transition-transform duration-200 shrink-0 group-hover:text-zinc-600",
            isOpen && "rotate-180 text-zinc-900"
          )}
        />
      </button>

      {/* Floating Popover Panel */}
      {isOpen && (
        <div
          id={menuId}
          className={cn(
            "animate-in fade-in zoom-in-95 slide-in-from-top-2 absolute right-0 mt-1.5 z-50 w-68 origin-top-right overflow-hidden rounded-2xl border bg-white/95 p-1.5 shadow-xl shadow-zinc-900/10 duration-150 border-zinc-200 backdrop-blur-xl ring-1 ring-black/5"
          )}
        >
          {/* Section 1: Workspace Selector */}
          {accounts.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                工作账号 ({accounts.length})
              </div>
              <div role="group" aria-label="工作账号列表" className="max-h-52 space-y-0.5 overflow-y-auto">
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
                        "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition-all duration-150 group/item",
                        isSelected
                          ? "bg-[#5F82A8]/10 text-[#5F82A8]"
                          : "hover:bg-zinc-100/80 text-zinc-700 hover:text-zinc-900"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span
                          className={cn(
                            "truncate text-[12px] font-medium tracking-tight",
                            isSelected ? "text-[#5F82A8] font-semibold" : "text-zinc-800"
                          )}
                        >
                          {account.display_name}
                        </span>
                        <span className="truncate text-[10px] font-normal text-zinc-400 mt-0.5">
                          {(() => {
                            const cleanName = account.display_name
                              .replace(/^(抖音|小红书|视频号|B站)-/, "")
                              .trim();
                            const isDuplicate =
                              cleanName.toLowerCase() === account.name.trim().toLowerCase();
                            return isDuplicate
                              ? `方向: ${account.content_direction || "未分类"}`
                              : `@${account.name}`;
                          })()}
                        </span>
                      </div>

                      {isSelected && <Check className="size-3.5 shrink-0 text-[#5F82A8]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Separator */}
          <div className="my-1 border-t border-zinc-100" />

          {/* Section 2: Account & System Actions */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-zinc-700 transition-all duration-150 hover:bg-zinc-100 hover:text-zinc-900 group/btn"
            >
              <User className="size-4 text-zinc-400 group-hover/btn:text-[#5F82A8] transition-colors" />
              <span>账号与偏好设置</span>
            </button>

            <Link
              href="/admin/modules"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-zinc-700 transition-all duration-150 hover:bg-zinc-100 hover:text-zinc-900 group/btn"
            >
              <UsersRound className="size-4 text-zinc-400 group-hover/btn:text-[#5F82A8] transition-colors" />
              <span>成员与团队架构</span>
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 dark:hover:bg-rose-950/20 group/btn"
            >
              <LogOut className="size-4 text-rose-400 group-hover/btn:text-rose-600 transition-colors" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { setDashboardAccount } from "@/lib/dashboard-store";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface WorkspacePickerProps {
  accounts: Account[];
  selectedAccountId: string;
}

export function WorkspacePicker({ accounts, selectedAccountId }: WorkspacePickerProps) {
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

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  return (
    <div
      className="relative animate-in fade-in duration-300"
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all duration-200 group focus-visible:ring-2 focus-visible:ring-[#5F82A8]/20 outline-none",
          "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 active:scale-[0.98]",
          isOpen && "text-zinc-900 bg-zinc-100/80 font-semibold"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-[12px] font-medium leading-tight text-zinc-900 max-w-[120px]">
              {selectedAccount?.display_name || "选择账号"}
            </span>
            <span className="truncate text-[11px] font-normal leading-none text-zinc-500 mt-0.5 max-w-[125px] tracking-tight">
              {(() => {
                if (!selectedAccount) return "dydata";
                const cleanName = selectedAccount.display_name.replace(/^(抖音|小红书|视频号|B站)-/, "").trim();
                const isDuplicate = cleanName.toLowerCase() === selectedAccount.name.trim().toLowerCase();
                return isDuplicate 
                  ? `方向: ${selectedAccount.content_direction || "未分类"}`
                  : `@${selectedAccount.name}`;
              })()}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-zinc-400 transition-transform duration-200 shrink-0 group-hover:text-zinc-600",
            isOpen && "rotate-180 text-zinc-900"
          )}
        />
      </button>

      {isOpen && (
        <div
          id={menuId}
          className={cn(
            "animate-in fade-in zoom-in-95 slide-in-from-top-2 absolute right-0 md:left-0 mt-1.5 z-50 w-64 origin-top-left overflow-hidden rounded-xl border bg-white/95 p-1.5 shadow-xl shadow-zinc-900/5 duration-150 border-zinc-200 backdrop-blur-xl ring-1 ring-black/5"
          )}
        >
          {/* Account List */}
          <div role="group" aria-label="工作账号列表" className="max-h-64 space-y-0.5 overflow-y-auto">
            {accounts.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-zinc-400">
                没有找到匹配的账号
              </div>
            ) : (
              accounts.map((account) => {
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
                      "flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 group/item",
                      isSelected
                        ? "bg-[#5F82A8]/10 text-[#5F82A8]"
                        : "hover:bg-zinc-100/80 text-zinc-700 hover:text-zinc-900"
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className={cn("truncate text-[12px] font-medium tracking-tight", isSelected ? "text-[#5F82A8] font-semibold" : "text-zinc-800")}>
                        {account.display_name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-500 font-normal min-w-0">
                        {(() => {
                          const cleanName = account.display_name.replace(/^(抖音|小红书|视频号|B站)-/, "").trim();
                          const isDuplicate = cleanName.toLowerCase() === account.name.trim().toLowerCase();
                          if (isDuplicate) {
                            return (
                              <span className="truncate max-w-[140px]">
                                方向: {account.content_direction || "未分类"}
                              </span>
                            );
                          }
                          return (
                            <>
                              <span className="truncate max-w-[90px]">@{account.name}</span>
                              <span className="text-zinc-300 shrink-0">·</span>
                              <span className="truncate max-w-[120px]">
                                方向: {account.content_direction || "未分类"}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-[#5F82A8]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

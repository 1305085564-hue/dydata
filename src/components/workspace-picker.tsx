"use client";

import React, { useState, useRef, useEffect } from "react";
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
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
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-all duration-200 group focus-visible:ring-2 focus-visible:ring-stone-900/20 outline-none",
          "text-stone-500 hover:text-stone-900 dark:text-stone-500 dark:hover:text-[#E7E5E4] active:scale-[0.98]",
          isOpen && "text-stone-900 dark:text-[#FAFAF9]"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0 flex items-center justify-center size-2.5">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[#6FAA7D]/60 animate-ping" />
            <div className="relative size-2 rounded-full bg-[#6FAA7D]" />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-[12px] font-medium leading-tight text-stone-900 dark:text-[#FAFAF9] max-w-[110px]">
              {selectedAccount?.display_name || "选择账号"}
            </span>
            <span className="truncate text-[11px] font-medium leading-none text-stone-500 mt-0.5 max-w-[115px] tracking-tight">
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
            "text-stone-500 transition-all shrink-0 duration-200 group-hover:translate-y-0.5",
            isOpen && "rotate-180 text-stone-900 dark:text-[#FAFAF9]"
          )}
        />
      </button>

      {isOpen && (
          <div
            className={cn(
              "animate-in fade-in zoom-in-95 slide-in-from-top-2 absolute left-0 mt-2 z-50 w-64 origin-top-left overflow-hidden rounded-2xl border bg-white p-2 shadow-xl duration-150",
              "border-stone-200/80 dark:border-stone-800/80 dark:bg-stone-950 backdrop-blur-xl bg-white/95 dark:bg-stone-950/95"
            )}
          >
            {/* Intro Header */}
            <div className="px-2 py-1.5 border-b border-stone-100 dark:border-stone-900 mb-1">
              <div className="text-[12px] font-medium text-stone-900 dark:text-stone-100">
                工作账号切换
              </div>
              <div className="text-[11px] text-stone-500 dark:text-[#E7E5E4] mt-0.5 leading-normal">
                切换账号并载入对应数据
              </div>
            </div>

            {/* List */}
            <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {accounts.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-stone-500 dark:text-[#E7E5E4]">
                  没有找到匹配的账号
                </div>
              ) : (
                accounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  return (
                    <button
                      key={account.id}
                      onClick={() => {
                        setDashboardAccount(account.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all duration-200",
                        isSelected
                          ? "bg-stone-100 dark:bg-stone-900/60"
                          : "hover:bg-stone-200/70 dark:hover:bg-stone-900/30"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-[12px] font-medium tracking-tight text-stone-900 dark:text-stone-50">
                          {account.display_name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-stone-500 dark:text-[#E7E5E4] font-medium min-w-0">
                          {(() => {
                            const cleanName = account.display_name.replace(/^(抖音|小红书|视频号|B站)-/, "").trim();
                            const isDuplicate = cleanName.toLowerCase() === account.name.trim().toLowerCase();
                            if (isDuplicate) {
                              return (
                                <span className="truncate max-w-[120px]">
                                  方向: {account.content_direction || "未分类"}
                                </span>
                              );
                            }
                            return (
                              <>
                                <span className="truncate max-w-[80px]">@{account.name}</span>
                                <span className="text-stone-300 dark:text-stone-800 shrink-0">·</span>
                                <span className="truncate max-w-[120px]">
                                  方向: {account.content_direction || "未分类"}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      
                      {isSelected && (
                        <Check className="size-3.5 shrink-0 text-[#B4532F] mt-0.5" />
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

"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
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
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  const filteredAccounts = accounts.filter(
    (acc) =>
      acc.display_name.toLowerCase().includes(search.toLowerCase()) ||
      acc.name.toLowerCase().includes(search.toLowerCase()) ||
      (acc.content_direction || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="relative animate-in fade-in duration-300"
      ref={dropdownRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-all duration-200",
          "text-stone-500 hover:text-[#D97757] dark:text-stone-400 dark:hover:text-[#D97757] active:scale-[0.98]",
          isOpen && "text-[#D97757]"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className={cn(
              "truncate text-xs font-semibold leading-tight max-w-[110px] transition-colors",
              isOpen ? "text-[#D97757]" : "text-stone-850 dark:text-stone-200"
            )}>
              {selectedAccount?.display_name || "选择账号"}
            </span>
            <span className="truncate text-[10px] font-medium leading-none text-stone-500 mt-0.5 max-w-[115px] tracking-tight">
              @{selectedAccount?.name || "dydata"}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-stone-500 transition-transform shrink-0 duration-200",
            isOpen && "rotate-180 text-[#D97757]"
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
            className={cn(
              "absolute left-0 mt-2 z-50 w-72 origin-top-left overflow-hidden rounded-2xl border bg-white p-2 shadow-xl",
              "border-stone-200/80 dark:border-stone-800/80 dark:bg-stone-950 backdrop-blur-xl bg-white/95 dark:bg-stone-950/95"
            )}
          >
            {/* Intro Header */}
            <div className="px-2.5 py-2 border-b border-stone-100 dark:border-stone-900 mb-1.5">
              <div className="text-[12px] font-bold text-stone-900 dark:text-stone-100">
                工作账号切换
              </div>
              <div className="text-[11px] text-stone-500 dark:text-stone-600 mt-1 leading-normal">
                切换账号并载入对应数据
              </div>
            </div>

            {/* Search Header */}
            <div className="relative flex items-center mb-1.5 px-1.5 pt-0.5">
              <Search className="absolute left-3.5 size-3.5 text-stone-500" />
              <input
                type="text"
                placeholder="搜索账号或领域方向..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs tracking-tight outline-none transition-all duration-200",
                  "border-stone-300 bg-stone-100/50 focus:border-stone-400",
                  "dark:border-stone-800 dark:bg-stone-900/50 dark:focus:border-stone-600 dark:focus:bg-stone-900"
                )}
              />
            </div>

            {/* List */}
            <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {filteredAccounts.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-stone-500 dark:text-stone-600">
                  没有找到匹配的账号
                </div>
              ) : (
                filteredAccounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  return (
                    <button
                      key={account.id}
                      onClick={() => {
                        setDashboardAccount(account.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-2.5 rounded-lg p-2.5 text-left transition-all duration-200",
                        isSelected
                          ? "bg-stone-100 dark:bg-stone-900/60"
                          : "hover:bg-stone-200/70 dark:hover:bg-stone-900/30"
                      )}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Status Ring */}
                        <div className="mt-1 relative shrink-0">
                          <div className="size-2 rounded-full bg-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <span className="truncate text-xs font-semibold tracking-tight text-stone-955 dark:text-stone-50 block">
                            {account.display_name}
                          </span>
                          <span className="block truncate text-[10px] text-stone-500 dark:text-stone-600 font-medium">
                            方向: {account.content_direction || "未分类方向"}
                          </span>
                        </div>
                      </div>
                      
                      {isSelected && (
                        <Check className="size-3.5 shrink-0 text-[#D97757] mt-0.5" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            
            <div className="mt-1 border-t border-stone-100 dark:border-stone-900 pt-1.5 px-1 pb-0.5 flex justify-between items-center text-[10px] text-stone-500 dark:text-stone-600">
              <span>状态码: 🟢 良好 | 🟡 预警 | 🔴 异常</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

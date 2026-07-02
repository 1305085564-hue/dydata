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
    <div className="relative animate-in fade-in duration-300" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border px-3 py-1.5 text-left transition-all duration-200",
          "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm active:scale-[0.98]",
          "dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
          isOpen && "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-100 max-w-[110px]">
              {selectedAccount?.display_name || "选择账号"}
            </span>
            <span className="truncate text-[10px] font-medium leading-none text-zinc-500 mt-0.5 max-w-[115px] tracking-tight">
              @{selectedAccount?.name || "dydata"}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-zinc-500 transition-transform shrink-0 duration-200",
            isOpen && "rotate-180"
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
              "border-zinc-100/80 dark:border-zinc-800/80 dark:bg-zinc-950 backdrop-blur-xl bg-white/95 dark:bg-zinc-950/95"
            )}
          >
            {/* Search Header */}
            <div className="relative flex items-center mb-1.5 px-1.5 pt-1">
              <Search className="absolute left-3.5 size-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="搜索账号或领域方向..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs tracking-tight outline-none transition-all duration-200",
                  "border-zinc-200 bg-zinc-50/50 focus:border-zinc-400 focus:bg-white",
                  "dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-zinc-900"
                )}
              />
            </div>

            {/* List */}
            <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {filteredAccounts.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
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
                        "flex w-full items-start justify-between gap-2.5 rounded-xl p-2.5 text-left transition-all duration-200",
                        isSelected
                          ? "bg-zinc-50 dark:bg-zinc-900/60"
                          : "hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30"
                      )}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Status Ring */}
                        <div className="mt-1 relative shrink-0">
                          <div className="size-2 rounded-full bg-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <span className="truncate text-xs font-semibold tracking-tight text-zinc-955 dark:text-zinc-50 block">
                            {account.display_name}
                          </span>
                          <span className="block truncate text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
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
            
            <div className="mt-1 border-t border-zinc-100 dark:border-zinc-900 pt-1.5 px-1 pb-0.5 flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500">
              <span>状态码: 🟢 良好 | 🟡 预警 | 🔴 异常</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

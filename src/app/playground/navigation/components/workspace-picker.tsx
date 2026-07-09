"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check, AlertCircle, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { useDemoState } from "./demo-context";
import { PremiumAccount } from "./mock-data";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export function WorkspacePicker() {
  const { accounts, selectedAccountId, setSelectedAccountId, selectedAccount } = useDemoState();
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

  const filteredAccounts = accounts.filter(
    (acc) =>
      acc.display_name.toLowerCase().includes(search.toLowerCase()) ||
      acc.name.toLowerCase().includes(search.toLowerCase()) ||
      acc.content_direction.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: PremiumAccount["status"]) => {
    switch (status) {
      case "active":
        return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
      case "warning":
        return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
      case "error":
        return "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
      default:
        return "bg-stone-400";
    }
  };

  const getStatusIcon = (status: PremiumAccount["status"]) => {
    switch (status) {
      case "warning":
        return <AlertCircle className="size-3 text-amber-500" />;
      case "error":
        return <ShieldAlert className="size-3 text-rose-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border px-3 py-1.5 text-left transition-all duration-200",
          "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 hover:shadow-sm active:scale-[0.98]",
          "dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700 dark:hover:bg-stone-900",
          isOpen && "border-stone-400 bg-stone-50 dark:border-stone-600 dark:bg-stone-900"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className={cn("size-2 rounded-full", selectedAccount ? getStatusColor(selectedAccount.status) : "bg-stone-400")} />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-xs font-semibold leading-tight text-stone-900 dark:text-stone-100 max-w-[120px]">
              {selectedAccount?.display_name || "选择账号"}
            </span>
            <span className="truncate text-[10px] font-medium leading-none text-stone-500 mt-0.5 max-w-[125px] tracking-tight">
              @{selectedAccount?.name || "dydata"}
            </span>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-stone-500 transition-transform shrink-0 duration-200",
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
              "border-stone-100/80 dark:border-stone-800/80 dark:bg-stone-950 backdrop-blur-xl bg-white/95 dark:bg-stone-950/95"
            )}
          >
            {/* Search Header */}
            <div className="relative flex items-center mb-1.5 px-1.5 pt-1">
              <Search className="absolute left-3.5 size-3.5 text-stone-400" />
              <input
                type="text"
                placeholder="搜索账号或领域方向..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs tracking-tight outline-none transition-all duration-200",
                  "border-stone-200 bg-stone-50/50 focus:border-stone-400 focus:bg-white",
                  "dark:border-stone-800 dark:bg-stone-900/50 dark:focus:border-stone-600 dark:focus:bg-stone-900"
                )}
              />
            </div>

            {/* List */}
            <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {filteredAccounts.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-stone-400 dark:text-stone-600">
                  没有找到匹配的账号
                </div>
              ) : (
                filteredAccounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  return (
                    <button
                      key={account.id}
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-2.5 rounded-xl p-2 text-left transition-all duration-200",
                        isSelected
                          ? "bg-stone-50 dark:bg-stone-900/60"
                          : "hover:bg-stone-50/70 dark:hover:bg-stone-900/30"
                      )}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Status Ring */}
                        <div className="mt-1.5 relative shrink-0">
                          <div className={cn("size-2 rounded-full", getStatusColor(account.status))} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                              {account.display_name}
                            </span>
                            {getStatusIcon(account.status)}
                          </div>
                          <span className="block truncate text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                            {account.content_direction}
                          </span>
                          
                          {/* Metrics row */}
                          <div className="flex items-center gap-3 mt-1.5 text-[9px] font-medium text-stone-400 dark:text-stone-500">
                            <span className="flex items-center gap-1 bg-stone-100 dark:bg-stone-900 px-1 rounded">
                              <TrendingUp className="size-2 text-emerald-500" />
                              {account.followers} 粉丝
                            </span>
                            <span className="flex items-center gap-1 bg-stone-100 dark:bg-stone-900 px-1 rounded">
                              <Sparkles className="size-2 text-[#D97757]" />
                              健康度 {account.healthScore}
                            </span>
                          </div>
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
            
            <div className="mt-1 border-t border-stone-100 dark:border-stone-900 pt-1.5 px-1 pb-0.5 flex justify-between items-center text-[10px] text-stone-400 dark:text-stone-500">
              <span>状态码: 🟢 良好 | 🟡 预警 | 🔴 异常</span>
              <span className="font-mono text-[9px]">⌘K 快捷键</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

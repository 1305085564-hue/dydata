"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  History,
  Settings2,
  TrendingUp,
  Trophy,
  UserCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { QuickExemptionButton } from "./quick-exemption-button";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";

interface AccountOption {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface DashboardWorkspaceHeaderProps {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  userDisplayName?: string;
  userRole?: string;
}

export function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
  accounts,
  selectedAccountId,
  onSelectedAccountChange,
  userDisplayName,
  userRole,
}: DashboardWorkspaceHeaderProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const utilityActions = [
    { key: "data-view", label: "数据查看", icon: Eye },
    { key: "trend-view", label: "趋势查看", icon: TrendingUp },
    { key: "leaderboard", label: "排行榜", icon: Trophy },
    { key: "history", label: "历史记录", icon: History },
  ];

  const selectedAccount = accounts?.find((account) => account.id === selectedAccountId) ?? accounts?.[0] ?? null;
  const showAccountControl = Boolean(accounts && accounts.length > 0);
  const isSingleAccount = (accounts?.length ?? 0) <= 1;
  const canManageProfile = Boolean(userDisplayName);

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }
    dateInputRef.current?.focus();
  }

  useEffect(() => {
    if (!isAccountMenuOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isAccountMenuOpen]);

  return (
    <div className="mx-auto mb-4 max-w-6xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            <Activity size={14} className="text-zinc-800" /> 今日工作台
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">
              今日提交
            </h2>
            <nav
              className="flex flex-wrap items-center gap-x-1.5 gap-y-1"
              aria-label="数据快捷入口"
            >
              {utilityActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => onDashboardAction(action.key)}
                    className="group inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800 focus-visible:bg-zinc-100 focus-visible:text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    style={{ transitionDelay: "50ms" }}
                  >
                    <Icon
                      size={14}
                      className="stroke-[1.5] text-zinc-400 transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-zinc-700"
                    />
                    {action.label}
                  </button>
                );
              })}
              <QuickExemptionButton
                hasPending={hasPendingExemption}
                today={today}
                submittedDates={submittedDates}
                initialSelectedDates={[today]}
                variant="subtle"
              />
            </nav>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showAccountControl && selectedAccount ? (
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="listbox"
                aria-label="切换账号"
                className={cn(
                  "group inline-flex h-10 items-center gap-2 rounded-full border bg-white pl-1.5 pr-3 text-[13px] font-medium tracking-tight transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isAccountMenuOpen
                    ? "border-[#D97757]/45 bg-[#FDF9F7] text-[#C96442]"
                    : "border-zinc-200 text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#D97757]/10 text-[11px] font-semibold text-[#D97757]">
                  {selectedAccount.display_name.slice(0, 1)}
                </span>
                <span className="max-w-[110px] truncate">{selectedAccount.display_name}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 stroke-[1.6] text-zinc-400 transition-transform duration-150",
                    isAccountMenuOpen && "rotate-180 text-[#C96442]",
                  )}
                />
              </button>

              <AnimatePresence>
                {isAccountMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                    role="listbox"
                    className="absolute right-0 top-[calc(100%+8px)] z-40 w-[260px] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]"
                  >
                    <div className="mb-1 flex items-center justify-between px-3 pb-2 pt-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">
                        切换账号
                      </span>
                      {isSingleAccount ? (
                        <span className="text-[10px] font-medium tracking-wide text-zinc-400">仅 1 个</span>
                      ) : (
                        <span className="text-[10px] font-medium tracking-wide text-zinc-400">{accounts?.length} 个</span>
                      )}
                    </div>
                    <div className="max-h-72 space-y-0.5 overflow-y-auto">
                      {accounts?.map((account) => {
                        const isSelected = account.id === selectedAccount.id;
                        return (
                          <button
                            key={account.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              onSelectedAccountChange?.(account.id);
                              setIsAccountMenuOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                              isSelected ? "bg-[#FDF9F7] text-[#C96442]" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <UserCircle2
                                className={cn(
                                  "size-4 shrink-0 stroke-[1.5]",
                                  isSelected ? "text-[#D97757]" : "text-zinc-400",
                                )}
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium">
                                  {account.display_name}
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-400">
                                  {account.content_direction ?? "未设置方向"}
                                </span>
                              </span>
                            </span>
                            {isSelected ? <Check className="size-4 shrink-0 stroke-[1.8] text-[#D97757]" /> : null}
                          </button>
                        );
                      })}
                    </div>
                    {canManageProfile ? (
                      <div className="mt-1 border-t border-zinc-100 pt-1">
                        <ProfileEditDialog
                          currentName={userDisplayName!}
                          role={userRole ?? "member"}
                          accounts={accounts?.map((account) => ({ id: account.id, name: account.name })) ?? []}
                          trigger="menu-item"
                        >
                          <div
                            onClick={() => setIsAccountMenuOpen(false)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-zinc-500 transition-[background-color,color] duration-150 hover:bg-zinc-50 hover:text-zinc-800"
                          >
                            <Settings2 className="size-3.5 stroke-[1.6]" />
                            管理账号
                            <span className="ml-auto text-[11px] tracking-tight text-zinc-300">
                              在个人资料中
                            </span>
                          </div>
                        </ProfileEditDialog>
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}

          <button
            type="button"
            onClick={openDatePicker}
            className="group inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-[13px] font-medium tracking-tight text-zinc-800 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[#D97757]/40 hover:bg-[#FDF9F7] hover:text-[#C96442] focus-visible:ring-1 focus-visible:ring-zinc-950/5"
            aria-label="选择填报日期"
          >
            <CalendarDays className="size-4 stroke-[1.6] text-zinc-400 transition-colors duration-150 group-hover:text-[#D97757]" />
            <span className="font-mono tabular-nums">{activeBizDate}</span>
            <ChevronDown className="size-3.5 stroke-[1.6] text-zinc-300 transition-colors duration-150 group-hover:text-[#D97757]" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={activeBizDate}
            max={today}
            onChange={(event) => {
              if (event.target.value) onDateChange(event.target.value);
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

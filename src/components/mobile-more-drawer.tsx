"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Check,
  LogOut,
  Bell,
  Sliders,
  ChevronRight,
} from "lucide-react";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  AdaptiveSheetDescription,
  AdaptiveSheetBody,
} from "@/components/ui/adaptive-sheet";
import type { NavGroup, NavSubItem } from "@/components/nav-bar-items";
import { setDashboardAccount } from "@/lib/dashboard-store";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/role-label";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  role: string;
  companyRole?: string | null;
  navGroups: NavGroup[];
  accounts?: Account[];
  selectedAccountId?: string;
  onOpenSettings: () => void;
  onOpenCommandHub: () => void;
  bellBadgeCount?: number;
}

export function MobileMoreDrawer({
  open,
  onOpenChange,
  name,
  role,
  companyRole,
  navGroups,
  accounts = [],
  selectedAccountId,
  onOpenSettings,
  onOpenCommandHub,
  bellBadgeCount = 0,
}: MobileMoreDrawerProps) {
  const pathname = usePathname();

  const handleAccountSelect = (accountId: string) => {
    setDashboardAccount(accountId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dydata-dashboard-action", {
          detail: { key: "set-account", accountId },
        }),
      );
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent
        id="mobile-navigation-menu"
        className="max-h-[92dvh] px-4.5 pt-2"
        aria-label="导航菜单"
      >
        <AdaptiveSheetHeader className="pb-3 border-b border-[#ECE7DE]">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#D97757]/10 text-[#D97757] font-semibold text-base border border-[#D97757]/20">
              {name ? name.charAt(0).toUpperCase() : <User className="size-5" />}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <AdaptiveSheetTitle className="font-medium text-[#1C1917] text-[15px]">
                  {name || "用户"}
                </AdaptiveSheetTitle>
                <span className="rounded-full bg-[#F5F3EE] px-2 py-0.5 text-[11px] font-medium text-[#78716C] border border-[#ECE7DE]">
                  {getRoleLabel(role, { companyRole })}
                </span>
              </div>
              <AdaptiveSheetDescription className="text-[12px] text-[#78716C]">
                DYData 创作工作空间 · 移动导航中心
              </AdaptiveSheetDescription>
            </div>
          </div>
        </AdaptiveSheetHeader>

        <AdaptiveSheetBody className="space-y-4 py-3">
          {/* 待办与通知入口 */}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenCommandHub();
            }}
            className="flex w-full items-center justify-between rounded-xl bg-white shadow-card-ring p-3 text-left active:scale-[0.99] active:duration-120 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#FAF8F4] text-[#43718E] border border-[#ECE7DE]">
                <Bell className="size-4.5" />
              </div>
              <div>
                <p className="font-medium text-[#1C1917] text-[13px]">待办与通知中心</p>
                <p className="text-[11px] text-[#78716C]">审批、异常预警与站内消息</p>
              </div>
            </div>
            {bellBadgeCount > 0 ? (
              <span className="rounded-full bg-[#D97757] px-2 py-0.5 text-[11px] font-medium text-white">
                {bellBadgeCount}
              </span>
            ) : (
              <ChevronRight className="size-4 text-[#78716C]" />
            )}
          </button>

          {/* 账号切换区 */}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[12px] font-medium text-[#78716C]">当前工作账号</span>
                <span className="text-[11px] text-[#78716C]/80">点击快速切换</span>
              </div>
              <div className="space-y-1 rounded-xl bg-white border border-[#ECE7DE] p-1.5 shadow-2xs max-h-36 overflow-y-auto">
                {accounts.map((account) => {
                  const isSelected =
                    account.id === selectedAccountId ||
                    (!selectedAccountId && accounts[0]?.id === account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleAccountSelect(account.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer",
                        isSelected
                          ? "bg-[#43718E]/10 text-[#43718E] font-medium"
                          : "text-[#292524] hover:bg-[#F5F3EE]",
                      )}
                    >
                      <span className="truncate">{account.display_name || account.name}</span>
                      {isSelected && <Check className="size-4 text-[#43718E] shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 导航分组（唯一来源于 navGroups，保持与桌面端 100% 权限与入口一致） */}
          <div className="space-y-3 pt-1">
            {navGroups.map((group) => {
              if (group.children && group.children.length > 0) {
                return (
                  <div key={group.key} className="space-y-1.5">
                    <span className="px-1 text-[12px] font-medium text-[#78716C]">
                      {group.label}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {group.children.map((child: NavSubItem) => {
                        const active = child.match(pathname);
                        const Icon = child.icon;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => onOpenChange(false)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl border p-2.5 text-[13px] font-medium transition-all shadow-2xs active:scale-[0.99] active:duration-120",
                              active
                                ? "border-[#D97757]/40 bg-[#D97757]/10 text-[#D97757]"
                                : "border-[#ECE7DE] bg-white text-[#292524] hover:bg-[#F5F3EE]",
                            )}
                          >
                            {Icon && (
                              <Icon
                                className={cn(
                                  "size-4 shrink-0",
                                  active ? "text-[#D97757]" : "text-[#78716C]",
                                )}
                              />
                            )}
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // 单项根链接
              if (group.href && group.match) {
                const active = group.match(pathname);
                const Icon = group.icon;
                return (
                  <Link
                    key={group.key}
                    href={group.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all shadow-2xs active:scale-[0.99] active:duration-120",
                      active
                        ? "border-[#D97757]/40 bg-[#D97757]/10 text-[#D97757]"
                        : "border-[#ECE7DE] bg-white text-[#292524] hover:bg-[#F5F3EE]",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon && (
                        <Icon
                          className={cn(
                            "size-4",
                            active ? "text-[#D97757]" : "text-[#78716C]",
                          )}
                        />
                      )}
                      <span>{group.label}</span>
                    </div>
                    <ChevronRight className="size-4 text-[#78716C]" />
                  </Link>
                );
              }

              return null;
            })}
          </div>

          {/* 系统设置与退出 */}
          <div className="space-y-1 pt-2 border-t border-[#ECE7DE]">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium text-[#292524] hover:bg-[#F5F3EE] transition-colors active:scale-[0.99] active:duration-120"
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="size-4 text-[#78716C]" />
                <span>显示与高级设置</span>
              </div>
              <ChevronRight className="size-4 text-[#78716C]" />
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium text-[#C0685C] hover:bg-[#C0685C]/10 transition-colors active:scale-[0.99] active:duration-120"
            >
              <div className="flex items-center gap-2.5">
                <LogOut className="size-4" />
                <span>退出登录</span>
              </div>
            </button>
          </div>
        </AdaptiveSheetBody>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}

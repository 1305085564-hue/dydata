"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  AdaptiveSheetDescription,
  AdaptiveSheetBody,
} from "@/components/ui/adaptive-sheet";
import type { NavGroup, NavSubItem } from "@/components/nav-bar-items";
import { selectDashboardAccount } from "@/lib/dashboard-store";
import { createClient } from "@/lib/supabase/client";
import { clearScreenshotGrant } from "@/components/screenshot-grant";
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
  /** 只传底栏放不下的入口；底栏已有的不在这里重复 */
  navGroups: NavGroup[];
  accounts?: Account[];
  selectedAccountId?: string;
  onOpenSettings: () => void;
  onOpenCommandHub: () => void;
  bellBadgeCount?: number;
}

const ROW = "flex min-h-[44px] w-full items-center justify-between rounded-md px-3 text-left text-[14px] transition-colors duration-150";
const ROW_ON = "bg-[#F1F1F0] text-[#141413]";
const ROW_OFF = "text-[#1F1E1D] active:bg-[#EBEBE9]";
const SECTION_LABEL = "px-3 pb-1 text-[12px] text-[#78716C]";

/**
 * 手机「我的」抽屉：和桌面顶栏同一种说法——只有字、选中只用浅砂底。
 * 从上到下：待办 → 底栏放不下的页面 → 工作账号（两个以上才出现）→ 设置与退出。
 */
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
  const countLabel = bellBadgeCount > 99 ? "99+" : String(bellBadgeCount);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    await clearScreenshotGrant();
    window.location.href = "/login";
  };

  const navLink = (item: NavSubItem) => {
    const active = item.match(pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={() => onOpenChange(false)}
        className={cn(ROW, active ? ROW_ON : ROW_OFF)}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent id="mobile-navigation-menu" className="max-h-[92dvh] px-4 pt-2" aria-label="导航菜单">
        <AdaptiveSheetHeader>
          <AdaptiveSheetTitle>{name || "我的"}</AdaptiveSheetTitle>
          <AdaptiveSheetDescription className="text-[12px] text-[#78716C]">
            {getRoleLabel(role, { companyRole })}
          </AdaptiveSheetDescription>
        </AdaptiveSheetHeader>

        <AdaptiveSheetBody className="space-y-4 py-3">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenCommandHub();
            }}
            aria-label={`待办${bellBadgeCount > 0 ? ` ${countLabel} 项` : ""}：打开行动中枢（待办、审批与风险）`}
            className={cn(ROW, ROW_OFF, "border border-[#E2E2DF]")}
          >
            <span className={bellBadgeCount > 0 ? "text-[#141413]" : "text-[#78716C]"}>待办</span>
            {bellBadgeCount > 0 && <span className="tabular-nums text-[#141413]">{countLabel}</span>}
          </button>

          {navGroups.length > 0 && (
            <div className="space-y-0.5">
              {navGroups.map((group) => {
                if (group.href && group.match) {
                  return navLink({ href: group.href, label: group.label, match: group.match });
                }
                if (!group.children?.length) return null;
                return (
                  <div key={group.key} className="space-y-0.5 pt-2">
                    <div className={SECTION_LABEL}>{group.label}</div>
                    {group.children.map(navLink)}
                  </div>
                );
              })}
            </div>
          )}

          {accounts.length > 1 && (
            <div className="space-y-0.5 border-t border-[#E2E2DF]/60 pt-3">
              <div className={SECTION_LABEL}>工作账号</div>
              {accounts.map((account) => {
                const isSelected =
                  account.id === selectedAccountId || (!selectedAccountId && accounts[0]?.id === account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectDashboardAccount(account.id)}
                    className={cn(ROW, isSelected ? ROW_ON : ROW_OFF)}
                  >
                    <span className="truncate">{account.display_name || account.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-0.5 border-t border-[#E2E2DF]/60 pt-3">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
              className={cn(ROW, ROW_OFF)}
            >
              账号与偏好设置
            </button>
            <button type="button" onClick={handleSignOut} className={cn(ROW, ROW_OFF)}>
              退出登录
            </button>
          </div>
        </AdaptiveSheetBody>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}

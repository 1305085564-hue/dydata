"use client";

import { Settings, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import type { WorkGroupViews } from "@/lib/collaboration/types";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";
import type { CollaborationTabCounts } from "@/lib/collaboration/data/workbench-loader";
import { OneTip } from "./one-tip";

/** 一排切换：四个岗位与小队并列，少点一层。 */
export type CollaborationSegment = TabKey | "teams";

interface CollaborationWorkbenchToolbarProps {
  monthOptions: Array<{ year: number; month: number; label: string; value: string }>;
  currentMonthValue: string;
  segment: CollaborationSegment;
  loadFailed: boolean;
  canManageWorkGroups: boolean;
  hasActiveGroupDetail: boolean;
  resolvedWorkGroupViews?: WorkGroupViews;
  counts: CollaborationTabCounts;
  onMonthChange: (val: string | null) => void;
  onSegmentChange: (segment: CollaborationSegment) => void;
  onOpenManageDrawer: (groupId?: string | null) => void;
  onLeaderboardOpen: (open: boolean) => void;
}

export function CollaborationWorkbenchToolbar({
  monthOptions,
  currentMonthValue,
  segment,
  loadFailed,
  canManageWorkGroups,
  hasActiveGroupDetail,
  resolvedWorkGroupViews,
  counts,
  onMonthChange,
  onSegmentChange,
  onOpenManageDrawer,
  onLeaderboardOpen,
}: CollaborationWorkbenchToolbarProps) {
  const segments: Array<{ key: CollaborationSegment; label: string; count: number; tip?: string }> = [
    { key: "talents", label: "达人", count: counts.talents },
    {
      key: "writers",
      label: "文案",
      count: counts.writers,
      tip: "含已认证但本月还没有产出的文案；其余页签只计本月有产出的人。",
    },
    { key: "operators", label: "运营", count: counts.operators, tip: "只统计给别人账号做运营的人。" },
    { key: "editors", label: "剪辑", count: counts.editors, tip: "只统计给别人账号剪辑的人。" },
    { key: "teams", label: "小队", count: resolvedWorkGroupViews?.groups.length ?? counts.teams },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select value={currentMonthValue} onValueChange={onMonthChange}>
          <SelectTrigger
            aria-label="选择月份（← → 键也能翻月）"
            className="h-7 w-fit text-[14px] bg-transparent border-0 shadow-none hover:bg-[#EBEBE9] transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1F1E1D]/10 outline-none cursor-pointer"
          >
            <SelectValue placeholder="选择月份" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-[14px]">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div role="tablist" aria-label="选择岗位或小队" className="flex flex-wrap items-center gap-1">
          {segments.map((item) => {
            const active = segment === item.key;
            const button = (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSegmentChange(item.key)}
                className={`h-7 px-3 rounded-md text-[14px] transition-colors duration-150 cursor-pointer ${
                  active ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
                }`}
              >
                {item.label}
                <span className={`ml-1 tabular-nums ${active ? "text-[#78716C]" : "text-[#A8A29E]"}`}>{item.count}</span>
              </button>
            );
            return item.tip ? (
              <OneTip key={item.key} tip={item.tip} align="start" side="bottom">
                {button}
              </OneTip>
            ) : (
              button
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {segment === "teams" && !hasActiveGroupDetail && canManageWorkGroups && (
            <button
              type="button"
              onClick={() => onOpenManageDrawer(null)}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer"
            >
              <Settings className="size-3.5 text-[#78716C]" aria-hidden />
              管理小队
            </button>
          )}
          <button
            type="button"
            onClick={() => onLeaderboardOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer whitespace-nowrap"
          >
            <TrendingUp className="size-3.5 text-[#78716C]" aria-hidden />
            账号排行
          </button>
        </div>
      </div>
      {loadFailed && (
        <Alert variant="error">
          <span className="text-[#1F1E1D]">这个月的数据没加载出来</span>
          <span className="text-[#78716C]">· 表格暂时为空，刷新重试</span>
        </Alert>
      )}
    </div>
  );
}

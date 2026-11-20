"use client";

import { useState } from "react";
import type { FulfillmentMemberSummary } from "@/types/fulfillment";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ROSTER_SEGMENTS, type RosterSegment } from "../fulfillment-page-view";

interface FilterBarProps {
  members: FulfillmentMemberSummary[];
  segment: RosterSegment;
  segmentCounts: Record<RosterSegment, number>;
  onSegmentChange: (segment: RosterSegment) => void;
  selectedTeam: string | null;
  onTeamChange: (team: string | null) => void;
  feishuEnabled: boolean | null;
  settingsLoading: boolean;
  settingsError: string | null;
  isUpdatingSettings: boolean;
  onRetrySettings: () => void;
  onFeishuChange: (checked: boolean) => void;
}

const QUIET_BUTTON =
  "inline-flex h-7 min-h-[44px] sm:min-h-0 items-center justify-center rounded-md px-3 text-[14px] transition-colors duration-150 cursor-pointer";

/**
 * 发布管理工具栏：一排，和数据复盘、协作管理同一套语言。
 * 左：分段（全部 · 落后 · 断更），每段带人数，点一下大表只剩这些人。
 * 右：团队 ｜ 飞书催交（只有能改的人看得到）。
 * 月份不在这里——月份就在页头标题里。
 */
export function FilterBar({
  members,
  segment,
  segmentCounts,
  onSegmentChange,
  selectedTeam,
  onTeamChange,
  feishuEnabled,
  settingsLoading,
  settingsError,
  isUpdatingSettings,
  onRetrySettings,
  onFeishuChange,
}: FilterBarProps) {
  const [confirmToggleTarget, setConfirmToggleTarget] = useState<boolean | null>(null);

  const teams = Array.from(
    new Set(
      members
        .map((member) => member.teamName)
        .filter((teamName): teamName is string => Boolean(teamName)),
    ),
  ).sort();

  const showFeishu = feishuEnabled !== null || settingsLoading || Boolean(settingsError);

  const handleConfirmToggle = () => {
    if (confirmToggleTarget !== null) {
      onFeishuChange(confirmToggleTarget);
      setConfirmToggleTarget(null);
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 py-1">
      <div role="tablist" aria-label="按进度查看成员" className="flex flex-wrap items-center gap-1">
        {ROSTER_SEGMENTS.map((item) => {
          const active = segment === item.key;
          const count = segmentCounts[item.key];
          const button = (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSegmentChange(item.key)}
              className={cn(
                QUIET_BUTTON,
                active ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
              )}
            >
              {item.label}
              <span className={cn("ml-1 tabular-nums", active ? "text-[#78716C]" : "text-[#A8A29E]")}>{count}</span>
            </button>
          );
          return item.tip ? (
            <SimpleTooltip key={item.key} tip={item.tip} side="bottom" align="start">{button}</SimpleTooltip>
          ) : button;
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {teams.length > 1 && (
          <Select value={selectedTeam ?? ""} onValueChange={(value) => onTeamChange(value ? value : null)}>
            <SelectTrigger
              size="sm"
              aria-label="团队"
              className="h-7 w-auto min-w-28 gap-1 rounded-md border-0 bg-transparent px-2 text-[14px] text-[#1F1E1D] shadow-none hover:bg-[#EBEBE9] cursor-pointer"
            >
              <SelectValue placeholder="全部团队" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E2E2DF] bg-white">
              <SelectItem value="" className="text-[14px] cursor-pointer">全部团队</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team} value={team} className="text-[14px] cursor-pointer">
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showFeishu && (
          <>
            <span className="mx-1 hidden h-4 w-px bg-[#E2E2DF] sm:block" aria-hidden="true" />
            <SimpleTooltip tip="每天 18:00 给当天还没发的人发一条飞书提醒" side="bottom" align="end">
              <label className="flex h-7 items-center gap-2 px-1 text-[14px] text-[#1F1E1D]">
                飞书催交
                {settingsError ? (
                  <button
                    type="button"
                    onClick={onRetrySettings}
                    title={settingsError}
                    className="text-[14px] text-status-danger underline-offset-2 hover:underline cursor-pointer"
                  >
                    没读到，重试
                  </button>
                ) : settingsLoading || isUpdatingSettings ? (
                  <span className="text-[12px] text-[#78716C]">…</span>
                ) : (
                  <Switch
                    aria-label="飞书催交开关"
                    checked={Boolean(feishuEnabled)}
                    onCheckedChange={(checked) => setConfirmToggleTarget(checked)}
                  />
                )}
              </label>
            </SimpleTooltip>
          </>
        )}
      </div>

      <Dialog
        open={confirmToggleTarget !== null}
        onOpenChange={(open) => !open && setConfirmToggleTarget(null)}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmToggleTarget ? "开启飞书催交" : "暂停飞书催交"}</DialogTitle>
            <DialogDescription className="text-[14px] text-[#78716C]">
              {confirmToggleTarget
                ? "每天 18:00，当天还没发作品的人会收到一条飞书提醒。"
                : "暂停后不再发每天 18:00 的提醒，随时可以再打开。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="secondary" size="m" onClick={() => setConfirmToggleTarget(null)}>
              取消
            </Button>
            <Button variant={confirmToggleTarget ? "default" : "destructive"} size="m" onClick={handleConfirmToggle}>
              {confirmToggleTarget ? "开启" : "暂停"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

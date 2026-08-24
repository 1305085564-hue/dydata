"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { TimeRangePreset } from "@/types/fulfillment";
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

interface FilterBarProps {
  year: number;
  month: number;
  range: TimeRangePreset;
  members: FulfillmentMemberSummary[];
  selectedTeam: string | null;
  onTeamChange: (team: string | null) => void;
  onPresetChange: (
    preset: TimeRangePreset,
    targetYear: number,
    targetMonth: number,
  ) => void;
  feishuEnabled: boolean;
  settingsLoading: boolean;
  settingsError: string | null;
  isUpdatingSettings: boolean;
  onRetrySettings: () => void;
  onFeishuChange: (checked: boolean) => void;
}

const PRESET_OPTIONS: { value: TimeRangePreset; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "last7days", label: "最近7天" },
  { value: "thisMonth", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "custom", label: "自定义" },
];

function formatRangeLabel(
  preset: TimeRangePreset,
  year: number,
  month: number,
): string {
  switch (preset) {
    case "today":
      return new Date().toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
      });
    case "last7days":
      return "最近7天";
    case "thisMonth":
      return `${year}年${month}月`;
    case "lastMonth":
      return `${year}年${month}月`;
    case "custom":
      return "自定义时间段";
    default:
      return "";
  }
}

export function FilterBar({
  year,
  month,
  range,
  members,
  selectedTeam,
  onTeamChange,
  onPresetChange,
  feishuEnabled,
  settingsLoading,
  settingsError,
  isUpdatingSettings,
  onRetrySettings,
  onFeishuChange,
}: FilterBarProps) {
  const [confirmToggleTarget, setConfirmToggleTarget] = useState<
    boolean | null
  >(null);

  const teams = Array.from(
    new Set(
      members
        .map((member) => member.teamName)
        .filter((teamName): teamName is string => Boolean(teamName)),
    ),
  ).sort();

  const handlePresetChange = (preset: TimeRangePreset) => {
    const now = new Date();
    let targetYear = year;
    let targetMonth = month;

    if (preset === "today" || preset === "last7days" || preset === "thisMonth") {
      targetYear = now.getFullYear();
      targetMonth = now.getMonth() + 1;
    } else if (preset === "lastMonth") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      targetYear = d.getFullYear();
      targetMonth = d.getMonth() + 1;
    }

    onPresetChange(preset, targetYear, targetMonth);
  };

  const handleTeamChange = (value: string | null) => {
    onTeamChange(!value ? null : value);
  };

  const handleConfirmToggle = () => {
    if (confirmToggleTarget !== null) {
      onFeishuChange(confirmToggleTarget);
      setConfirmToggleTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 工具栏主体：时间胶囊 + 团队选择 + 飞书开关 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* 微气垫时间预设胶囊 */}
          <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#F5F3EE] border border-[#ECE7DE] p-1">
            {PRESET_OPTIONS.map((opt) => {
              const isActive = range === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePresetChange(opt.value)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-white text-[#D97757] shadow-2xs font-semibold"
                      : "text-[#666055] hover:text-[#1C1917] hover:bg-white/60"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 无框微气垫团队筛选 */}
          <Select value={selectedTeam ?? ""} onValueChange={handleTeamChange}>
            <SelectTrigger
              size="sm"
              className="h-8.5 w-36 rounded-xl border border-[#ECE7DE] bg-[#F5F3EE] text-[12px] font-medium text-[#3C3830] shadow-none transition-colors hover:bg-[#EFECE6] focus-visible:ring-1 focus-visible:ring-[#D97757]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF9F5]"
            >
              <SelectValue placeholder="全部团队" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E5E0D6]/80 bg-white/95 backdrop-blur-md shadow-claude-float">
              <SelectItem value="">全部团队</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team} value={team} className="text-[12px]">
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 飞书催交开关（沉静平铺） */}
        <div
          className="flex items-center gap-2 rounded-xl bg-[#F5F3EE] border border-[#ECE7DE] px-3 py-1.5 transition-colors"
          title="开启后，系统将在每日 18:00 自动向今日未提交视频的成员发送飞书消息提醒"
        >
          <span className="text-[12px] font-normal text-[#292524]">
            飞书自动催交
          </span>
          <span className="hidden text-[11px] text-[#78716C] font-normal sm:inline">
            (18:00 提醒)
          </span>
          {settingsError ? (
            <button
              type="button"
              onClick={onRetrySettings}
              className="text-[12px] font-medium text-[#C9604D] underline-offset-2 hover:underline"
              title={settingsError}
            >
              重试
            </button>
          ) : settingsLoading || isUpdatingSettings ? (
            <div className="size-3.5 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent" />
          ) : (
            <Switch
              aria-label="飞书自动催交总开关"
              checked={feishuEnabled}
              onCheckedChange={(checked) => setConfirmToggleTarget(checked)}
            />
          )}
        </div>
      </div>

      {/* 特殊范围说明指示 */}
      {(range === "last7days" || range === "custom") && (
        <div className="flex items-center gap-1.5 text-[12px] text-[#78716C] pt-0.5">
          <CalendarDays className="size-3.5 text-[#D97757]" />
          <span>
            当前范围：{formatRangeLabel(range, year, month)}
            {selectedTeam ? ` · ${selectedTeam}` : ""}
          </span>
          <span className="rounded-md bg-[#D97757]/10 px-1.5 py-0.5 text-[11px] font-normal text-[#D97757]">
            仅显示本月内数据
          </span>
        </div>
      )}

      {/* 确认弹窗 */}
      <Dialog
        open={confirmToggleTarget !== null}
        onOpenChange={(open) => !open && setConfirmToggleTarget(null)}
      >
        <DialogContent className="max-w-sm rounded-2xl bg-white p-6 shadow-claude-dialog border-[#E5E0D6]">
          <DialogHeader>
            <DialogTitle className="text-base font-medium text-[#1C1917]">
              {confirmToggleTarget
                ? "确认开启飞书自动催交"
                : "确认关闭飞书自动催交"}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#292524] mt-2">
              {confirmToggleTarget
                ? "开启后，系统将在每日 18:00 自动检查团队发布进度，并向未提交视频的成员发送飞书消息提醒。"
                : "关闭后，系统将停止每日 18:00 的飞书自动催交提醒。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-[#292524]"
              onClick={() => setConfirmToggleTarget(null)}
            >
              取消
            </Button>
            <Button
              variant={confirmToggleTarget ? "default" : "destructive"}
              size="sm"
              className={
                confirmToggleTarget
                  ? "rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white"
                  : "rounded-lg"
              }
              onClick={handleConfirmToggle}
            >
              {confirmToggleTarget ? "确认开启" : "确认关闭"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

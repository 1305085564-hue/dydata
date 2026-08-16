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
  onPresetChange: (preset: TimeRangePreset, targetYear: number, targetMonth: number) => void;
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

function formatRangeLabel(preset: TimeRangePreset, year: number, month: number): string {
  switch (preset) {
    case "today":
      return new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
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
  const [confirmToggleTarget, setConfirmToggleTarget] = useState<boolean | null>(null);

  const teams = Array.from(
    new Set(members.map((member) => member.teamName).filter((teamName): teamName is string => Boolean(teamName))),
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
    <div className="flex flex-col gap-3">
      {/* 时间筛选 + 团队筛选 行 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 微气垫 Tab 时间预设切换 */}
          <div className="inline-flex items-center gap-1 bg-zinc-100/70 p-1 rounded-xl select-none">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePresetChange(opt.value)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
                  range === opt.value
                    ? "bg-white text-zinc-950 shadow-2xs font-medium"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 结构呼吸微竖线 */}
          <div className="h-4 w-px bg-zinc-200 hidden sm:block mx-0.5 shrink-0" aria-hidden="true" />

          {/* 团队筛选 (平铺无框微胶囊) */}
          <Select value={selectedTeam ?? ""} onValueChange={handleTeamChange}>
            <SelectTrigger size="sm" className="h-7 w-36 rounded-lg border-0 bg-transparent hover:bg-zinc-100/80 px-2 text-xs text-zinc-700 hover:text-zinc-950 focus:ring-0 shadow-none">
              <SelectValue placeholder="全部团队" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部团队</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {/* 飞书催交总开关 */}
        <div 
          className="flex items-center gap-2 rounded-lg bg-zinc-50/80 px-3 py-1.5 transition-colors duration-200"
          title="开启后，系统将在每日 18:00 自动向今日未提交视频的成员发送飞书消息提醒"
        >
          <span className="text-[12px] font-medium text-zinc-700">飞书自动催交</span>
          <span className="text-[11px] text-zinc-400 font-normal hidden sm:inline">(18:00 提醒)</span>
          {settingsError ? (
            <button
              type="button"
              onClick={onRetrySettings}
              className="text-[12px] font-medium text-[#C9604D] underline-offset-2 hover:underline"
              title={settingsError}
            >
              设置加载失败 · 重试
            </button>
          ) : settingsLoading || isUpdatingSettings ? (
            <div className="size-4 animate-spin rounded-full border-2 border-[#D97757] border-t-transparent" />
          ) : (
            <Switch
              aria-label="飞书自动催交总开关"
              checked={feishuEnabled}
              onCheckedChange={(checked) => setConfirmToggleTarget(checked)}
            />
          )}
        </div>
      </div>

      {/* 当前范围指示 (仅在特殊范围呈现，默认隐去重复小字) */}
      {(range === "last7days" || range === "custom") && (
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <CalendarDays className="size-3.5 text-[#D99E55]" />
          <span>
            当前范围：{formatRangeLabel(range, year, month)}
            {selectedTeam ? ` · ${selectedTeam}` : ""}
          </span>
          <span className="rounded-md bg-[#D99E55]/10 px-1.5 py-0.5 text-[12px] font-normal text-[#D99E55]">
            仅显示本月内数据
          </span>
        </div>
      )}

      {/* 飞书催交开关确认弹窗 */}
      <Dialog open={confirmToggleTarget !== null} onOpenChange={(open) => !open && setConfirmToggleTarget(null)}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmToggleTarget ? "确认开启飞书自动催交？" : "确认关闭飞书自动催交？"}
            </DialogTitle>
            <DialogDescription className="text-zinc-600">
              {confirmToggleTarget
                ? "开启后，系统将在每日 18:00 自动检查团队履约进度，并向未提交视频的成员发送飞书应用消息提醒。"
                : "关闭后，系统将停止每日 18:00 的飞书自动催交提醒功能。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmToggleTarget(null)}>
              取消
            </Button>
            <Button
              variant={confirmToggleTarget ? "default" : "destructive"}
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

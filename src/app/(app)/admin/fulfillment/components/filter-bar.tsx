"use client";

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

interface FilterBarProps {
  year: number;
  month: number;
  range: TimeRangePreset;
  members: FulfillmentMemberSummary[];
  selectedTeam: string | null;
  selectedGroup: string | null;
  onTeamChange: (team: string | null) => void;
  onGroupChange: (group: string | null) => void;
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
  selectedGroup,
  onTeamChange,
  onGroupChange,
  onPresetChange,
  feishuEnabled,
  settingsLoading,
  settingsError,
  isUpdatingSettings,
  onRetrySettings,
  onFeishuChange,
}: FilterBarProps) {
  const teams = Array.from(
    new Set(members.map((member) => member.teamName).filter((teamName): teamName is string => Boolean(teamName))),
  ).sort();
  const groupSource = selectedTeam ? members.filter((member) => member.teamName === selectedTeam) : members;
  const groups = Array.from(
    new Set(groupSource.map((member) => member.groupName).filter((groupName): groupName is string => Boolean(groupName))),
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
    onGroupChange(null);
  };

  const handleGroupChange = (value: string | null) => {
    onGroupChange(!value ? null : value);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 时间筛选 + 团队筛选 行 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 时间预设按钮 */}
          <div className="flex items-center gap-1 rounded-lg bg-stone-100/50 p-1">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePresetChange(opt.value)}
                className={`rounded-md px-2.5 py-1 text-[13px] transition-all duration-150 ${
                  range === opt.value
                    ? "bg-white font-medium text-stone-900 ring-1 ring-stone-200"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 团队筛选 */}
          <Select value={selectedTeam ?? ""} onValueChange={handleTeamChange}>
            <SelectTrigger size="sm" className="w-40">
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

          {/* 小组筛选 */}
          <Select value={selectedGroup ?? ""} onValueChange={handleGroupChange}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="全部小组" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部小组</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 飞书催交总开关 */}
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 transition-colors duration-200">
          <span className="text-[12px] font-medium text-stone-700">飞书自动催交</span>
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
            <Switch checked={feishuEnabled} onCheckedChange={onFeishuChange} />
          )}
        </div>
      </div>

      {/* 当前范围指示 */}
      <div className="flex items-center gap-2 text-[12px] text-stone-500">
        <CalendarDays className="size-3.5" />
        <span>
          当前范围：{formatRangeLabel(range, year, month)}
          {selectedTeam ? ` · ${selectedTeam}` : ""}
          {selectedGroup ? ` · ${selectedGroup}` : ""}
        </span>
        {(range === "last7days" || range === "custom") && (
          <span className="rounded-md bg-[#D99E55]/10 px-1.5 py-0.5 text-[12px] font-normal text-[#D99E55]">
            仅显示本月内数据
          </span>
        )}
      </div>
    </div>
  );
}

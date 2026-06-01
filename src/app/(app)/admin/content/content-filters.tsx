"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getContentFilterLabel } from "./content-filter-labels";
import type { AnomalyStatus, Profile } from "@/types";

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export interface ContentFilterValue {
  profileId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  status: AnomalyStatus | "all";
  hasSnapshot: "all" | "yes" | "no";
  reviewed: "all" | "yes" | "no";
  feedbackStatus: "all" | "no_feedback" | "confirmed" | "sent" | "viewed";
  rankScope: "all" | "day" | "month";
  sortMode: "priority" | "latest" | "play";
}

interface ContentFiltersProps {
  profiles: FilterOption[];
  accounts: AccountOption[];
  onFilter: (value: ContentFilterValue) => void;
}

const INITIAL_FILTERS: ContentFilterValue = {
  profileId: "all",
  accountId: "all",
  startDate: "",
  endDate: "",
  status: "all",
  hasSnapshot: "all",
  reviewed: "all",
  feedbackStatus: "all",
  rankScope: "all",
  sortMode: "priority",
};

const STATUS_OPTIONS: Array<AnomalyStatus | "all"> = [
  "all",
  "正常",
  "删稿",
  "限流",
  "投流",
  "活动干预",
  "未满24h",
];

export function ContentFilters({ profiles, accounts, onFilter }: ContentFiltersProps) {
  const [filters, setFilters] = useState<ContentFilterValue>(INITIAL_FILTERS);

  useEffect(() => {
    onFilter(filters);
  }, [filters, onFilter]);

  function updateFilter<K extends keyof ContentFilterValue>(key: K, value: ContentFilterValue[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    setFilters(INITIAL_FILTERS);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
      <Select value={filters.profileId} onValueChange={(v) => updateFilter("profileId", v ?? "all")}>
        <SelectTrigger className="h-8 w-28 rounded-lg bg-white text-[12px]">
          <SelectValue>{getContentFilterLabel({ type: "profile", value: filters.profileId, options: profiles })}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部人员</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.accountId} onValueChange={(v) => updateFilter("accountId", v ?? "all")}>
        <SelectTrigger className="h-8 w-28 rounded-lg bg-white text-[12px]">
          <SelectValue>{getContentFilterLabel({ type: "account", value: filters.accountId, options: accounts })}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部账号</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(v) => updateFilter("status", v as AnomalyStatus | "all")}>
        <SelectTrigger className="h-8 w-24 rounded-lg bg-white text-[12px]">
          <SelectValue>{getContentFilterLabel({ type: "status", value: filters.status })}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>{s === "all" ? "全部状态" : s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.hasSnapshot} onValueChange={(v) => updateFilter("hasSnapshot", v as "all" | "yes" | "no")}>
        <SelectTrigger className="h-8 w-24 rounded-lg bg-white text-[12px]">
          <SelectValue>{getContentFilterLabel({ type: "hasSnapshot", value: filters.hasSnapshot })}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部快照</SelectItem>
          <SelectItem value="yes">有快照</SelectItem>
          <SelectItem value="no">无快照</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.reviewed} onValueChange={(v) => updateFilter("reviewed", v as "all" | "yes" | "no")}>
        <SelectTrigger className="h-8 w-24 rounded-lg bg-white text-[12px]">
          <SelectValue>{filters.reviewed === "all" ? "全部" : filters.reviewed === "yes" ? "已复盘" : "未复盘"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部</SelectItem>
          <SelectItem value="yes">已复盘</SelectItem>
          <SelectItem value="no">未复盘</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.feedbackStatus} onValueChange={(v) => updateFilter("feedbackStatus", v as "all" | "no_feedback" | "confirmed" | "sent" | "viewed")}>
        <SelectTrigger className="h-8 w-24 rounded-lg bg-white text-[12px]">
          <SelectValue>{getContentFilterLabel({ type: "feedbackStatus", value: filters.feedbackStatus })}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部反馈</SelectItem>
          <SelectItem value="no_feedback">未写反馈</SelectItem>
          <SelectItem value="confirmed">待下发</SelectItem>
          <SelectItem value="sent">已下发</SelectItem>
          <SelectItem value="viewed">员工已读</SelectItem>
        </SelectContent>
      </Select>

      <Select value={`${filters.rankScope}:${filters.sortMode}`} onValueChange={(v) => {
        if (!v) return;
        const [rank, sort] = v.split(":") as [ContentFilterValue["rankScope"], ContentFilterValue["sortMode"]];
        setFilters((cur) => ({ ...cur, rankScope: rank, sortMode: sort }));
      }}>
        <SelectTrigger className="h-8 w-28 rounded-lg bg-white text-[12px]">
          <SelectValue>
            {filters.rankScope === "day"
              ? "日排名"
              : filters.rankScope === "month"
              ? "月排名"
              : filters.sortMode === "play"
              ? "播放优先"
              : filters.sortMode === "latest"
              ? "最新优先"
              : "智能优先"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all:priority">智能优先</SelectItem>
          <SelectItem value="all:latest">最新优先</SelectItem>
          <SelectItem value="all:play">播放优先</SelectItem>
          <SelectItem value="day:play">日播放排名</SelectItem>
          <SelectItem value="month:play">月播放排名</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => updateFilter("startDate", e.target.value)}
          className="h-8 w-32 rounded-lg bg-white text-[12px]"
        />
        <span className="text-zinc-300">—</span>
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => updateFilter("endDate", e.target.value)}
          className="h-8 w-32 rounded-lg bg-white text-[12px]"
        />
      </div>

      <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 rounded-lg text-[12px] text-zinc-400">
        重置
      </Button>
    </div>
  );
}

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
  sortMode: "latest" | "play";
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
  sortMode: "latest",
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
    <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <Select value={filters.profileId} onValueChange={(v) => updateFilter("profileId", v ?? "all")}>
          <SelectTrigger className="h-9 w-36 rounded-xl bg-white text-[13px]">
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
          <SelectTrigger className="h-9 w-36 rounded-xl bg-white text-[13px]">
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
          <SelectTrigger className="h-9 w-32 rounded-xl bg-white text-[13px]">
            <SelectValue>{getContentFilterLabel({ type: "status", value: filters.status })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "全部状态" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.hasSnapshot} onValueChange={(v) => updateFilter("hasSnapshot", v as "all" | "yes" | "no")}>
          <SelectTrigger className="h-9 w-36 rounded-xl bg-white text-[13px]">
            <SelectValue>{getContentFilterLabel({ type: "hasSnapshot", value: filters.hasSnapshot })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部快照</SelectItem>
            <SelectItem value="yes">已有24h快照</SelectItem>
            <SelectItem value="no">暂无快照</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.reviewed} onValueChange={(v) => updateFilter("reviewed", v as "all" | "yes" | "no")}>
          <SelectTrigger className="h-9 w-32 rounded-xl bg-white text-[13px]">
            <SelectValue>{getContentFilterLabel({ type: "reviewed", value: filters.reviewed })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="yes">已复盘</SelectItem>
            <SelectItem value="no">未复盘</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.feedbackStatus} onValueChange={(v) => updateFilter("feedbackStatus", v as "all" | "no_feedback" | "confirmed" | "sent" | "viewed")}>
          <SelectTrigger className="h-9 w-36 rounded-xl bg-white text-[13px]">
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

        <Select value={filters.rankScope} onValueChange={(v) => updateFilter("rankScope", v as "all" | "day" | "month")}>
          <SelectTrigger className="h-9 w-36 rounded-xl bg-white text-[13px]">
            <SelectValue>{getContentFilterLabel({ type: "rankScope", value: filters.rankScope })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部播放排名</SelectItem>
            <SelectItem value="day">日播放排名</SelectItem>
            <SelectItem value="month">月播放排名</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.sortMode} onValueChange={(v) => updateFilter("sortMode", v as "latest" | "play")}>
          <SelectTrigger className="h-9 w-32 rounded-xl bg-white text-[13px]">
            <SelectValue>{getContentFilterLabel({ type: "sortMode", value: filters.sortMode })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">最新优先</SelectItem>
            <SelectItem value="play">播放优先</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => updateFilter("startDate", e.target.value)}
          className="h-9 w-36 rounded-xl bg-white text-[13px]"
          placeholder="开始日期"
        />
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => updateFilter("endDate", e.target.value)}
          className="h-9 w-36 rounded-xl bg-white text-[13px]"
          placeholder="结束日期"
        />

        <Button variant="ghost" size="sm" onClick={handleReset} className="h-9 rounded-xl text-[13px]">
          重置
        </Button>
      </div>
    </div>
  );
}

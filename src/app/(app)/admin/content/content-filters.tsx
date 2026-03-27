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
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap gap-3">
        <Select value={filters.profileId} onValueChange={(v) => updateFilter("profileId", v ?? "all")}>
          <SelectTrigger className="h-9 w-36 rounded-xl text-sm">
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
          <SelectTrigger className="h-9 w-36 rounded-xl text-sm">
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
          <SelectTrigger className="h-9 w-32 rounded-xl text-sm">
            <SelectValue>{getContentFilterLabel({ type: "status", value: filters.status })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "全部状态" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.hasSnapshot} onValueChange={(v) => updateFilter("hasSnapshot", v as "all" | "yes" | "no")}>
          <SelectTrigger className="h-9 w-36 rounded-xl text-sm">
            <SelectValue>{getContentFilterLabel({ type: "hasSnapshot", value: filters.hasSnapshot })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部快照</SelectItem>
            <SelectItem value="yes">已有24h快照</SelectItem>
            <SelectItem value="no">暂无快照</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.reviewed} onValueChange={(v) => updateFilter("reviewed", v as "all" | "yes" | "no")}>
          <SelectTrigger className="h-9 w-32 rounded-xl text-sm">
            <SelectValue>{getContentFilterLabel({ type: "reviewed", value: filters.reviewed })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="yes">已复盘</SelectItem>
            <SelectItem value="no">未复盘</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => updateFilter("startDate", e.target.value)}
          className="h-9 w-36 rounded-xl text-sm"
          placeholder="开始日期"
        />
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => updateFilter("endDate", e.target.value)}
          className="h-9 w-36 rounded-xl text-sm"
          placeholder="结束日期"
        />

        <Button variant="ghost" size="sm" onClick={handleReset} className="h-9 rounded-xl text-sm">
          重置
        </Button>
      </div>
    </div>
  );
}

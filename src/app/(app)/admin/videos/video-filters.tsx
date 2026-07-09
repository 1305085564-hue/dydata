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
import type { AnomalyStatus, Profile } from "@/types";

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export interface VideoFilterValue {
  profileId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  status: AnomalyStatus | "all";
}

interface VideoFiltersProps {
  profiles: FilterOption[];
  accounts: AccountOption[];
  onFilter: (value: VideoFilterValue) => void;
}

const INITIAL_FILTERS: VideoFilterValue = {
  profileId: "all",
  accountId: "all",
  startDate: "",
  endDate: "",
  status: "all",
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

function statusLabel(value: AnomalyStatus | "all") {
  return value === "all" ? "全部状态" : value;
}

export function VideoFilters({ profiles, accounts, onFilter }: VideoFiltersProps) {
  const [filters, setFilters] = useState<VideoFilterValue>(INITIAL_FILTERS);

  useEffect(() => {
    onFilter(filters);
  }, [filters, onFilter]);

  function updateFilter<Key extends keyof VideoFilterValue>(key: Key, value: VideoFilterValue[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    setFilters(INITIAL_FILTERS);
  }

  const profileLabel =
    filters.profileId === "all"
      ? "全部负责人"
      : profiles.find((item) => item.id === filters.profileId)?.name ?? "全部负责人";
  const accountLabel =
    filters.accountId === "all"
      ? "全部账号"
      : accounts.find((item) => item.id === filters.accountId)?.name ?? "全部账号";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3">
      <Select
        value={filters.profileId}
        onValueChange={(value) => updateFilter("profileId", value || "all")}
      >
        <SelectTrigger className="h-8 w-28 rounded-lg bg-white text-[12px]">
          <SelectValue>{profileLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部负责人</SelectItem>
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.accountId}
        onValueChange={(value) => updateFilter("accountId", value || "all")}
      >
        <SelectTrigger className="h-8 w-28 rounded-lg bg-white text-[12px]">
          <SelectValue>{accountLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部账号</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={filters.startDate}
          onChange={(event) => updateFilter("startDate", event.target.value)}
          className="h-8 w-32 rounded-lg bg-white text-[12px]"
        />
        <span className="text-stone-300">—</span>
        <Input
          type="date"
          value={filters.endDate}
          onChange={(event) => updateFilter("endDate", event.target.value)}
          className="h-8 w-32 rounded-lg bg-white text-[12px]"
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(value) => updateFilter("status", (value || "all") as VideoFilterValue["status"])}
      >
        <SelectTrigger className="h-8 w-24 rounded-lg bg-white text-[12px]">
          <SelectValue>{statusLabel(filters.status)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((status) => (
            <SelectItem key={status} value={status}>
              {statusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg text-[12px] text-stone-400"
        onClick={handleReset}
      >
        重置
      </Button>
    </div>
  );
}

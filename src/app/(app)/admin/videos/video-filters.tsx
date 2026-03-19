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
import { TAG_ENUMS, type AnomalyStatus, type Profile } from "@/types";

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export interface VideoFilterValue {
  profileId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  status: AnomalyStatus | "all";
  topicTags: string[];
  formatTags: string[];
  ctaTags: string[];
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
  topicTags: [],
  formatTags: [],
  ctaTags: [],
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

export function VideoFilters({ profiles, accounts, onFilter }: VideoFiltersProps) {
  const [filters, setFilters] = useState<VideoFilterValue>(INITIAL_FILTERS);

  useEffect(() => {
    onFilter(filters);
  }, [filters, onFilter]);

  function updateFilter<Key extends keyof VideoFilterValue>(key: Key, value: VideoFilterValue[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleArrayFilter(key: "topicTags" | "formatTags" | "ctaTags", value: string) {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  function handleReset() {
    setFilters(INITIAL_FILTERS);
  }

  return (
    <div className="rounded-[28px] border border-border/60 bg-muted/30 p-4 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl sm:p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">负责人</div>
          <Select value={filters.profileId} onValueChange={(value) => updateFilter("profileId", value || "all")}>
            <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
              <SelectValue placeholder="全部负责人" />
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
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">账号</div>
          <Select value={filters.accountId} onValueChange={(value) => updateFilter("accountId", value || "all")}>
            <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
              <SelectValue placeholder="全部账号" />
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
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">开始日期</div>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(event) => updateFilter("startDate", event.target.value)}
            className="h-11 rounded-2xl bg-background/80"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">结束日期</div>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(event) => updateFilter("endDate", event.target.value)}
            className="h-11 rounded-2xl bg-background/80"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">状态</div>
          <div className="flex gap-2">
            <Select value={filters.status} onValueChange={(value) => updateFilter("status", (value || "all") as VideoFilterValue["status"])}>
              <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all" ? "全部状态" : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-11 rounded-2xl bg-background/80 px-4" onClick={handleReset}>
              重置
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          { label: "题材", key: "topicTags" as const, options: TAG_ENUMS["题材"] },
          { label: "表达形式", key: "formatTags" as const, options: TAG_ENUMS["表达形式"] },
          { label: "CTA类型", key: "ctaTags" as const, options: TAG_ENUMS["CTA类型"] },
        ].map((group) => (
          <div key={group.label} className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = filters[group.key].includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleArrayFilter(group.key, option)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50",
                    ].join(" ")}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

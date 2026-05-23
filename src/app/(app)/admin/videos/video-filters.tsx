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

  const profileLabel =
    filters.profileId === "all"
      ? "全部负责人"
      : profiles.find((item) => item.id === filters.profileId)?.name ?? "全部负责人";
  const accountLabel =
    filters.accountId === "all"
      ? "全部账号"
      : accounts.find((item) => item.id === filters.accountId)?.name ?? "全部账号";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-1">
          <div className="text-[12px] text-zinc-500">负责人</div>
          <Select
            value={filters.profileId}
            onValueChange={(value) => updateFilter("profileId", value || "all")}
            items={[
              { value: "all", label: "全部负责人" },
              ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
            ]}
          >
            <SelectTrigger className="h-9 w-full rounded-xl bg-white text-[13px]">
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
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-zinc-500">账号</div>
          <Select
            value={filters.accountId}
            onValueChange={(value) => updateFilter("accountId", value || "all")}
            items={[
              { value: "all", label: "全部账号" },
              ...accounts.map((account) => ({ value: account.id, label: account.name })),
            ]}
          >
            <SelectTrigger className="h-9 w-full rounded-xl bg-white text-[13px]">
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
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-zinc-500">开始日期</div>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(event) => updateFilter("startDate", event.target.value)}
            className="h-9 rounded-xl bg-white text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-zinc-500">结束日期</div>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(event) => updateFilter("endDate", event.target.value)}
            className="h-9 rounded-xl bg-white text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-zinc-500">状态</div>
          <div className="flex gap-2">
            <Select
              value={filters.status}
              onValueChange={(value) => updateFilter("status", (value || "all") as VideoFilterValue["status"])}
              items={STATUS_OPTIONS.map((status) => ({ value: status, label: statusLabel(status) }))}
            >
              <SelectTrigger className="h-9 w-full rounded-xl bg-white text-[13px]">
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
              variant="outline"
              className="h-9 rounded-xl bg-white px-4 text-[13px]"
              onClick={handleReset}
            >
              重置
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-zinc-100">
        {[
          { label: "题材", key: "topicTags" as const, options: TAG_ENUMS["题材"] },
          { label: "表达形式", key: "formatTags" as const, options: TAG_ENUMS["表达形式"] },
          { label: "CTA类型", key: "ctaTags" as const, options: TAG_ENUMS["CTA类型"] },
        ].map((group) => (
          <div
            key={group.label}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
          >
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              {group.label}
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {group.options.map((option) => {
                const active = filters[group.key].includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleArrayFilter(group.key, option)}
                    className={[
                      "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                      active
                        ? "bg-white text-zinc-700"
                        : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100",
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

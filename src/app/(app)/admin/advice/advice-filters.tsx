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
import type { AdviceSource, AdviceStatus, Profile } from "@/types";

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export interface AdviceFilterValue {
  profileId: string;
  accountId: string;
  status: AdviceStatus | "all";
  source: AdviceSource | "all";
  startDate: string;
  endDate: string;
}

interface AdviceFiltersProps {
  profiles: FilterOption[];
  accounts: AccountOption[];
  onFilter: (value: AdviceFilterValue) => void;
}

const INITIAL_FILTERS: AdviceFilterValue = {
  profileId: "all",
  accountId: "all",
  status: "all",
  source: "all",
  startDate: "",
  endDate: "",
};

const STATUS_OPTIONS: Array<AdviceStatus | "all"> = ["all", "待查看", "已查看", "待执行", "已执行", "已忽略", "已复核"];
const SOURCE_OPTIONS: Array<AdviceSource | "all"> = ["all", "ai", "manager"];

function statusLabel(value: AdviceStatus | "all") {
  return value === "all" ? "全部状态" : value;
}

function sourceLabel(value: AdviceSource | "all") {
  if (value === "all") return "全部来源";
  return value === "ai" ? "AI" : "管理员";
}

export function AdviceFilters({ profiles, accounts, onFilter }: AdviceFiltersProps) {
  const [filters, setFilters] = useState<AdviceFilterValue>(INITIAL_FILTERS);

  useEffect(() => {
    onFilter(filters);
  }, [filters, onFilter]);

  function updateFilter<Key extends keyof AdviceFilterValue>(key: Key, value: AdviceFilterValue[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const profileLabel =
    filters.profileId === "all"
      ? "全部员工"
      : profiles.find((item) => item.id === filters.profileId)?.name ?? "全部员工";
  const accountLabel =
    filters.accountId === "all"
      ? "全部账号"
      : accounts.find((item) => item.id === filters.accountId)?.name ?? "全部账号";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-1">
          <div className="text-[12px] text-stone-500">员工</div>
          <Select
            value={filters.profileId}
            onValueChange={(value) => updateFilter("profileId", value || "all")}
            items={[
              { value: "all", label: "全部员工" },
              ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
            ]}
          >
            <SelectTrigger className="h-9 w-full rounded-xl bg-white text-[13px]">
              <SelectValue>{profileLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部员工</SelectItem>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-stone-500">账号</div>
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
          <div className="text-[12px] text-stone-500">状态</div>
          <Select
            value={filters.status}
            onValueChange={(value) => updateFilter("status", (value || "all") as AdviceFilterValue["status"])}
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
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-stone-500">来源</div>
          <Select
            value={filters.source}
            onValueChange={(value) => updateFilter("source", (value || "all") as AdviceFilterValue["source"])}
            items={SOURCE_OPTIONS.map((source) => ({ value: source, label: sourceLabel(source) }))}
          >
            <SelectTrigger className="h-9 w-full rounded-xl bg-white text-[13px]">
              <SelectValue>{sourceLabel(filters.source)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((source) => (
                <SelectItem key={source} value={source}>
                  {sourceLabel(source)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-stone-500">开始日期</div>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(event) => updateFilter("startDate", event.target.value)}
            className="h-9 rounded-xl bg-white text-[13px]"
          />
        </div>

        <div className="space-y-1">
          <div className="text-[12px] text-stone-500">结束日期</div>
          <div className="flex gap-2">
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => updateFilter("endDate", event.target.value)}
              className="h-9 rounded-xl bg-white text-[13px]"
            />
            <Button
              variant="outline"
              className="h-9 rounded-xl bg-white px-4 text-[13px]"
              onClick={() => setFilters(INITIAL_FILTERS)}
            >
              重置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

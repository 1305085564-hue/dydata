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

export function AdviceFilters({ profiles, accounts, onFilter }: AdviceFiltersProps) {
  const [filters, setFilters] = useState<AdviceFilterValue>(INITIAL_FILTERS);

  useEffect(() => {
    onFilter(filters);
  }, [filters, onFilter]);

  function updateFilter<Key extends keyof AdviceFilterValue>(key: Key, value: AdviceFilterValue[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">员工</div>
          <Select
            value={filters.profileId}
            onValueChange={(value) => updateFilter("profileId", value || "all")}
            items={[
              { value: "all", label: "全部员工" },
              ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
            ]}
          >
            <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
              <SelectValue placeholder="全部员工" />
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

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">账号</div>
          <Select
            value={filters.accountId}
            onValueChange={(value) => updateFilter("accountId", value || "all")}
            items={[
              { value: "all", label: "全部账号" },
              ...accounts.map((account) => ({ value: account.id, label: account.name })),
            ]}
          >
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
          <div className="text-sm font-medium text-foreground">状态</div>
          <Select
            value={filters.status}
            onValueChange={(value) => updateFilter("status", (value || "all") as AdviceFilterValue["status"])}
            items={STATUS_OPTIONS.map((status) => ({ value: status, label: status === "all" ? "全部状态" : status }))}
          >
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
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">来源</div>
          <Select
            value={filters.source}
            onValueChange={(value) => updateFilter("source", (value || "all") as AdviceFilterValue["source"])}
            items={SOURCE_OPTIONS.map((source) => ({
              value: source,
              label: source === "all" ? "全部来源" : source === "ai" ? "AI" : "管理员",
            }))}
          >
            <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
              <SelectValue placeholder="全部来源" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((source) => (
                <SelectItem key={source} value={source}>
                  {source === "all" ? "全部来源" : source === "ai" ? "AI" : "管理员"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">开始日期</div>
          <Input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} className="h-11 rounded-2xl bg-background/80" />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">结束日期</div>
          <div className="flex gap-2">
            <Input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} className="h-11 rounded-2xl bg-background/80" />
            <Button variant="outline" className="h-11 rounded-2xl bg-background/80 px-4" onClick={() => setFilters(INITIAL_FILTERS)}>
              重置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import {
  CUSTOM_PLAY_BUCKET_KEY,
  PLAY_BUCKETS,
  buildAccountDisplayLabels,
  getSecondaryFilterSummary,
} from "@/lib/content/domain/content-list-filters";
import { DataHighlightPanel, FilterChipOption } from "./content-list-highlight-panel";

type MoreFiltersProps = Pick<
  ContentListState,
  | "filters"
  | "updateFilter"
  | "applyFilterPatch"
  | "accountOptions"
  | "handlePlayBucketChange"
  | "handleAddHighlightRule"
  | "handleRemoveHighlightRule"
  | "handleToggleHighlightOnly"
>;

/** 「更多筛选」只收低频条件：账号、播放量档位、数据高亮。评级与异常在分段里，不在这里重复。 */
export function ContentListMoreFilters({
  filters,
  updateFilter,
  applyFilterPatch,
  accountOptions,
  handlePlayBucketChange,
  handleAddHighlightRule,
  handleRemoveHighlightRule,
  handleToggleHighlightOnly,
}: MoreFiltersProps) {
  const [open, setOpen] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const accountDisplayLabels = useMemo(() => buildAccountDisplayLabels(accountOptions), [accountOptions]);
  const filteredAccounts = useMemo(() => {
    const keyword = accountQuery.trim().toLowerCase();
    return keyword ? accountOptions.filter((account) => account.name.toLowerCase().includes(keyword)) : accountOptions;
  }, [accountOptions, accountQuery]);
  // 摘要只说这里管的条件；评级由分段负责，传 all 排除掉
  const summary = useMemo(() => {
    // gate:transient-map temporary call-local projection
    const accountMap = new Map(accountOptions.map((account) => [account.id, account.name]));
    return getSecondaryFilterSummary({ ...filters, qualityGrade: "all" }, accountMap);
  }, [accountOptions, filters]);

  const clearMore = () => applyFilterPatch({
    accountId: "",
    playBucket: "",
    playMin: "",
    playMax: "",
    topicStatus: "all",
    highlightRules: {},
    highlightOnly: false,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex h-7 min-h-[44px] sm:min-h-0 items-center gap-1 rounded-md px-2 text-[14px] transition-colors cursor-pointer outline-none",
          summary.isActive ? "bg-[#F1F1F0] text-[#141413]" : "text-[#1F1E1D] hover:bg-[#EBEBE9]",
          "data-popup-open:bg-[#EBEBE9]",
        )}
      >
        <span className="max-w-[180px] truncate">{summary.isActive ? summary.label : "更多筛选"}</span>
        <ChevronDown className="size-4 shrink-0 text-[#78716C]" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-[340px] max-w-[calc(100vw-2rem)] max-h-[min(36rem,var(--available-height))] overflow-y-auto p-3 text-[#1F1E1D]"
      >
        <section className="space-y-2">
          <h3 className="text-[12px] text-[#78716C]">账号</h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#A8A29E]" aria-hidden="true" />
            <Input
              value={accountQuery}
              onChange={(event) => setAccountQuery(event.target.value)}
              placeholder="搜索账号…"
              aria-label="搜索账号"
              className="h-8 pl-7 text-[14px]"
            />
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            <AccountRow label="全部账号" selected={!filters.accountId} onClick={() => updateFilter("accountId", "")} />
            {filteredAccounts.map((account) => (
              <AccountRow
                key={account.id}
                label={accountDisplayLabels.get(account.id) ?? account.name}
                selected={filters.accountId === account.id}
                onClick={() => updateFilter("accountId", account.id)}
              />
            ))}
            {filteredAccounts.length === 0 && <p className="px-2 py-1 text-[12px] text-[#78716C]">没有匹配的账号</p>}
          </div>
        </section>

        <section className="mt-4 space-y-2 border-t border-[#E2E2DF]/60 pt-3">
          <h3 className="text-[12px] text-[#78716C]">播放量</h3>
          <div className="grid grid-cols-3 gap-1">
            <FilterChipOption label="不限" selected={!filters.playBucket || filters.playBucket === "all"} onClick={() => handlePlayBucketChange("all")} />
            {PLAY_BUCKETS.map((bucket) => (
              <FilterChipOption key={bucket.key} label={bucket.label} selected={filters.playBucket === bucket.key} onClick={() => handlePlayBucketChange(bucket.key)} />
            ))}
            <FilterChipOption label="自定义" selected={filters.playBucket === CUSTOM_PLAY_BUCKET_KEY} onClick={() => handlePlayBucketChange(CUSTOM_PLAY_BUCKET_KEY)} />
          </div>
          {filters.playBucket === CUSTOM_PLAY_BUCKET_KEY && (
            <div className="flex items-center gap-2">
              <Input type="number" min={0} inputMode="numeric" value={filters.playMin} onChange={(e) => updateFilter("playMin", e.target.value)} placeholder="最小" aria-label="播放量最小值" className="h-8 flex-1 text-[14px]" />
              <span className="text-[12px] text-[#A8A29E]">–</span>
              <Input type="number" min={0} inputMode="numeric" value={filters.playMax} onChange={(e) => updateFilter("playMax", e.target.value)} placeholder="最大" aria-label="播放量最大值" className="h-8 flex-1 text-[14px]" />
            </div>
          )}
        </section>

        <section className="mt-4 space-y-2 border-t border-[#E2E2DF]/60 pt-3">
          <h3 className="text-[12px] text-[#78716C]">数据高亮</h3>
          <DataHighlightPanel
            filters={filters}
            handleAddHighlightRule={handleAddHighlightRule}
            handleRemoveHighlightRule={handleRemoveHighlightRule}
            handleToggleHighlightOnly={handleToggleHighlightOnly}
          />
        </section>

        {summary.isActive && (
          <button
            type="button"
            onClick={clearMore}
            className="mt-3 w-full rounded-md py-1 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
          >
            清空这里的条件
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AccountRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[14px] transition-colors cursor-pointer",
        selected ? "bg-[#F1F1F0] text-[#141413]" : "text-[#1F1E1D] hover:bg-[#EBEBE9]",
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="size-3.5 shrink-0 text-[#141413]" aria-hidden="true" />}
    </button>
  );
}

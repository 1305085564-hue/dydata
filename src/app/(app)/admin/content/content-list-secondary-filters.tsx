"use client";

import { ChevronDown, ChevronRight, X, Search, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CUSTOM_PLAY_BUCKET_KEY,
  PLAY_BUCKETS,
  buildAccountDisplayLabels,
} from "./content-list-filters";
import { DataHighlightPanel, FilterChipOption } from "./content-list-highlight-panel";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";

type SectionKey = "account" | "play" | "grade" | "highlight";

const GRADE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "全部" },
  { value: "excellent", label: "优" },
  { value: "good", label: "良" },
  { value: "fair", label: "普" },
  { value: "unrated", label: "未评级" },
];

type ContentListSecondaryFiltersProps = Pick<ContentListProps, "view"> &
  Pick<
    ContentListState,
    | "filters"
    | "updateFilter"
    | "secondarySummary"
    | "isSecondaryOpen"
    | "setIsSecondaryOpen"
    | "accountOptions"
    | "accountLabel"
    | "playLabel"
    | "gradeLabel"
    | "handlePlayBucketChange"
    | "handleClearSecondaryFilters"
    | "handleAddHighlightRule"
    | "handleRemoveHighlightRule"
    | "handleToggleHighlightOnly"
  >;

export function ContentListSecondaryFilters({
  view,
  filters,
  updateFilter,
  secondarySummary,
  isSecondaryOpen,
  setIsSecondaryOpen,
  accountOptions,
  accountLabel,
  playLabel,
  gradeLabel,
  handlePlayBucketChange,
  handleClearSecondaryFilters,
  handleAddHighlightRule,
  handleRemoveHighlightRule,
  handleToggleHighlightOnly,
}: ContentListSecondaryFiltersProps) {
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
  const [accountQuery, setAccountQuery] = useState("");

  const filteredAccountOptions = useMemo(() => {
    const keyword = accountQuery.trim().toLowerCase();
    if (!keyword) return accountOptions;
    return accountOptions.filter((account) => account.name.toLowerCase().includes(keyword));
  }, [accountOptions, accountQuery]);

  const accountDisplayLabels = useMemo(
    () => buildAccountDisplayLabels(accountOptions),
    [accountOptions],
  );

  const activeRuleCount = Object.keys(filters.highlightRules).length;
  const toggleSection = (section: SectionKey) =>
    setExpandedSection((prev) => (prev === section ? null : section));

  if (view !== "all") return null;

  return (
    <div className="inline-flex items-center">
      <Popover open={isSecondaryOpen} onOpenChange={setIsSecondaryOpen}>
        <PopoverTrigger
          type="button"
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-between gap-1 rounded-md px-2 text-[14px] transition-colors cursor-pointer select-none outline-none",
            secondarySummary.isActive
              ? "bg-[#F1F1F0] text-[#141413]"
              : "text-[#1F1E1D] hover:bg-[#EBEBE9]",
            "data-popup-open:bg-[#EBEBE9]",
          )}
        >
          <span className="truncate max-w-[180px]">
            {secondarySummary.isActive ? `筛选 · ${secondarySummary.label}` : "筛选"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#78716C]" />
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={4}
          className="w-[340px] max-w-[calc(100vw-2rem)] max-h-[min(32rem,var(--available-height))] overflow-y-auto p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl text-[#1F1E1D]"
        >
          <SectionHeader
            label="指定账号"
            summary={accountLabel}
            active={Boolean(filters.accountId)}
            expanded={expandedSection === "account"}
            onToggle={() => toggleSection("account")}
          />
          {expandedSection === "account" && (
            <div className="mx-1 mb-1 rounded-xl bg-[#F7F7F6] p-2 space-y-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#A8A29E]" aria-hidden="true" />
                <Input
                  value={accountQuery}
                  onChange={(event) => setAccountQuery(event.target.value)}
                  placeholder="搜索账号…"
                  aria-label="搜索账号"
                  className="h-7 w-full rounded-md border-[#E2E2DF] bg-white pl-7 pr-2 text-[12px] shadow-input"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1">
                <OptionRow
                  label="全部账号"
                  selected={!filters.accountId}
                  onClick={() => updateFilter("accountId", "")}
                />
                {filteredAccountOptions.map((a) => (
                  <OptionRow
                    key={a.id}
                    label={accountDisplayLabels.get(a.id) ?? a.name}
                    selected={filters.accountId === a.id}
                    onClick={() => updateFilter("accountId", a.id)}
                  />
                ))}
                {filteredAccountOptions.length === 0 && (
                  <div className="px-2 py-1 text-[12px] text-[#78716C]">没有匹配的账号</div>
                )}
              </div>
            </div>
          )}

          <SectionHeader
            label="播放量档位"
            summary={playLabel}
            active={Boolean(filters.playBucket)}
            expanded={expandedSection === "play"}
            onToggle={() => toggleSection("play")}
          />
          {expandedSection === "play" && (
            <div className="mx-1 mb-1 rounded-xl bg-[#F7F7F6] p-2 space-y-2">
              <div className="grid grid-cols-2 gap-1">
                <FilterChipOption
                  label="全部流量"
                  selected={!filters.playBucket || filters.playBucket === "all"}
                  onClick={() => handlePlayBucketChange("all")}
                />
                {PLAY_BUCKETS.map((bucket) => (
                  <FilterChipOption
                    key={bucket.key}
                    label={bucket.label}
                    selected={filters.playBucket === bucket.key}
                    onClick={() => handlePlayBucketChange(bucket.key)}
                  />
                ))}
                <FilterChipOption
                  label="自定义区间"
                  selected={filters.playBucket === CUSTOM_PLAY_BUCKET_KEY}
                  onClick={() => handlePlayBucketChange(CUSTOM_PLAY_BUCKET_KEY)}
                />
              </div>
              {filters.playBucket === CUSTOM_PLAY_BUCKET_KEY && (
                <div className="flex items-center gap-1 pt-1 border-t border-[#E2E2DF]/60">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.playMin}
                    onChange={(e) => updateFilter("playMin", e.target.value)}
                    placeholder="最小"
                    aria-label="播放量最小值"
                    className="h-7 flex-1 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
                  />
                  <span className="text-[12px] text-[#A8A29E]">-</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.playMax}
                    onChange={(e) => updateFilter("playMax", e.target.value)}
                    placeholder="最大"
                    aria-label="播放量最大值"
                    className="h-7 flex-1 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
                  />
                </div>
              )}
            </div>
          )}

          <SectionHeader
            label="评级"
            summary={gradeLabel}
            active={Boolean(filters.qualityGrade && filters.qualityGrade !== "all")}
            expanded={expandedSection === "grade"}
            onToggle={() => toggleSection("grade")}
          />
          {expandedSection === "grade" && (
            <div className="mx-1 mb-1 rounded-xl bg-[#F7F7F6] p-2">
              <div className="grid grid-cols-5 gap-1">
                {GRADE_OPTIONS.map((opt) => (
                  <FilterChipOption
                    key={opt.value}
                    label={opt.label}
                    selected={(filters.qualityGrade || "all") === opt.value}
                    onClick={() => updateFilter("qualityGrade", opt.value)}
                  />
                ))}
              </div>
            </div>
          )}

          <SectionHeader
            label="数据高亮"
            summary={activeRuleCount > 0 ? `${activeRuleCount} 条` : "未设置"}
            active={activeRuleCount > 0}
            expanded={expandedSection === "highlight"}
            onToggle={() => toggleSection("highlight")}
          />
          {expandedSection === "highlight" && (
            <DataHighlightPanel
              filters={filters}
              handleAddHighlightRule={handleAddHighlightRule}
              handleRemoveHighlightRule={handleRemoveHighlightRule}
              handleToggleHighlightOnly={handleToggleHighlightOnly}
            />
          )}

          {secondarySummary.isActive && (
            <>
              <div className="-mx-1 my-1 h-px bg-[#E2E2DF]/60" />
              <button
                type="button"
                onClick={handleClearSecondaryFilters}
                className="flex w-full cursor-pointer items-center px-2 py-1 text-[12px] text-[#78716C] hover:text-status-danger hover:bg-status-danger/5 rounded-md transition-colors"
              >
                清空筛选
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      {secondarySummary.isActive && (
        <SimpleTooltip tip="清除次级筛选条件" align="end">
          <button
            type="button"
            onClick={handleClearSecondaryFilters}
            className="ml-1 inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center p-1 text-[#78716C] hover:text-status-danger rounded-md transition-colors cursor-pointer"
            aria-label="清除次级筛选条件"
          >
            <X className="size-3.5 sm:size-3" />
          </button>
        </SimpleTooltip>
      )}
    </div>
  );
}

function SectionHeader({
  label,
  summary,
  active,
  expanded,
  onToggle,
}: {
  label: string;
  summary: string;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left transition-colors",
        expanded ? "bg-[#EBEBE9]" : "hover:bg-[#EBEBE9]",
      )}
    >
      <span className="text-[14px] text-[#1F1E1D]">{label}</span>
      <span
        className={cn(
          "ml-auto mr-1 truncate max-w-[130px] rounded-md px-1 text-[12px]",
          active ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C]",
        )}
      >
        {summary}
      </span>
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-[#78716C] transition-transform duration-100",
          expanded && "rotate-90",
        )}
      />
    </button>
  );
}

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
        selected
          ? "bg-white text-[#141413] shadow-input"
          : "text-[#1F1E1D] hover:bg-[#EBEBE9]",
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="size-3.5 shrink-0 text-[#D97757]" />}
    </button>
  );
}

import { ChevronDown, X, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CUSTOM_PLAY_BUCKET_KEY, PLAY_BUCKETS, buildAccountDisplayLabels } from "./content-list-filters";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";

type ContentListSecondaryFiltersProps = Pick<ContentListProps, "view" | "canReviewContent"> &
  Pick<ContentListState, "filters" | "updateFilter" | "secondarySummary" | "isSecondaryOpen" | "setIsSecondaryOpen" | "accountOptions" | "accountLabel" | "playLabel" | "gradeLabel" | "topicStatusLabel" | "handlePlayBucketChange" | "handleClearSecondaryFilters">;

export function ContentListSecondaryFilters({
  view,
  canReviewContent,
  filters,
  updateFilter,
  secondarySummary,
  isSecondaryOpen,
  setIsSecondaryOpen,
  accountOptions,
  accountLabel,
  playLabel,
  gradeLabel,
  topicStatusLabel,
  handlePlayBucketChange,
  handleClearSecondaryFilters,
}: ContentListSecondaryFiltersProps) {
  // 账号下拉 35 项扁平、无搜索、同名无法区分（2026-10-11 审计 M5）。
  // 搜索只作用于本地下拉列表，不改动筛选结果本身。
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

  return (
    <>
{/* 4. 折叠次级筛选 (Pop-over) */}
{view === "all" && (
  <div className="inline-flex items-center">
    <DropdownMenu open={isSecondaryOpen} onOpenChange={setIsSecondaryOpen}>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-between gap-1 rounded-md border border-[#E2E2DF] bg-white shadow-input px-2.5 text-[13px] transition-all cursor-pointer select-none outline-none hover:bg-[#EBEBE9] focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10 data-popup-open:border-[#78716C]",
          secondarySummary.isActive
            ? "text-[#141413] font-medium shadow-input"
            : "text-[#1F1E1D] font-normal"
        )}
        title={secondarySummary.fullDescription}
      >
        {/* 胶囊固定只显示「筛选」：选中值交给下拉每行右侧回显，避免顶部与菜单重复；
            激活态仍靠加粗墨色 + 右侧 × 提示「有筛选」，悬停 title 可看完整摘要 */}
        <span>筛选</span>
        <ChevronDown className="size-4 text-[#78716C]" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-56 p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl text-[#1F1E1D]"
      >
        <DropdownMenuGroup>
          {/* 1. 选题库状态 */}
          {canReviewContent && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
                <span className="text-[13px] text-[#1F1E1D]">选题库状态</span>
                <span
                  className={cn(
                    "ml-auto text-[12px] mr-1",
                    filters.topicStatus && filters.topicStatus !== "all"
                      ? "text-[#141413] font-medium"
                      : "text-[#78716C]"
                  )}
                >
                  {topicStatusLabel}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-36 p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl">
                <DropdownMenuRadioGroup
                  value={filters.topicStatus || "all"}
                  onValueChange={(val) => updateFilter("topicStatus", val)}
                >
                  <DropdownMenuRadioItem
                    value="all"
                    className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                  >
                    全部
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="in_library"
                    className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                  >
                    已入库
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="removed"
                    className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                  >
                    已移出
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* 2. 指定账号 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
              <span className="text-[13px] text-[#1F1E1D]">指定账号</span>
              <span
                className={cn(
                  "ml-auto text-[12px] mr-1 truncate max-w-24",
                  filters.accountId ? "text-[#141413] font-medium" : "text-[#78716C]"
                )}
              >
                {accountLabel}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl">
              <div className="sticky top-0 z-10 bg-white pb-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#A8A29E]" aria-hidden="true" />
                  <Input
                    value={accountQuery}
                    onChange={(event) => setAccountQuery(event.target.value)}
                    // 下拉内的输入框：阻止冒泡，否则按键会被菜单当成导航吞掉
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="搜索账号…"
                    aria-label="搜索账号"
                    className="h-6 w-full rounded-md border-[#E2E2DF] bg-white pl-6 pr-1.5 text-[12px] shadow-input"
                  />
                </div>
              </div>
              <DropdownMenuRadioGroup
                value={filters.accountId || "all"}
                onValueChange={(val) => updateFilter("accountId", val === "all" ? "" : (val ?? ""))}
              >
                <DropdownMenuRadioItem
                  value="all"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  全部账号
                </DropdownMenuRadioItem>
                {filteredAccountOptions.map((a) => (
                  <DropdownMenuRadioItem
                    key={a.id}
                    value={a.id}
                    className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                  >
                    {accountDisplayLabels.get(a.id) ?? a.name}
                  </DropdownMenuRadioItem>
                ))}
                {filteredAccountOptions.length === 0 && (
                  <div className="px-2 py-1.5 text-[12px] text-[#78716C]">没有匹配的账号</div>
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* 3. 24h 播放量档位 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
              <span className="text-[13px] text-[#1F1E1D]">播放量档位</span>
              <span
                className={cn(
                  "ml-auto text-[12px] mr-1 truncate max-w-20",
                  filters.playBucket ? "text-[#141413] font-medium" : "text-[#78716C]"
                )}
              >
                {playLabel}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl">
              <DropdownMenuRadioGroup
                value={filters.playBucket || "all"}
                onValueChange={handlePlayBucketChange}
              >
                <DropdownMenuRadioItem
                  value="all"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  全部流量
                </DropdownMenuRadioItem>
                {PLAY_BUCKETS.map((bucket) => (
                  <DropdownMenuRadioItem
                    key={bucket.key}
                    value={bucket.key}
                    className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                  >
                    {bucket.label}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem
                  value={CUSTOM_PLAY_BUCKET_KEY}
                  closeOnClick={false}
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  自定义区间…
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              {filters.playBucket === CUSTOM_PLAY_BUCKET_KEY && (
                <div
                  className="flex items-center gap-1 p-1 pt-1.5 border-t border-[#E2E2DF]/60 mt-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.playMin}
                    onChange={(e) => updateFilter("playMin", e.target.value)}
                    placeholder="最小"
                    className="h-6 flex-1 rounded-md border-[#E2E2DF] bg-white px-1.5 text-[12px] shadow-input"
                  />
                  <span className="text-[12px] text-[#A8A29E]">-</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.playMax}
                    onChange={(e) => updateFilter("playMax", e.target.value)}
                    placeholder="最大"
                    className="h-6 flex-1 rounded-md border-[#E2E2DF] bg-white px-1.5 text-[12px] shadow-input"
                  />
                </div>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* 4. 评级 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
              <span className="text-[13px] text-[#1F1E1D]">评级</span>
              <span
                className={cn(
                  "ml-auto text-[12px] mr-1",
                  filters.qualityGrade && filters.qualityGrade !== "all"
                    ? "text-[#141413] font-medium"
                    : "text-[#78716C]"
                )}
              >
                {gradeLabel}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-36 p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl">
              <DropdownMenuRadioGroup
                value={filters.qualityGrade || "all"}
                onValueChange={(val) => updateFilter("qualityGrade", val)}
              >
                <DropdownMenuRadioItem
                  value="all"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  全部
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="excellent"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  优
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="good"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  良
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="fair"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  普
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="poor"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  劣
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="unrated"
                  className="cursor-pointer py-1.5 px-2 text-[13px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  未评级
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {secondarySummary.isActive && (
          <>
            <DropdownMenuSeparator className="-mx-1 my-1 h-px bg-[#E2E2DF]/60" />
            <DropdownMenuItem
              onClick={handleClearSecondaryFilters}
              className="cursor-pointer py-1.5 px-2 text-[12px] text-[#78716C] hover:text-status-danger focus:text-status-danger hover:bg-status-danger/5 focus:bg-status-danger/5 rounded-md transition-colors"
            >
              清空筛选
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    {secondarySummary.isActive && (
      <button
        type="button"
        onClick={handleClearSecondaryFilters}
        className="ml-0.5 inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center p-1 text-[#78716C] hover:text-status-danger rounded-md transition-colors cursor-pointer"
        title="清除次级筛选条件"
      >
        <X className="size-3.5 sm:size-3" />
      </button>
    )}
  </div>
)}
    </>
  );
}

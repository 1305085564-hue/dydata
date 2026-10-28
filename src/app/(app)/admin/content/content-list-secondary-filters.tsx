import { ChevronDown, X, Search, Check } from "lucide-react";
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
import {
  CUSTOM_PLAY_BUCKET_KEY,
  PLAY_BUCKETS,
  buildAccountDisplayLabels,
  type ContentListFilterValue,
} from "./content-list-filters";
import {
  HIGHLIGHT_FIELDS,
  formatHighlightRuleLabel,
  getHighlightFieldMeta,
  type HighlightFieldKey,
  type HighlightRule,
} from "@/lib/content/domain/content-list-highlight";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";

type ContentListSecondaryFiltersProps = Pick<ContentListProps, "view"> &
  Pick<ContentListState, "filters" | "updateFilter" | "secondarySummary" | "isSecondaryOpen" | "setIsSecondaryOpen" | "accountOptions" | "accountLabel" | "playLabel" | "gradeLabel" | "handlePlayBucketChange" | "handleClearSecondaryFilters" | "handleAddHighlightRule" | "handleRemoveHighlightRule" | "handleToggleHighlightOnly">;

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
          "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-between gap-1 rounded-md px-2.5 text-[14px] transition-colors cursor-pointer select-none outline-none",
          secondarySummary.isActive
            ? "bg-[#F1F1F0] text-[#141413]"
            : "text-[#1F1E1D] hover:bg-[#EBEBE9]",
          "data-popup-open:bg-[#EBEBE9]"
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
          {/* 1. 指定账号 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
              <span className="text-[14px] text-[#1F1E1D]">指定账号</span>
              <span
                className={cn(
                  "ml-auto text-[12px] mr-1 truncate max-w-24",
                  filters.accountId ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C]"
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
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  全部账号
                </DropdownMenuRadioItem>
                {filteredAccountOptions.map((a) => (
                  <DropdownMenuRadioItem
                    key={a.id}
                    value={a.id}
                    className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
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
              <span className="text-[14px] text-[#1F1E1D]">播放量档位</span>
              <span
                className={cn(
                  "ml-auto text-[12px] mr-1 truncate max-w-20",
                  filters.playBucket ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C]"
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
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  全部流量
                </DropdownMenuRadioItem>
                {PLAY_BUCKETS.map((bucket) => (
                  <DropdownMenuRadioItem
                    key={bucket.key}
                    value={bucket.key}
                    className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                  >
                    {bucket.label}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem
                  value={CUSTOM_PLAY_BUCKET_KEY}
                  closeOnClick={false}
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
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
              <span className="text-[14px] text-[#1F1E1D]">评级</span>
              <span
                className={cn(
                  "ml-auto text-[12px] mr-1",
                  filters.qualityGrade && filters.qualityGrade !== "all"
                    ? "bg-[#F1F1F0] text-[#141413]"
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
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  全部
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="excellent"
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  优
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="good"
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  良
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="fair"
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  普
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="poor"
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  劣
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="unrated"
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  未评级
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* 5. 数据高亮 */}
          <DataHighlightSubmenu
            filters={filters}
            handleAddHighlightRule={handleAddHighlightRule}
            handleRemoveHighlightRule={handleRemoveHighlightRule}
            handleToggleHighlightOnly={handleToggleHighlightOnly}
          />
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

/**
 * 「数据高亮」子菜单：选字段 → 填「不低于/低于」→ 添加；已设规则成可删芯片。
 * 非法输入（负数/非数字/下限≥上限）用红边提示并禁用添加，绝不静默接受。
 */
function DataHighlightSubmenu({
  filters,
  handleAddHighlightRule,
  handleRemoveHighlightRule,
  handleToggleHighlightOnly,
}: {
  filters: ContentListFilterValue;
  handleAddHighlightRule: (key: HighlightFieldKey, rule: HighlightRule) => void;
  handleRemoveHighlightRule: (key: HighlightFieldKey) => void;
  handleToggleHighlightOnly: () => void;
}) {
  const [pendingField, setPendingField] = useState<HighlightFieldKey | null>(null);
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");

  const meta = pendingField ? getHighlightFieldMeta(pendingField) : null;
  const minNum = minInput.trim() === "" ? null : Number(minInput);
  const maxNum = maxInput.trim() === "" ? null : Number(maxInput);
  const minInvalid = minNum !== null && (!Number.isFinite(minNum) || minNum < 0);
  const maxInvalid = maxNum !== null && (!Number.isFinite(maxNum) || maxNum < 0);
  const orderInvalid = !minInvalid && !maxInvalid && minNum !== null && maxNum !== null && minNum >= maxNum;
  const bothEmpty = minNum === null && maxNum === null;
  const canAdd = meta !== null && !minInvalid && !maxInvalid && !orderInvalid && !bothEmpty;

  const activeRuleKeys = Object.keys(filters.highlightRules) as HighlightFieldKey[];

  const handleAdd = () => {
    if (!canAdd || !pendingField) return;
    handleAddHighlightRule(pendingField, { min: minNum, max: maxNum });
    setMinInput("");
    setMaxInput("");
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
        <span className="text-[14px] text-[#1F1E1D]">数据高亮</span>
        <span
          className={cn(
            "ml-auto text-[12px] mr-1",
            activeRuleKeys.length > 0 ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C]"
          )}
        >
          {activeRuleKeys.length > 0 ? `${activeRuleKeys.length} 条` : "未设置"}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-60 p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl">
        {/* 字段选择：嵌套子菜单，12 项可滚动 */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer py-1.5 px-2 rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9] data-popup-open:bg-[#EBEBE9] transition-colors">
            <span className="text-[14px] text-[#1F1E1D]">选择字段</span>
            <span
              className={cn(
                "ml-auto text-[12px] mr-1",
                pendingField ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C]"
              )}
            >
              {meta ? meta.label : "未选"}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36 max-h-72 overflow-y-auto p-1 bg-white border border-[#E2E2DF] shadow-claude-float rounded-xl">
            <DropdownMenuRadioGroup
              value={pendingField ?? ""}
              onValueChange={(val) => setPendingField((val as HighlightFieldKey) || null)}
            >
              {HIGHLIGHT_FIELDS.map((field) => (
                <DropdownMenuRadioItem
                  key={field.key}
                  value={field.key}
                  closeOnClick={false}
                  className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
                >
                  {field.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* 区间输入：含下限、不含上限，与播放档位口径一致 */}
        <div
          className="flex items-center gap-1 px-1 pt-1.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Input
            type="number"
            min={0}
            step={meta?.step ?? 1}
            inputMode="decimal"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            placeholder={meta ? `不低于(${meta.unit})` : "不低于"}
            aria-label="高亮区间下限"
            className={cn(
              "h-6 flex-1 rounded-md bg-white px-1.5 text-[12px] shadow-input",
              minInvalid || orderInvalid ? "border-status-danger" : "border-[#E2E2DF]"
            )}
          />
          <span className="text-[12px] text-[#A8A29E]">~</span>
          <Input
            type="number"
            min={0}
            step={meta?.step ?? 1}
            inputMode="decimal"
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            placeholder={meta ? `低于(${meta.unit})` : "低于"}
            aria-label="高亮区间上限"
            className={cn(
              "h-6 flex-1 rounded-md bg-white px-1.5 text-[12px] shadow-input",
              maxInvalid || orderInvalid ? "border-status-danger" : "border-[#E2E2DF]"
            )}
          />
        </div>

        <div
          className="flex items-center justify-between gap-1 px-1 pt-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="min-w-0 truncate text-[12px] text-status-danger">
            {minInvalid || maxInvalid
              ? "请输入不小于 0 的数字"
              : orderInvalid
                ? "下限必须小于上限"
                : ""}
          </span>
          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-[12px] transition-colors",
              canAdd
                ? "cursor-pointer border-[#E2E2DF] bg-white text-[#1F1E1D] hover:bg-[#EBEBE9]"
                : "cursor-not-allowed border-[#E2E2DF]/60 bg-[#F1F1F0] text-[#A8A29E]"
            )}
          >
            添加
          </button>
        </div>

        {activeRuleKeys.length === 0 ? (
          <div className="px-2 pb-1 pt-1.5 text-[12px] text-[#78716C]">
            命中区间的数据会淡色高亮
          </div>
        ) : (
          <>
            <DropdownMenuSeparator className="-mx-1 my-1 h-px bg-[#E2E2DF]/60" />
            <div className="px-2 pb-0.5 text-[12px] text-[#78716C]">已设规则（同字段覆盖）</div>
            {activeRuleKeys.map((key) => {
              const rule = filters.highlightRules[key];
              if (!rule) return null;
              return (
                <div key={key} className="flex items-center gap-1 px-2 py-0.5">
                  <span className="inline-flex items-center rounded bg-status-warning/[0.12] px-1.5 py-0.5 text-[12px] text-status-warning">
                    {formatHighlightRuleLabel(key, rule)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveHighlightRule(key);
                    }}
                    className="ml-auto cursor-pointer rounded p-0.5 text-[#A8A29E] transition-colors hover:bg-status-danger/5 hover:text-status-danger"
                    aria-label={`删除规则 ${formatHighlightRuleLabel(key, rule)}`}
                    title="删除该规则"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
            <DropdownMenuSeparator className="-mx-1 my-1 h-px bg-[#E2E2DF]/60" />
            <DropdownMenuItem
              onClick={handleToggleHighlightOnly}
              closeOnClick={false}
              className="cursor-pointer py-1.5 px-2 text-[14px] rounded-md hover:bg-[#EBEBE9] focus:bg-[#EBEBE9]"
            >
              <Check className={cn("mr-1 size-3.5", filters.highlightOnly ? "text-status-warning" : "opacity-0")} />
              只看命中高亮的行
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

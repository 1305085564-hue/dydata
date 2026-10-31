import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { CALENDAR_CARD_CLASS, MonthCalendar } from "@/components/calendar/month-calendar";
import { getShanghaiDateString } from "./content-list-filters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import { MemberSelect } from "./member-select";
import { ContentListSecondaryFilters } from "./content-list-secondary-filters";
import { ExpandableSearch } from "./expandable-search";

type ContentListFiltersViewProps = Pick<ContentListProps, "view" | "perspective" | "onPerspectiveChange" | "teamId" | "onTeamChange" | "teams" | "canSwitchPerspective" | "profiles"> &
  Pick<ContentListState, "filters" | "updateFilter" | "applyFilterPatch" | "handleTimeRangeChange" | "profileLabel" | "secondarySummary" | "isSecondaryOpen" | "setIsSecondaryOpen" | "accountOptions" | "accountLabel" | "playLabel" | "gradeLabel" | "handlePlayBucketChange" | "timeRangeLabel" | "selectedTeamName" | "handleClearSecondaryFilters" | "hasActiveFilters" | "handleResetFilters" | "handleAddHighlightRule" | "handleRemoveHighlightRule" | "handleToggleHighlightOnly">;

export function ContentListFiltersView({
  view,
  perspective,
  onPerspectiveChange,
  teamId,
  onTeamChange,
  teams = [],
  canSwitchPerspective,
  profiles,
  filters,
  updateFilter,
  applyFilterPatch,
  handleTimeRangeChange,
  profileLabel,
  secondarySummary,
  isSecondaryOpen,
  setIsSecondaryOpen,
  accountOptions,
  accountLabel,
  playLabel,
  gradeLabel,
  handlePlayBucketChange,
  timeRangeLabel,
  selectedTeamName,
  handleClearSecondaryFilters,
  hasActiveFilters,
  handleResetFilters,
  handleAddHighlightRule,
  handleRemoveHighlightRule,
  handleToggleHighlightOnly,
}: ContentListFiltersViewProps) {
  const today = getShanghaiDateString();
  const [rangeDraft, setRangeDraft] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [viewMonth, setViewMonth] = useState(() => {
    const [year, month] = (filters.startDate || today).split("-").map(Number);
    return { year, month };
  });
  const start = rangeDraft.start ?? (filters.startDate || null);
  const end = rangeDraft.start ? rangeDraft.end : (filters.endDate || null);
  const labelDate = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
  return (
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* 1. 团队/公司组织范围视角 */}
          {(teams.length > 0 || canSwitchPerspective) && (
            <Select
              value={perspective === "company" ? "all_company" : (teamId ?? teams[0]?.id ?? "all_company")}
              onValueChange={(val) => {
                if (val === "all_company") {
                  onPerspectiveChange?.("company");
                } else {
                  onTeamChange?.(val);
                }
              }}
            >
              <SelectTrigger size="sm" variant="borderless" className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 cursor-pointer">
                <SelectValue placeholder="选择范围">
                  {perspective === "company" ? "全公司" : (selectedTeamName ?? "选择团队")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {canSwitchPerspective && (
                  <SelectItem value="all_company">全公司</SelectItem>
                )}
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* 2. 时间切片（非自定义档位） */}
          {view === "all" && filters.timeRange !== "custom" && (
            <Select
              value={filters.timeRange}
              onValueChange={handleTimeRangeChange}
            >
              <SelectTrigger size="sm" variant="borderless" className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 cursor-pointer">
                <SelectValue>{timeRangeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">最近一天</SelectItem>
                <SelectItem value="7d">近7天</SelectItem>
                <SelectItem value="30d">近30天</SelectItem>
                <SelectItem value="thisMonth">本月</SelectItem>
                <SelectItem value="custom">自定义日期…</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* 自定义档位：一个控件承载「切换档位 + 填起止日期」，避免并排多个控件把工具栏挤成两行 */}
          {view === "all" && filters.timeRange === "custom" && (
            <Popover>
              <PopoverTrigger
                aria-label="选择时间范围与自定义日期"
                className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center gap-1 rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] text-[#1F1E1D] shadow-input cursor-pointer transition-colors hover:bg-[#EBEBE9]"
              >
                {timeRangeLabel}
                <ChevronDownIcon className="size-4 text-[#78716C]" aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent className={CALENDAR_CARD_CLASS}>
                <div className="flex flex-col gap-1">
                  <div className="px-1 pb-0.5 text-[12px] text-[#78716C]">时间范围</div>
                  {[
                    { value: "all", label: "最近一天" },
                    { value: "7d", label: "近7天" },
                    { value: "30d", label: "近30天" },
                    { value: "thisMonth", label: "本月" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleTimeRangeChange(opt.value)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-[14px] text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div className="my-1.5 h-px bg-[#E2E2DF]" />
                  <div className="px-1 pb-0.5 text-[12px] text-[#78716C]">自定义日期</div>
                  <div className="px-1 text-[12px] text-[#78716C]">
                    {start && end ? `已选：${labelDate(start)} - ${labelDate(end)}` : "点第一天，再点最后一天"}
                  </div>
                  <MonthCalendar
                    today={today}
                    viewMonth={viewMonth}
                    onMonthShift={(direction) => setViewMonth((previous) => {
                      const next = new Date(previous.year, previous.month - 1 + direction, 1);
                      return { year: next.getFullYear(), month: next.getMonth() + 1 };
                    })}
                    selectedDates={[start, end].filter((date): date is string => Boolean(date))}
                    onSelectDate={(date) => {
                      if (!rangeDraft.start) {
                        setRangeDraft({ start: date, end: null });
                      } else if (date !== rangeDraft.start) {
                        const [rangeStart, rangeEnd] = [rangeDraft.start, date].sort();
                        applyFilterPatch({ startDate: rangeStart, endDate: rangeEnd });
                        setRangeDraft({ start: null, end: null });
                      }
                    }}
                    cellClass={(date) => start && end && date > start && date < end ? "bg-status-info/[0.06]" : ""}
                  />
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* 3. 负责人选择器（带搜索，一页可看更多人） */}
          <MemberSelect
            value={filters.userId}
            onChange={(val) => updateFilter("userId", val)}
            profiles={profiles}
            label={profileLabel}
          />

          <ContentListSecondaryFilters
            view={view}
            filters={filters}
            updateFilter={updateFilter}
            secondarySummary={secondarySummary}
            isSecondaryOpen={isSecondaryOpen}
            setIsSecondaryOpen={setIsSecondaryOpen}
            accountOptions={accountOptions}
            accountLabel={accountLabel}
            playLabel={playLabel}
            gradeLabel={gradeLabel}
            handlePlayBucketChange={handlePlayBucketChange}
            handleClearSecondaryFilters={handleClearSecondaryFilters}
            handleAddHighlightRule={handleAddHighlightRule}
            handleRemoveHighlightRule={handleRemoveHighlightRule}
            handleToggleHighlightOnly={handleToggleHighlightOnly}
          />

          {/* 5. 可展开搜索框 */}
          <ExpandableSearch
            value={filters.keyword}
            onChange={(val) => updateFilter("keyword", val)}
            placeholder="搜索标题/文案…"
          />

          {/* 6. 重置按钮 */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 rounded-md px-2 text-[14px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D] cursor-pointer transition-colors"
            >
              重置
            </button>
          )}
        </div>

  );
}

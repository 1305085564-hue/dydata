import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import { MemberSelect } from "./member-select";
import { ContentListSecondaryFilters } from "./content-list-secondary-filters";
import { ExpandableSearch } from "./expandable-search";

type ContentListFiltersViewProps = Pick<ContentListProps, "view" | "perspective" | "onPerspectiveChange" | "teamId" | "onTeamChange" | "teams" | "canSwitchPerspective" | "profiles"> &
  Pick<ContentListState, "filters" | "updateFilter" | "profileLabel" | "secondarySummary" | "isSecondaryOpen" | "setIsSecondaryOpen" | "accountOptions" | "accountLabel" | "playLabel" | "gradeLabel" | "handlePlayBucketChange" | "selectedTeamName" | "handleClearSecondaryFilters" | "hasActiveFilters" | "handleResetFilters" | "handleAddHighlightRule" | "handleRemoveHighlightRule" | "handleToggleHighlightOnly">;

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
  profileLabel,
  secondarySummary,
  isSecondaryOpen,
  setIsSecondaryOpen,
  accountOptions,
  accountLabel,
  playLabel,
  gradeLabel,
  handlePlayBucketChange,
  selectedTeamName,
  handleClearSecondaryFilters,
  hasActiveFilters,
  handleResetFilters,
  handleAddHighlightRule,
  handleRemoveHighlightRule,
  handleToggleHighlightOnly,
}: ContentListFiltersViewProps) {
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

      {/* 2. 负责人选择器（带搜索，一页可看更多人） */}
      <MemberSelect
        value={filters.userId}
        onChange={(val) => updateFilter("userId", val)}
        profiles={profiles}
        label={profileLabel}
      />

      {/* 3. 二级筛选（指定账号、播放量、评级、数据高亮） */}
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

      {/* 4. 可展开搜索框 */}
      <ExpandableSearch
        value={filters.keyword}
        onChange={(val) => updateFilter("keyword", val)}
        placeholder="搜索标题/文案…"
      />

      {/* 5. 重置按钮 */}
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

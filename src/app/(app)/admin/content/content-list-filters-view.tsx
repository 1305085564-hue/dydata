import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import { ContentListSecondaryFilters } from "./content-list-secondary-filters";

type ContentListFiltersViewProps = Pick<ContentListProps, "view" | "perspective" | "onPerspectiveChange" | "teamId" | "onTeamChange" | "teams" | "canSwitchPerspective" | "profiles" | "canReviewContent"> &
  Pick<ContentListState, "filters" | "updateFilter" | "handleTimeRangeChange" | "profileLabel" | "secondarySummary" | "isSecondaryOpen" | "setIsSecondaryOpen" | "accountOptions" | "accountLabel" | "playLabel" | "gradeLabel" | "topicStatusLabel" | "handlePlayBucketChange" | "timeRangeLabel" | "selectedTeamName" | "handleClearSecondaryFilters" | "hasActiveFilters" | "handleResetFilters">;

export function ContentListFiltersView({
  view,
  perspective,
  onPerspectiveChange,
  teamId,
  onTeamChange,
  teams = [],
  canSwitchPerspective,
  profiles,
  canReviewContent,
  filters,
  updateFilter,
  handleTimeRangeChange,
  profileLabel,
  secondarySummary,
  isSecondaryOpen,
  setIsSecondaryOpen,
  accountOptions,
  accountLabel,
  playLabel,
  gradeLabel,
  topicStatusLabel,
  handlePlayBucketChange,
  timeRangeLabel,
  selectedTeamName,
  handleClearSecondaryFilters,
  hasActiveFilters,
  handleResetFilters,
}: ContentListFiltersViewProps) {
  return (
        <div className="flex items-center gap-2 flex-wrap ml-auto">
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
              <SelectTrigger size="sm" className="cursor-pointer">
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

          {/* 2. 时间切片 */}
          {view === "all" && (
            <Select
              value={filters.timeRange}
              onValueChange={handleTimeRangeChange}
            >
              <SelectTrigger size="sm" className="cursor-pointer">
                <SelectValue>{timeRangeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">时间</SelectItem>
                <SelectItem value="yesterday">昨天</SelectItem>
                <SelectItem value="7d">近7天</SelectItem>
                <SelectItem value="30d">近30天</SelectItem>
                <SelectItem value="thisMonth">本月</SelectItem>
                <SelectItem value="custom">自定义日期…</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* 自定义日期起止输入框 */}
          {filters.timeRange === "custom" && view === "all" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter("startDate", e.target.value)}
                aria-label="开始日期"
                className="h-7 w-28 rounded-md border-[#E2E2DF] bg-white px-1.5 text-[12px] shadow-input"
              />
              <span className="text-[12px] text-[#A8A29E]">-</span>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilter("endDate", e.target.value)}
                aria-label="结束日期"
                className="h-7 w-28 rounded-md border-[#E2E2DF] bg-white px-1.5 text-[12px] shadow-input"
              />
            </div>
          )}

          {/* 3. 负责人选择器 */}
          <Select
            value={filters.userId || "all"}
            onValueChange={(val) => updateFilter("userId", val === "all" ? "" : val ?? "")}
          >
            <SelectTrigger size="sm" className="cursor-pointer">
              <SelectValue>{profileLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">人员</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ContentListSecondaryFilters
            view={view}
            canReviewContent={canReviewContent}
            filters={filters}
            updateFilter={updateFilter}
            secondarySummary={secondarySummary}
            isSecondaryOpen={isSecondaryOpen}
            setIsSecondaryOpen={setIsSecondaryOpen}
            accountOptions={accountOptions}
            accountLabel={accountLabel}
            playLabel={playLabel}
            gradeLabel={gradeLabel}
            topicStatusLabel={topicStatusLabel}
            handlePlayBucketChange={handlePlayBucketChange}
            handleClearSecondaryFilters={handleClearSecondaryFilters}
          />

          {/* 5. 搜索框 */}
          <Input
            value={filters.keyword}
            onChange={(e) => updateFilter("keyword", e.target.value)}
            placeholder="搜索标题/文案…"
            aria-label="搜索标题或文案"
            className="h-7 w-32 md:w-40 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
          />

          {/* 6. 重置按钮 */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="h-7 rounded-md px-2 text-[13px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D] cursor-pointer transition-colors"
            >
              重置
            </button>
          )}
        </div>

  );
}

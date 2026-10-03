import { FilterBar } from "@/components/ui/filter-bar";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import { ContentListViewControls } from "./content-list-view-controls";
import { ContentListFiltersView } from "./content-list-filters-view";

export type ContentListToolbarProps = ContentListProps & ContentListState;

export function ContentListToolbar(props: ContentListToolbarProps) {
  return (
    <FilterBar className="sticky top-[calc(var(--app-top-offset,64px)+0.5rem)] z-20 w-full justify-between gap-2 bg-[#FCFCFB] py-1">
      {/* 左翼：视图切换 (全部/归档) + 异常快捷开关 */}
      <ContentListViewControls {...props} />

      {/* 右翼：视角 → 时间 → 人员 → 筛选 → 搜索 → 重置 */}
      <ContentListFiltersView {...props} />
    </FilterBar>
  );
}

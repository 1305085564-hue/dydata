import { FilterBar } from "@/components/ui/filter-bar";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import { ContentListViewControls } from "./content-list-view-controls";
import { ContentListFiltersView } from "./content-list-filters-view";
import { DatePagination } from "./date-pagination";
import type React from "react";

export type ContentListToolbarProps = ContentListProps & ContentListState & {
  dateNav?: React.ComponentProps<typeof DatePagination> | null;
};

export function ContentListToolbar(props: ContentListToolbarProps) {
  const { dateNav, ...rest } = props;
  return (
    <FilterBar className="sticky top-[calc(var(--app-top-offset,64px)+0.5rem)] z-20 w-full gap-2 flex-wrap bg-[#FCFCFB] py-1">
      {/* 左段：日期翻页器 → 视角 → 时间 → 人员 → 筛选 → 搜索 → 重置（紧挨日期） */}
      {dateNav && <DatePagination {...dateNav} />}
      <ContentListFiltersView {...rest} />

      {/* 右段：视图切换 (全部/归档) + 异常快捷开关 + 完整/宽松，独占最右 */}
      <ContentListViewControls {...rest} className="ml-auto" />
    </FilterBar>
  );
}

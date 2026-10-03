"use client";

import { useCallback, useMemo } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import { useContentListState } from "@/lib/content/domain/content-list-state";
import { useContentListData } from "@/lib/content/data/content-list";
import { ContentListToolbar } from "./content-list-toolbar";
import { ContentListTable } from "./content-list-table";

export type { ContentListProps } from "@/lib/content/domain/content-list";

export function ContentList(props: ContentListProps) {
  const state = useContentListState(props);
  const { processedRows } = useContentListData({
    videos: props.videos,
    snapshots: props.snapshots,
    reviewReadiness: props.reviewReadiness,
    contentQualityByVideoId: props.contentQualityByVideoId,
    filters: state.filters,
    sortField: state.sortField,
    sortDir: state.sortDir,
  });
  const { setCurrentPage, setPageSize, tableContainerRef } = state;

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [setCurrentPage, tableContainerRef]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [setPageSize, setCurrentPage, tableContainerRef]);

  // 数据范围变化后 currentPage 可能越界：分页控件内部会把页码夹到最后一页，
  // 但切片若仍用原始页码就会「分页器显示第 1 页、表格却是空」；统一按有效页码切片与传值
  const totalPages = Math.max(1, Math.ceil(processedRows.length / state.pageSize));
  const safeCurrentPage = Math.min(state.currentPage, totalPages);

  const visibleRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * state.pageSize;
    return processedRows.slice(start, start + state.pageSize);
  }, [safeCurrentPage, state.pageSize, processedRows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 筛选工具栏：裸放于桌面，纯净无底无框，sticky 遮挡滚动 */}
      <ContentListToolbar {...props} {...state} />

      {/* 对比表格容器 */}
      <ContentListTable
        metricViewMode={state.metricViewMode}
        visibleRows={visibleRows}
        tableContainerRef={state.tableContainerRef}
        emptyTitle={state.emptyTitle}
        emptyDescription={state.emptyDescription}
        sortField={state.sortField}
        sortDir={state.sortDir}
        handleSort={state.handleSort}
        canReviewContent={state.canReviewContent}
        onSelectVideoId={props.onSelectVideoId}
      />

      {/* 极客级专业分页底栏（精准绑定当前队列实际数据量） */}
      {processedRows.length > 0 && (
        <TablePagination
          currentPage={safeCurrentPage}
          pageSize={state.pageSize}
          totalCount={processedRows.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[20, 30, 50, 100]}
        />
      )}
    </div>
  );
}

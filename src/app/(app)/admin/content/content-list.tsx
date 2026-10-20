"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import { useContentListState } from "@/lib/content/domain/content-list-state";
import { useContentListData } from "@/lib/content/data/content-list";
import { writeContentListQuery } from "@/lib/content/domain/content-list-query";
import { ContentListToolbar } from "./content-list-toolbar";
import { ContentListTable } from "./content-list-table";

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
    serverPaginated: true,
  });
  const { setCurrentPage, setPageSize, tableContainerRef } = state;
  const onQueryChange = props.onQueryChange;
  const firstQueryRender = useRef(true);
  useEffect(() => {
    if (firstQueryRender.current) {
      firstQueryRender.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (state.currentPage > 1) params.set("page", String(state.currentPage));
    else params.delete("page");
    if (state.pageSize === 20) params.delete("pageSize");
    else params.set("pageSize", String(state.pageSize));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    onQueryChange?.();
  }, [onQueryChange, state.filters, state.sortField, state.sortDir, state.currentPage, state.pageSize]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    const cursor = Math.abs(page - state.currentPage) === 1
      ? (page > state.currentPage ? props.cursors?.next ?? null : props.cursors?.previous ?? null)
      : null;
    const params = writeContentListQuery(new URLSearchParams(window.location.search), {
      page, pageSize: state.pageSize, cursor, sortField: state.sortField, sortDir: state.sortDir,
    });
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [props.cursors, setCurrentPage, state.currentPage, state.pageSize, state.sortDir, state.sortField, tableContainerRef]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    const params = writeContentListQuery(new URLSearchParams(window.location.search), {
      page: 1, pageSize: size, cursor: null, sortField: state.sortField, sortDir: state.sortDir,
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [setPageSize, setCurrentPage, state.sortDir, state.sortField, tableContainerRef]);

  // 数据范围变化后 currentPage 可能越界：分页控件内部会把页码夹到最后一页，
  // 但切片若仍用原始页码就会「分页器显示第 1 页、表格却是空」；统一按有效页码切片与传值
  const totalPages = Math.max(1, props.totalPages ?? Math.ceil(processedRows.length / state.pageSize));
  const safeCurrentPage = Math.min(props.serverPage ?? state.currentPage, totalPages);
  const visibleRows = useMemo(() => processedRows, [processedRows]);

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
        highlightRules={state.filters.highlightRules}
      />

      {/* 极客级专业分页底栏（精准绑定当前队列实际数据量） */}
      {processedRows.length > 0 && (
        <TablePagination
          currentPage={safeCurrentPage}
          pageSize={state.pageSize}
          totalCount={props.totalVideosCount ?? processedRows.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[20, 30, 50, 100]}
        />
      )}
    </div>
  );
}

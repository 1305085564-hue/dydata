"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import { useContentListState } from "@/lib/content/domain/content-list-state";
import { useContentListData } from "@/lib/content/data/content-list";
import { writeContentListQuery, DEFAULT_CONTENT_PAGE_SIZE } from "@/lib/content/domain/content-list-query";
import { ContentListToolbar } from "./content-list-toolbar";
import { ContentListTable } from "./content-list-table";
import { DatePagination } from "./date-pagination";
import { resolveEffectiveDates } from "./content-list-filters";

/** 区间平移：按自然日加减后回写成 YYYY-MM-DD */
function shiftDateString(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ContentList(props: ContentListProps) {
  const state = useContentListState(props);
  const availableDates = props.availableDates ?? [];
  const availableCounts = props.availableCounts ?? [];
  const earliestAvailableDate = availableDates[availableDates.length - 1] ?? "";
  const latestAvailableDate = availableDates[0] ?? "";
  // 按日期分页：先把时间预设解析成实际生效的起止。单日（"昨天"/单日自定义）以那天为锚点；
  // 多日区间（近7天/近30天/本月/自定义起止）交给区间标签与整体平移；"最近一天"(all) 取名单里最新一天。
  const effectiveDates = resolveEffectiveDates(state.filters);
  const isRangeMode =
    Boolean(effectiveDates.effectiveStartDate && effectiveDates.effectiveEndDate)
    && effectiveDates.effectiveStartDate !== effectiveDates.effectiveEndDate;
  // 单日视图：末列显示时刻、底部页码栏隐藏。单日最多 30 条、整页数据都在手上，
  // 排序由前端按当前表头直接排（服务端的排序键来自 URL，单日默认排序不写 URL）
  const isSingleDay = !isRangeMode;
  const { processedRows } = useContentListData({
    videos: props.videos,
    snapshots: props.snapshots,
    reviewReadiness: props.reviewReadiness,
    contentQualityByVideoId: props.contentQualityByVideoId,
    filters: state.filters,
    sortField: state.sortField,
    sortDir: state.sortDir,
    serverPaginated: true,
    clientSort: isSingleDay,
  });
  const { setCurrentPage, setPageSize, tableContainerRef, handleDateChange, applyFilterPatch } = state;
  const currentDate = isRangeMode
    ? availableDates[0] ?? ""
    : effectiveDates.effectiveStartDate || availableDates[0] || "";

  /** 区间模式下按窗口自身长度整体前后平移，平移后自动转为自定义区间 */
  const handleShiftRange = useCallback((direction: -1 | 1) => {
    const start = effectiveDates.effectiveStartDate || earliestAvailableDate;
    const end = effectiveDates.effectiveEndDate || latestAvailableDate;
    if (!start || !end) return;
    const windowDays = Math.round(
      (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000,
    ) + 1;
    const shiftDays = direction === -1 ? -windowDays : windowDays;
    applyFilterPatch({
      timeRange: "custom",
      startDate: shiftDateString(start, shiftDays),
      endDate: shiftDateString(end, shiftDays),
    });
  }, [applyFilterPatch, earliestAvailableDate, latestAvailableDate, effectiveDates.effectiveEndDate, effectiveDates.effectiveStartDate]);
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
    if (state.pageSize === DEFAULT_CONTENT_PAGE_SIZE) params.delete("pageSize");
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

  // 日期导航对象：工具栏左段用
  const dateNav = currentDate && availableDates.length > 0
    ? {
        currentDate,
        availableDates,
        availableCounts,
        rangeStart: isRangeMode ? effectiveDates.effectiveStartDate : undefined,
        rangeEnd: isRangeMode ? effectiveDates.effectiveEndDate : undefined,
        isLoading: props.isViewLoading,
        onDateChange: handleDateChange,
        onShiftRange: handleShiftRange,
      }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 筛选工具栏：裸放于桌面，纯净无底无框，sticky 遮挡滚动 */}
      <ContentListToolbar {...props} {...state} dateNav={dateNav} />

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
        isSingleDay={isSingleDay}
        onSelectVideoId={props.onSelectVideoId}
        highlightRules={state.filters.highlightRules}
      />

      {/* 极客级专业分页底栏（精准绑定当前队列实际数据量） */}
      {!isSingleDay && processedRows.length > 0 && (
        <TablePagination
          currentPage={safeCurrentPage}
          pageSize={state.pageSize}
          totalCount={props.totalVideosCount ?? processedRows.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[50, 100, 500]}
        />
      )}
    </div>
  );
}

"use client";

import { addShanghaiDateOnly } from "@/lib/business-time";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import { useContentListState } from "@/lib/content/domain/content-list-state";
import { useContentListData } from "@/lib/content/data/content-list";
import { writeContentListQuery, DEFAULT_CONTENT_PAGE_SIZE } from "@/lib/content/domain/content-list-query";
import {
  hasNarrowingContentFilters,
  sumAvailableCountsForWindow,
} from "@/lib/content/domain/content-count-summary";
import { ContentListToolbar } from "./content-list-toolbar";
import { ContentListTable } from "./content-list-table";
import { ContentListFooter } from "./content-list-footer";
import { resolveEffectiveDates, writeContentListSort } from "@/lib/content/domain/content-list-filters";
import { buildContentPageUrl } from "./content-video-navigation";
import { buildContentHeadline, buildContentHeadlineSuffix, countGrades } from "./content-headline";
import { activeSegmentOf, segmentBaseKey, type ContentSegmentCounts } from "./content-segments";
import { DatePagination } from "./date-pagination";

const NO_DATES: string[] = [];
const NO_COUNTS: Array<{ d: string; c: number }> = [];

export const ContentList = memo(function ContentList(props: ContentListProps) {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();
  const state = useContentListState(props);
  const availableDates = props.availableDates ?? NO_DATES;
  const availableCounts = props.availableCounts ?? NO_COUNTS;
  const earliestAvailableDate = availableDates[availableDates.length - 1] ?? "";
  const latestAvailableDate = availableDates[0] ?? "";
  // 按日期分页：先把时间预设解析成实际生效的起止。单日（"昨天"/单日自定义）以那天为锚点；
  // 多日区间（近7天/近30天/本月/自定义起止）交给区间标签与整体平移；"最近一天"(all) 取名单里最新一天。
  const { effectiveStartDate, effectiveEndDate } = resolveEffectiveDates(state.filters);
  const isRangeMode =
    Boolean(effectiveStartDate && effectiveEndDate)
    && effectiveStartDate !== effectiveEndDate;
  // 单日视图：末列显示时刻、底部页码栏隐藏。单日最多 30 条、整页数据都在手上，
  // 排序由前端按当前表头直接排（服务端的排序键来自 URL，单日默认排序不写 URL）
  const isSingleDay = !isRangeMode;
  const { processedRows } = useContentListData({
    videos: props.videos,
    snapshots: props.snapshots,
    reviewReadiness: props.reviewReadiness,
    contentQualityByVideoId: props.contentQualityByVideoId,
    evaluationStandards: props.evaluationStandards,
    filters: state.filters,
    sortField: state.sortField,
    sortDir: state.sortDir,
    serverPaginated: true,
    clientSort: isSingleDay,
  });
  const { setCurrentPage, setPageSize, tableContainerRef, handleDateChange, applyFilterPatch } = state;
  const currentDate = isRangeMode
    ? availableDates[0] ?? ""
    : effectiveStartDate || availableDates[0] || "";

  /** 区间模式下按窗口自身长度整体前后平移，平移后自动转为自定义区间 */
  const handleShiftRange = useCallback((direction: -1 | 1) => {
    const start = effectiveStartDate || earliestAvailableDate;
    const end = effectiveEndDate || latestAvailableDate;
    if (!start || !end) return;
    const windowDays = Math.round(
      (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000,
    ) + 1;
    const shiftDays = direction === -1 ? -windowDays : windowDays;
    applyFilterPatch({
      timeRange: "custom",
      startDate: addShanghaiDateOnly(start, shiftDays),
      endDate: addShanghaiDateOnly(end, shiftDays),
    });
  }, [applyFilterPatch, earliestAvailableDate, latestAvailableDate, effectiveEndDate, effectiveStartDate]);
  const onQueryChange = props.onQueryChange;
  const queryKey = JSON.stringify([state.filters, state.sortField, state.sortDir, state.currentPage, state.pageSize]);
  const lastQueryKey = useRef(queryKey);
  useEffect(() => {
    // 首屏已由服务端取数；开发模式重放 effect 或相同条件重渲染都不再取一次。
    if (lastQueryKey.current === queryKey) return;
    lastQueryKey.current = queryKey;
    const params = new URLSearchParams(window.location.search);
    if (state.currentPage > 1) params.set("page", String(state.currentPage));
    else params.delete("page");
    if (state.pageSize === DEFAULT_CONTENT_PAGE_SIZE) params.delete("pageSize");
    else params.set("pageSize", String(state.pageSize));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    onQueryChange?.();
  }, [onQueryChange, queryKey, state.currentPage, state.pageSize]);

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

  // 页头与底栏计数：篇数以服务端按当前条件数出的总数为准；筛选时同时呈现未筛选总基数。
  const view = props.view ?? "all";
  const matchedCount = props.totalVideosCount ?? visibleRows.length;
  const hasNarrowingFilters = useMemo(
    () => hasNarrowingContentFilters(state.filters),
    [state.filters],
  );
  const fallbackWindowTotal = useMemo(() => {
    const startDate = isRangeMode ? effectiveStartDate : currentDate;
    const endDate = isRangeMode ? effectiveEndDate : currentDate;
    if (!startDate && !endDate) return null;
    return sumAvailableCountsForWindow(availableCounts, { startDate, endDate });
  }, [availableCounts, currentDate, effectiveEndDate, effectiveStartDate, isRangeMode]);
  const unfilteredTotal = typeof props.unfilteredTotalVideosCount === "number"
    ? props.unfilteredTotalVideosCount
    : fallbackWindowTotal;
  const headlineSuffix = buildContentHeadlineSuffix({
    view,
    matchedCount,
    dayTotal: unfilteredTotal,
    hasActiveFilters: hasNarrowingFilters,
    isRange: isRangeMode,
  });
  const fallbackHeadline = buildContentHeadline({
    view,
    currentDate,
    rangeStart: isRangeMode ? effectiveStartDate : undefined,
    rangeEnd: isRangeMode ? effectiveEndDate : undefined,
    matchedCount,
    dayTotal: unfilteredTotal,
    hasActiveFilters: hasNarrowingFilters,
  });

  // 分段计数：在「全部」下、整批作品都在手上时数一次并记住；切到「优」等分段后，
  // 只要其余条件（日期、负责人、搜索…）没变，各段继续显示这份数，不会因为只剩优作品而变成 0。
  const segmentKey = segmentBaseKey(state.filters, view);
  const canCountSegments = view === "all"
    && activeSegmentOf(state.filters) === "all"
    && totalPages <= 1
    && !props.isViewLoading;
  const freshCounts = useMemo<ContentSegmentCounts | null>(() => {
    if (!canCountSegments) return null;
    const grades = countGrades(visibleRows);
    return {
      all: matchedCount,
      excellent: grades.excellent,
      good: grades.good,
      fair: grades.fair,
      unrated: grades.unrated,
      anomaly: state.anomalyCountForTime,
    };
  }, [canCountSegments, matchedCount, state.anomalyCountForTime, visibleRows]);
  const [segmentMemo, setSegmentMemo] = useState<{ key: string; counts: ContentSegmentCounts } | null>(null);
  if (freshCounts && (segmentMemo?.key !== segmentKey || JSON.stringify(segmentMemo.counts) !== JSON.stringify(freshCounts))) {
    setSegmentMemo({ key: segmentKey, counts: freshCounts });
  }
  const segmentCounts = freshCounts ?? (segmentMemo?.key === segmentKey ? segmentMemo.counts : null);

  /** 区间模式下自选起止日期 */
  const handleRangeChange = useCallback((start: string, end: string) => {
    applyFilterPatch({
      timeRange: "custom",
      startDate: start,
      endDate: end,
    });
  }, [applyFilterPatch]);

  const buildVideoHref = useCallback((videoId: string) => {
    const raw = buildContentPageUrl({
      view: props.view ?? "all",
      perspective: props.perspective ?? "company",
      teamId: props.teamId ?? null,
      videoId,
      filters: state.filters,
      search: searchQuery,
    });
    const url = new URL(raw, "http://dummy");
    url.searchParams.delete("authorId");
    const sorted = writeContentListSort(url.searchParams, {
      sortField: state.sortField,
      sortDir: state.sortDir,
    });
    return `${url.pathname}?${sorted.toString()}`;
  }, [props.perspective, props.teamId, props.view, searchQuery, state.filters, state.sortDir, state.sortField]);

  const buildAuthorHref = useCallback((authorId: string) => {
    const raw = buildContentPageUrl({
      view: props.view ?? "all",
      perspective: props.perspective ?? "company",
      teamId: props.teamId ?? null,
      videoId: null,
      filters: state.filters,
      search: searchQuery,
    });
    const url = new URL(raw, "http://dummy");
    url.searchParams.set("authorId", authorId);
    const sorted = writeContentListSort(url.searchParams, {
      sortField: state.sortField,
      sortDir: state.sortDir,
    });
    return `${url.pathname}?${sorted.toString()}`;
  }, [props.perspective, props.teamId, props.view, searchQuery, state.filters, state.sortDir, state.sortField]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 页面唯一 h1：手机与平板（<1024px）顶部原位展示日期翻页器；桌面端（≥1024px）挪到底栏，仅保留单条读屏标题且不占布局空间 */}
      <h1
        aria-live="polite"
        className={
          view === "all"
            ? "font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413] tabular-nums lg:sr-only"
            : "font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413] tabular-nums"
        }
      >
        {view === "all" && currentDate && availableDates.length > 0 ? (
          <>
            <span className="hidden lg:inline">{fallbackHeadline}</span>
            <span data-top-date-pagination="mobile-only" className="lg:hidden">
              <DatePagination
                variant="headline"
                currentDate={currentDate}
                availableDates={availableDates}
                availableCounts={availableCounts}
                showCountInLabel={false}
                rangeStart={isRangeMode ? effectiveStartDate : undefined}
                rangeEnd={isRangeMode ? effectiveEndDate : undefined}
                isLoading={props.isViewLoading}
                onDateChange={handleDateChange}
                onShiftRange={handleShiftRange}
                timeRange={state.filters.timeRange}
                onTimeRangeChange={state.handleTimeRangeChange}
                onRangeChange={handleRangeChange}
                suffix={<span>{headlineSuffix}</span>}
              />
            </span>
          </>
        ) : (
          fallbackHeadline
        )}
      </h1>

      <ContentListToolbar {...props} {...state} segmentCounts={segmentCounts} />

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
        selectedVideoId={props.selectedVideoId}
        onSelectVideoId={props.onSelectVideoId}
        onSelectAuthor={props.onSelectAuthor}
        buildVideoHref={buildVideoHref}
        buildAuthorHref={buildAuthorHref}
        ownerNames={props.ownerNames}
        highlightRules={state.filters.highlightRules}
        evaluationStandards={props.evaluationStandards}
      />

      <ContentListFooter
        view={view}
        isSingleDay={isSingleDay}
        matchedCount={matchedCount}
        unfilteredTotal={unfilteredTotal}
        hasNarrowingFilters={hasNarrowingFilters}
        currentDate={currentDate}
        availableDates={availableDates}
        availableCounts={availableCounts}
        rangeStart={isRangeMode ? effectiveStartDate : undefined}
        rangeEnd={isRangeMode ? effectiveEndDate : undefined}
        isLoading={props.isViewLoading}
        timeRange={state.filters.timeRange}
        onDateChange={handleDateChange}
        onShiftRange={handleShiftRange}
        onTimeRangeChange={state.handleTimeRangeChange}
        onRangeChange={handleRangeChange}
        currentPage={safeCurrentPage}
        pageSize={state.pageSize}
        pageSizeOptions={[50, 100, 500]}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
});

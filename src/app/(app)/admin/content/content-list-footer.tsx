"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveContentCountDisplay } from "@/lib/content/domain/content-count-summary";
import { DatePagination } from "./date-pagination";

export interface ContentListFooterProps {
  view: "all" | "trash";
  isSingleDay: boolean;
  /** 当前筛选条件下真实命中总条数（服务端口径，非单页条数） */
  matchedCount: number;
  /** 当前日期窗口内未加收窄筛选时的真实总基数 */
  unfilteredTotal?: number | null;
  /** 是否存在非日期收窄筛选 */
  hasNarrowingFilters: boolean;
  /** 日期翻页器状态 */
  currentDate: string;
  availableDates: string[];
  availableCounts: Array<{ d: string; c: number }>;
  rangeStart?: string;
  rangeEnd?: string;
  isLoading?: boolean;
  timeRange: string;
  onDateChange: (date: string) => void;
  onShiftRange: (direction: -1 | 1) => void;
  onTimeRangeChange: (range: string) => void;
  onRangeChange: (start: string, end: string) => void;
  /** 多日分页状态 */
  currentPage: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function buildPageNumbers(safeCurrentPage: number, totalPages: number): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: Array<number | "ellipsis-left" | "ellipsis-right"> = [];
  if (safeCurrentPage <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push("ellipsis-right", totalPages);
  } else if (safeCurrentPage >= totalPages - 3) {
    pages.push(1, "ellipsis-left");
    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1, "ellipsis-left", safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, "ellipsis-right", totalPages);
  }
  return pages;
}

const PAGE_NAV_BUTTON =
  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center gap-1 rounded-md px-2 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#1F1E1D] transition cursor-pointer";

/**
 * 视频复盘列表底栏：
 * - 桌面端（≥1024px）：承接日期翻页器（释放顶部一整行垂直空间），日历弹层向上展开避免底边裁切；
 *   单日左「共 Y 条 / 命中 X / 共 Y 条」右「◀ 日期 ▶」；多日左统计、中区间平移、右页码控件。
 * - 手机/平板（<1024px）：日期翻页器保留在顶部原位不动，底栏仅在多日模式有数据时提供页码翻页与准确计数。
 */
export function ContentListFooter({
  view,
  isSingleDay,
  matchedCount,
  unfilteredTotal,
  hasNarrowingFilters,
  currentDate,
  availableDates,
  availableCounts,
  rangeStart,
  rangeEnd,
  isLoading = false,
  timeRange,
  onDateChange,
  onShiftRange,
  onTimeRangeChange,
  onRangeChange,
  currentPage,
  pageSize,
  pageSizeOptions = [50, 100, 500],
  onPageChange,
  onPageSizeChange,
}: ContentListFooterProps) {
  const countDisplay = resolveContentCountDisplay({
    matchedCount,
    unfilteredTotal,
    hasNarrowingFilters,
  });
  const totalPages = Math.max(1, Math.ceil(countDisplay.matchedCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = countDisplay.matchedCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, countDisplay.matchedCount);
  const pageNumbers = useMemo(
    () => buildPageNumbers(safeCurrentPage, totalPages),
    [safeCurrentPage, totalPages],
  );

  const showDatePagination = view === "all" && Boolean(currentDate) && availableDates.length > 0;
  const showPageControls = !isSingleDay && countDisplay.matchedCount > 0;

  const countNode = (
    <div className="flex flex-wrap items-center gap-1 text-[#1F1E1D] tabular-nums">
      <span>{countDisplay.text}</span>
      {showPageControls && (
        <>
          <span className="text-[#E2E2DF]">·</span>
          <span className="text-[#78716C]">
            显示 {startItem}-{endItem} 条
          </span>
        </>
      )}
    </div>
  );

  const renderPageSizeSelect = () => (
    <Select
      value={String(pageSize)}
      onValueChange={(value) => {
        if (value) onPageSizeChange(Number(value));
      }}
    >
      <SelectTrigger
        variant="borderless"
        size="sm"
        aria-label="每页显示条数"
        className="w-24 px-2 py-0 min-h-[44px] sm:min-h-0 transition-colors"
      >
        <SelectValue placeholder={`${pageSize} 条/页`} />
      </SelectTrigger>
      <SelectContent align="end" side="top" className="text-[12px]">
        {pageSizeOptions.map((opt) => (
          <SelectItem key={opt} value={String(opt)}>
            {opt} 条/页
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderPageButtons = (compactMobile: boolean) => (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={safeCurrentPage <= 1}
        onClick={() => onPageChange(safeCurrentPage - 1)}
        className={PAGE_NAV_BUTTON}
        aria-label="上一页"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        <span className={compactMobile ? "hidden sm:inline" : "inline"}>上一页</span>
      </button>

      {compactMobile ? (
        <span className="sm:hidden px-2 text-[12px] tabular-nums text-[#1F1E1D]">
          {safeCurrentPage} / {totalPages}
        </span>
      ) : null}

      <div className={compactMobile ? "hidden sm:inline-flex items-center gap-1 px-1" : "inline-flex items-center gap-1 px-1"}>
        {pageNumbers.map((page, idx) => {
          if (page === "ellipsis-left" || page === "ellipsis-right") {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="inline-flex h-7 w-5 items-center justify-center text-[12px] text-[#78716C] select-none"
              >
                …
              </span>
            );
          }
          const isCurrent = page === safeCurrentPage;
          return (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[12px] tabular-nums transition cursor-pointer ${
                isCurrent
                  ? "bg-[#F1F1F0] text-[#141413] pointer-events-none"
                  : "text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]"
              }`}
              aria-current={isCurrent ? "page" : undefined}
            >
              {page}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={safeCurrentPage >= totalPages}
        onClick={() => onPageChange(safeCurrentPage + 1)}
        className={PAGE_NAV_BUTTON}
        aria-label="下一页"
      >
        <span className={compactMobile ? "hidden sm:inline" : "inline"}>下一页</span>
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <footer aria-label="列表底栏" className="w-full select-none text-[12px] text-[#1F1E1D]">
      {/* 桌面端（≥1024px）：单日左总数右日期、多日左总数中区间右页码，日历弹层向上展开 */}
      {isSingleDay ? (
        <div
          data-content-footer="desktop-single-day"
          className="hidden lg:flex items-center justify-between gap-3 py-2 px-1"
        >
          <div data-content-count-summary="desktop">{countNode}</div>
          {showDatePagination && (
            <div data-desktop-date-pagination="true">
              <DatePagination
                variant="toolbar"
                popoverSide="top"
                popoverAlign="end"
                currentDate={currentDate}
                availableDates={availableDates}
                availableCounts={availableCounts}
                showCountInLabel={false}
                isLoading={isLoading}
                onDateChange={onDateChange}
                onShiftRange={onShiftRange}
                timeRange={timeRange}
                onTimeRangeChange={onTimeRangeChange}
                onRangeChange={onRangeChange}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          data-content-footer="desktop-range"
          className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 px-1"
        >
          <div data-content-count-summary="desktop" className="justify-self-start min-w-0">
            {countNode}
          </div>
          <div data-desktop-date-pagination="true" className="justify-self-center">
            {showDatePagination && (
              <DatePagination
                variant="toolbar"
                popoverSide="top"
                popoverAlign="center"
                currentDate={currentDate}
                availableDates={availableDates}
                availableCounts={availableCounts}
                showCountInLabel={false}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                isLoading={isLoading}
                onDateChange={onDateChange}
                onShiftRange={onShiftRange}
                timeRange={timeRange}
                onTimeRangeChange={onTimeRangeChange}
                onRangeChange={onRangeChange}
              />
            )}
          </div>
          <div className="justify-self-end flex items-center justify-end gap-3">
            {showPageControls && (
              <>
                {renderPageSizeSelect()}
                {renderPageButtons(false)}
              </>
            )}
          </div>
        </div>
      )}

      {/* 手机与平板（<1024px）：日期翻页器留在顶部原位，底栏仅在多日模式提供页码翻页 */}
      {showPageControls && (
        <div
          data-content-footer="mobile-range"
          className="flex lg:hidden flex-wrap items-center justify-between gap-3 py-2 px-1"
        >
          <div data-content-count-summary="mobile">{countNode}</div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {renderPageSizeSelect()}
            {renderPageButtons(true)}
          </div>
        </div>
      )}
    </footer>
  );
}

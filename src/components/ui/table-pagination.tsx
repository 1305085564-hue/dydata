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

export interface TablePaginationProps {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function TablePagination({
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 30, 50, 100],
  className = "",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalCount);

  // Generate page pill list with ellipsis
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "ellipsis-left" | "ellipsis-right")[] = [];

    if (safeCurrentPage <= 4) {
      for (let i = 1; i <= 5; i++) {
        pages.push(i);
      }
      pages.push("ellipsis-right");
      pages.push(totalPages);
    } else if (safeCurrentPage >= totalPages - 3) {
      pages.push(1);
      pages.push("ellipsis-left");
      for (let i = totalPages - 4; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      pages.push("ellipsis-left");
      pages.push(safeCurrentPage - 1);
      pages.push(safeCurrentPage);
      pages.push(safeCurrentPage + 1);
      pages.push("ellipsis-right");
      pages.push(totalPages);
    }

    return pages;
  }, [safeCurrentPage, totalPages]);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 py-2 px-1 select-none text-[12px] text-[#292524] ${className}`}
    >
      {/* 左侧：数据范围统计 */}
      <div className="flex items-center gap-1.5 text-[#292524]">
        <span>共</span>
        <span className="tabular-nums font-normal text-[#292524]">{totalCount}</span>
        <span>条</span>
        {totalCount > 0 && (
          <>
            <span className="text-[#E5E0D6]">·</span>
            <span>显示</span>
            <span className="tabular-nums font-normal text-[#292524]">
              {startItem}-{endItem}
            </span>
            <span>条</span>
          </>
        )}
      </div>

      {/* 右侧：翻页按键与页容量切换 */}
      <div className="flex items-center gap-3">
        {/* 容量切换器 (平铺无框) */}
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-[#292524]">
            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                if (val) {
                  onPageSizeChange(Number(val));
                }
              }}
            >
              <SelectTrigger className="h-7 w-24 rounded-md border-0 bg-transparent px-2 py-0 text-[11.5px] text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] focus-visible:ring-0 outline-none shadow-none transition-colors">
                <SelectValue placeholder={`${pageSize} 条/页`} />
              </SelectTrigger>
              <SelectContent align="end" className="text-[12px]">
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt} 条/页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 翻页按键群 */}
        <div className="inline-flex items-center gap-1">
          {/* 上一页 */}
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => onPageChange(safeCurrentPage - 1)}
            className="inline-flex h-7 items-center justify-center gap-0.5 rounded-md px-2 text-[11.5px] font-medium text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#292524] transition-all cursor-pointer active:scale-[0.985] active:duration-75"
            aria-label="上一页"
          >
            <ChevronLeft className="size-3.5" />
            <span>上一页</span>
          </button>

          {/* 页码微胶囊 */}
          <div className="inline-flex items-center gap-1 px-1">
            {pageNumbers.map((p, idx) => {
              if (p === "ellipsis-left" || p === "ellipsis-right") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="inline-flex h-7 w-5 items-center justify-center text-[11px] text-[#78716C] select-none"
                  >
                    …
                  </span>
                );
              }

              const isCurrent = p === safeCurrentPage;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11.5px] tabular-nums font-medium transition-all cursor-pointer ${
                    isCurrent
                      ? "bg-[#D97757]/10 text-[#D97757] font-medium pointer-events-none"
                      : "text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.985] active:duration-75"
                  }`}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* 下一页 */}
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => onPageChange(safeCurrentPage + 1)}
            className="inline-flex h-7 items-center justify-center gap-0.5 rounded-md px-2 text-[11.5px] font-medium text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#292524] transition-all cursor-pointer active:scale-[0.985] active:duration-75"
            aria-label="下一页"
          >
            <span>下一页</span>
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

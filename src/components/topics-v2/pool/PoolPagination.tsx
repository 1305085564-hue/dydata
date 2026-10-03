"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import type { TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";
import type { TopicPoolItem } from "../types";

export interface PoolPaginationProps {
  loading: boolean;
  totalCount: number;
  items: TopicPoolItem[];
  currentPage: number;
  pageWindow: number[];
  onPageChange: TopicPoolExplorerProps["onPageChange"];
}

export function PoolPagination({
  loading,
  totalCount,
  items,
  currentPage,
  pageWindow,
  onPageChange,
}: PoolPaginationProps) {
  return (
    <>
      {/* 底部分页器简化：页码按钮去灰底 */}
      {!loading && totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-1 select-none text-[12px] text-[#78716C] font-normal">
          <span>
            共 <strong className="tabular-nums font-normal text-[#141413]">{totalCount}</strong> 条干货选题，本页{" "}
            <strong className="tabular-nums font-normal text-[#141413]">{items.length}</strong> 条
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="m"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="上一页"
            >
              上一页
            </Button>
            {pageWindow.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                aria-current={currentPage === page ? "page" : undefined}
                className={`w-8 h-8 rounded-md text-[13px] transition-colors cursor-pointer ${
                  currentPage === page
                    ? "bg-white text-[#141413] font-normal shadow-input border border-[#E2E2DF]"
                    : "text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#141413]"
                }`}
              >
                {page}
              </button>
            ))}
            <Button
              variant="ghost"
              size="m"
              disabled={currentPage * 50 >= totalCount}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="下一页"
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
